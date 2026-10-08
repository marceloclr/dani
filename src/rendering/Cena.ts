// Viewport Three.js: uma malha por elemento (ADR-01), materiais compartilhados por cor, opacidade e estado.
// Renderiza sob demanda: só desenha quando a câmera ou o estado mudam.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { AJUSTE_PADRAO, passoAcabamento, temperaturaDoSol } from "./acabamento";
import { materialRealista, uvsPorProjecao, type Aparencia3D } from "./aparencia";
import { ESCALA_M, desenharTextura, type TipoTextura } from "./texturas";
import type { MalhaElemento } from "../bim/parseIfc";
import { parametros, type PosicaoElemento, type PosicaoFila } from "../fourd/animacao";
import type { Desvio, EstadoElemento, ModoAnimacao, PlantaSobreposta } from "../types";
import { distanciaDeEnquadramento, poseDaPosicao, poseDoPreset, posicaoDaPose, type Enquadramento, type Pose, type Preset } from "./cameras";
import { arvore, carregarFotos, criarFundo, montarChao, montarEntorno, neblina, tampamAVista, pessoa, semRepeticao, tingir, TOM_GRAMADO, type Foto, type MapasFoto } from "./ambiente";
import { aberturaDaPorta, anguloDaPorta, montarVoo, type EstadoPorta, type QuadroCamera, type Voo } from "./drone";
import type { Solido } from "./navegacao";
import { CLASSES_HUMANIZACAO } from "../fourd/regras";
import { direcaoDaLuz, luminarias, parametrosDoSol } from "./iluminacao";
import type { P3 } from "./navegacao";

const ehArvore = (m: MetaVisual | undefined) => !!m && m.ifcType === "IfcGeographicElement" && /copa|arvore|árvore|tree/i.test((m.material ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
/** Cores de aparência por acabamento concluído; "base" usa a cor do IFC. */
const APARENCIAS: Record<string, string> = { reboco: "#cfc9bd", pintura: "#f1ede4" };
const COR_EM_EXECUCAO = new THREE.Color("#c4a45e"); // --latao (escuro), legível nos dois temas
const COR_SELECAO = new THREE.Color("#3f5c78"); // --ardosia
/** Tom de referência (sRGB) a que cada foto é levada; ausente = a cor da própria foto. */
const TOM_FOTO: Partial<Record<Foto, [number, number, number]>> = {
  reboco: [206, 199, 186],
  madeira: [140, 104, 74],
  concreto: [150, 149, 143],
  "telha-metalica": [160, 166, 172],
  porcelanato: [222, 214, 198],
};
/** Tinta branca do realista: um tom abaixo do branco puro, para o relevo do reboco aparecer ao sol. */
const TINTA_BRANCA = new THREE.Color(0.87, 0.85, 0.81);
const COR_FANTASMA = new THREE.Color("#8d949d");
const COR_ATRASADO = new THREE.Color("#b54a4a"); // carmim
const COR_ADIANTADO = new THREE.Color("#4f7aa8"); // ardósia

export interface Camadas {
  /** Estado 4D por guid (camada de baixo). */
  estados: Map<string, EstadoElemento> | null;
  /** Override do usuário (OCULTAR). */
  ocultos: Set<string>;
  /** Isolamento: se definido, só esses elementos aparecem (camada de cima). */
  isolados: Set<string> | null;
  selecionado: string | null;
  modo: ModoAnimacao;
  fila: Map<string, PosicaoFila> | null;
  tipos: Map<string, string>;
  /** Modo Comparar (ADR-13): desvio de cada elemento; os estados são os reais. */
  desvios?: Map<string, Desvio> | null;
  /** Obra concluída: mostra a humanização (mobília e pessoas, ADR-23). Ausente = concluída. */
  concluida?: boolean;
}

/** Dados de um elemento usados para escolher o material realista. */
export interface MetaVisual {
  material: string | null;
  ifcType: string;
  objectType: string | null;
}

/** Desenha a cena num renderizador qualquer (viewport, vídeo, relatório) com a aparência atual. */
export interface Desenhista {
  /** `quadro` muda a semente da granulação (vídeo); sem ele, a granulação fica parada. */
  desenhar(camera: THREE.PerspectiveCamera, quadro?: number): void;
  redimensionar(largura: number, altura: number): void;
  dispose(): void;
}

export class Cena {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.05, 4000);
  readonly controls: OrbitControls;
  /** Enquanto verdadeiro, a viewport não redesenha (ex.: durante a geração de vídeo). */
  silencioso = false;
  private malhas = new Map<string, THREE.Mesh>();
  private corBase = new Map<string, THREE.Color>();
  private baseY = new Map<string, number>();
  /** Eixo horizontal mais longo e a borda mínima nele, para o avanço horizontal. */
  private eixoH = new Map<string, { eixo: "x" | "z"; min: number }>();
  private materiais = new Map<string, THREE.MeshStandardMaterial>();
  private caixa = new THREE.Box3();
  private pendente = false;
  private observador: ResizeObserver;
  private raycaster = new THREE.Raycaster();
  /** Contagem de desvios da última aplicação (modo Comparar), para os testes e a legenda. */
  ultimosDesvios = { atrasado: 0, adiantado: 0 };
  private girando = false;
  private planta: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null = null;
  private urlPlanta: string | null = null;
  private ultimoGiro = 0;
  // aparência (ADR-21)
  aparencia: Aparencia3D = "realista";
  private metas = new Map<string, MetaVisual>();
  private texturas = new Map<string, THREE.CanvasTexture>();
  private ceu: THREE.CanvasTexture | null = null;
  private corPapel = new THREE.Color("#f3f1ec");
  private ultimasCamadas: Camadas | null = null;
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0x8a8170, 1.6);
  private readonly sol = new THREE.DirectionalLight(0xffffff, 1.6);
  private readonly contraluz = new THREE.DirectionalLight(0xffffff, 0.5);
  private desenhista: Desenhista;
  // ambiente realista e humanização (ADR-23)
  private fotos: Map<Foto, MapasFoto> | null = null;
  /**
   * Sol da cena (ADR-26): direção na cena (unitária) e elevação em graus, vindos do sol real (local, data,
   * hora e norte da casa). A luz, o céu, a neblina e as luminárias saem da elevação.
   */
  private solDir: P3 = [0.6, 0.65, 0.45];
  private solElev = 40;
  /** Muda quando o sol anda o bastante para refazer o céu e os reflexos (cada desenhista confere). */
  private versaoCeu = 0;
  private concluida = true;
  /** Cota do piso do térreo (base das paredes): o chão das faixas de insolação. */
  private nivelPiso = 0;
  /** Insolação sobre a imagem (ADR-26): arco do sol, o sol e as faixas das fachadas ao sol. */
  private readonly insolacao = new THREE.Group();
  /** Luminárias da obra pronta (acendem no entardecer e à noite). */
  private readonly lampadas = new THREE.Group();
  private readonly prontoFotos: Promise<void>;
  private ambiente = new THREE.Group();
  private arvores = new Map<string, THREE.Group>();
  private pessoas = new THREE.Group();
  private vooCache: Voo | null = null;
  private fora = new Set<string>();
  /** Portas abertas pelo drone (ADR-23): abertura (0 a 1) e lado do giro. */
  private aberturas = new Map<string, EstadoPorta>();

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener("change", () => this.pedirQuadro());
    this.controls.autoRotateSpeed = 1.5;

    this.sol.position.set(30, 50, 20);
    this.contraluz.position.set(-30, 20, -40);
    this.scene.add(this.hemi, this.sol, this.sol.target, this.contraluz);
    this.desenhista = this.criarDesenhista(this.renderer, 1, 1);

    this.observador = new ResizeObserver(() => this.redimensionar());
    this.observador.observe(host);
    this.scene.add(this.ambiente, this.pessoas, this.lampadas, this.insolacao);
    this.atualizarTema();
    this.definirAparencia(this.aparencia);
    this.redimensionar();
    this.prontoFotos = carregarFotos().then((f) => {
      this.fotos = f;
      for (const [k, m] of this.materiais) if (k.startsWith("real|")) (m.dispose(), this.materiais.delete(k));
      this.montarAmbiente();
      if (this.ultimasCamadas) this.aplicar(this.ultimasCamadas);
    });
  }

  /** Espera as texturas fotográficas (o vídeo e o relatório só começam com elas prontas). */
  preparar(): Promise<void> {
    return this.prontoFotos;
  }

  /** Céu em degradê (fundo do modo realista). */
  private texturaCeu(): THREE.CanvasTexture {
    if (this.ceu) return this.ceu;
    const c = document.createElement("canvas");
    c.width = 4;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#7fa7d1");
    g.addColorStop(0.55, "#c4d7e8");
    g.addColorStop(1, "#eef1ee");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    this.ceu = new THREE.CanvasTexture(c);
    this.ceu.colorSpace = THREE.SRGBColorSpace;
    return this.ceu;
  }

  /** Troca entre Realista (texturas, sol com sombras, céu, oclusão de ambiente) e Técnica (cores lisas). */
  definirAparencia(a: Aparencia3D): void {
    this.aparencia = a;
    const real = a === "realista";
    this.scene.background = real ? this.texturaCeu() : this.corPapel;
    this.ambiente.visible = real;
    this.aplicarLuzDoSol();
    for (const m of this.malhas.values()) {
      const vidro = m.userData.opacidadeBase < 0.99;
      m.castShadow = real && !vidro && !m.userData.terreno;
      m.receiveShadow = real;
    }
    this.desenhista.dispose();
    this.desenhista = this.criarDesenhista(this.renderer, this.renderer.domElement.width, this.renderer.domElement.height);
    if (this.ultimasCamadas) this.aplicar(this.ultimasCamadas);
    else this.pedirQuadro();
  }

  /** Sombra do sol em 4.096 px (vídeo em qualidade máxima) ou 2.048 px (padrão). */
  sombraMaxima(sim: boolean): void {
    this.tamanhoDaSombra(sim ? 4096 : 2048);
  }

  /**
   * Muda o tamanho do mapa de sombra descartando o anterior (ADR-33): o three redimensiona o alvo existente
   * com texStorage2D, que falha numa textura imutável ("Texture is immutable") e deixa a cena sem sombra.
   */
  private tamanhoDaSombra(n: number): void {
    if (this.sol.shadow.mapSize.x === n && this.sol.shadow.mapSize.y === n) return;
    this.sol.shadow.mapSize.set(n, n);
    this.sol.shadow.map?.dispose();
    this.sol.shadow.map = null;
  }

  /**
   * Põe o sol (ADR-26): `dir` é a direção do sol na cena e `elevacao` a altura em graus (negativa à noite).
   * Refaz o céu e os reflexos só quando o sol anda mais de 0,5° ou o céu troca de dia para noite.
   */
  definirSol(dir: P3, elevacao: number): void {
    const n = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    const novo: P3 = [dir[0] / n, dir[1] / n, dir[2] / n];
    const cos = novo[0] * this.solDir[0] + novo[1] * this.solDir[1] + novo[2] * this.solDir[2];
    const trocaCeu = parametrosDoSol(elevacao).ceuNoturno !== parametrosDoSol(this.solElev).ceuNoturno;
    if (cos < Math.cos((0.5 * Math.PI) / 180) || trocaCeu) this.versaoCeu++;
    this.solDir = novo;
    this.solElev = elevacao;
    this.aplicarLuzDoSol();
    this.pedirQuadro();
  }

  /**
   * Desenha (ou apaga, com null) a insolação sobre a imagem, como no modulus: o arco tracejado do sol no
   * dia, o sol na hora, a linha até a casa e uma faixa laranja ao pé de cada fachada ao sol, com a
   * opacidade pelo cosseno da incidência. `arco` e `sol` são direções do sol na cena.
   */
  definirInsolacao(d: { arco: P3[]; sol: P3 | null; fachadas: Record<"frontal" | "lateral direita" | "fundos" | "lateral esquerda", number> } | null): void {
    this.insolacao.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.insolacao.clear();
    if (!d || this.caixa.isEmpty()) {
      this.pedirQuadro();
      return;
    }
    const c = this.caixa.getCenter(new THREE.Vector3());
    const r = this.caixa.getBoundingSphere(new THREE.Sphere()).radius;
    // cúpula do sol logo acima da casa (como no modulus, o sol fica dentro do lote), visível nas vistas
    const R = r * 1.15;
    const piso = this.nivelPiso + 0.03;
    const ponto = (v: P3) => new THREE.Vector3(c.x + v[0] * R, piso + v[1] * R, c.z + v[2] * R);
    const SOL = 0xf59e0b, SOL_CLARO = 0xfcd34d, SOL_ESCURO = 0xd97706;
    if (d.arco.length > 1) {
      const g = new THREE.BufferGeometry().setFromPoints(d.arco.map(ponto));
      const arco = new THREE.Line(g, new THREE.LineDashedMaterial({ color: SOL_ESCURO, dashSize: r * 0.12, gapSize: r * 0.08, transparent: true, opacity: 0.85, depthTest: false, fog: false }));
      arco.computeLineDistances();
      arco.renderOrder = 10;
      this.insolacao.add(arco);
    }
    if (d.sol && d.sol[1] > 0) {
      const p = ponto(d.sol);
      const disco = new THREE.Mesh(new THREE.SphereGeometry(r * 0.07, 24, 12), new THREE.MeshBasicMaterial({ color: SOL_CLARO, fog: false, toneMapped: false, depthTest: false }));
      disco.position.copy(p);
      disco.renderOrder = 12;
      const halo = new THREE.Mesh(new THREE.SphereGeometry(r * 0.12, 24, 12), new THREE.MeshBasicMaterial({ color: SOL_CLARO, transparent: true, opacity: 0.25, fog: false, toneMapped: false, depthWrite: false, depthTest: false }));
      halo.position.copy(p);
      halo.renderOrder = 11;
      const raio = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p, new THREE.Vector3(c.x, piso, c.z)]), new THREE.LineDashedMaterial({ color: SOL, dashSize: r * 0.05, gapSize: r * 0.06, transparent: true, opacity: 0.9, fog: false, depthTest: false }));
      raio.computeLineDistances();
      raio.renderOrder = 10;
      this.insolacao.add(disco, halo, raio);
    }
    // faixas ao pé das fachadas: frente em +z, fundos em −z, lateral direita em +x, esquerda em −x
    const b = this.caixa, larg = Math.max(0.25, r * 0.035), fora = larg * 0.8;
    const faixas: [keyof typeof d.fachadas, number, number, number, number][] = [
      ["frontal", (b.min.x + b.max.x) / 2, b.max.z + fora, b.max.x - b.min.x, larg],
      ["fundos", (b.min.x + b.max.x) / 2, b.min.z - fora, b.max.x - b.min.x, larg],
      ["lateral direita", b.max.x + fora, (b.min.z + b.max.z) / 2, larg, b.max.z - b.min.z],
      ["lateral esquerda", b.min.x - fora, (b.min.z + b.max.z) / 2, larg, b.max.z - b.min.z],
    ];
    for (const [f, x, z, w, dz] of faixas) {
      const k = d.fachadas[f];
      if (!(k > 0.05)) continue; // mesmo limiar do painel ("bate na fachada…")
      const faixa = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, dz), new THREE.MeshBasicMaterial({ color: SOL, transparent: true, opacity: 0.25 + 0.75 * k, fog: false, toneMapped: false, depthWrite: false }));
      faixa.position.set(x, piso + 0.03, z);
      faixa.name = `faixa-${f}`;
      this.insolacao.add(faixa);
    }
    this.pedirQuadro();
  }

  /** Faixas de insolação visíveis (para os testes). */
  get faixasDeInsolacao(): string[] {
    return this.insolacao.children.filter((o) => o.name.startsWith("faixa-")).map((o) => o.name.slice(6));
  }

  /** Sol atual (para os testes e a rosa dos ventos). */
  get estadoSol(): { dir: P3; elevacao: number } {
    return { dir: [...this.solDir] as P3, elevacao: this.solElev };
  }

  /** Luz, neblina e luminárias pela elevação do sol; a aparência técnica fica sempre clara. */
  private aplicarLuzDoSol(): void {
    const real = this.aparencia === "realista";
    const p = parametrosDoSol(real ? this.solElev : 40);
    this.scene.fog = real && !this.caixa.isEmpty() ? neblina(this.enquadramento().raio, p.corNeblina) : null;
    this.hemi.color.set(real ? p.corCeu : 0xffffff);
    this.hemi.groundColor.set(real ? p.corChao : 0x8a8170);
    this.hemi.intensity = real ? p.intensidadeCeu : 1.6;
    this.sol.color.set(real ? p.corSol : 0xffffff);
    this.sol.intensity = real ? p.intensidadeSol : 1.6;
    this.sol.castShadow = real;
    this.contraluz.intensity = real ? 0.25 * p.intensidadeCeu : 0.5;
    this.scene.environmentIntensity = p.intensidadeAmbiente;
    this.ajustarSol();
    this.atualizarLampadas(this.concluida);
  }

  /** Luminárias: luz pontual quente (2.700 K) e o disco aceso do spot no teto, no meio de cada cômodo. */
  private montarLampadas(): void {
    for (const o of this.lampadas.children) if (o instanceof THREE.Mesh) o.geometry.dispose();
    this.lampadas.clear();
    if (this.caixa.isEmpty()) return;
    const disco = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.58).multiplyScalar(6) });
    for (const l of luminarias(this.solidos())) {
      const luz = new THREE.PointLight(0xffc48a, 0, Math.max(6, l.folga * 4.5), 2);
      luz.position.set(...l.pos);
      luz.userData.base = 6 + l.folga * 4; // cômodos maiores, luz mais forte
      const spot = new THREE.Mesh(new THREE.CircleGeometry(0.07, 20), disco);
      spot.rotation.x = Math.PI / 2;
      spot.position.set(l.pos[0], l.pos[1] + 0.05, l.pos[2]);
      this.lampadas.add(luz, spot);
    }
  }

  /** Acende as luminárias conforme a luz e a obra pronta. */
  private atualizarLampadas(concluida: boolean): void {
    this.concluida = concluida;
    const k = this.aparencia === "realista" && concluida ? parametrosDoSol(this.solElev).luminarias : 0;
    this.lampadas.visible = k > 0;
    for (const o of this.lampadas.children) if (o instanceof THREE.PointLight) o.intensity = o.userData.base * k;
  }

  /** Ajusta a câmera de sombra do sol à casa (e um pouco além). */
  private ajustarSol(): void {
    if (this.caixa.isEmpty()) return;
    const c = this.caixa.getCenter(new THREE.Vector3());
    const r = this.caixa.getBoundingSphere(new THREE.Sphere()).radius + 6;
    // o sol real (ADR-26); abaixo do horizonte, a luz direcional vira o luar
    const d = direcaoDaLuz(this.solDir);
    this.sol.position.copy(c).add(new THREE.Vector3(d[0], d[1], d[2]).normalize().multiplyScalar(r * 2));
    this.sol.target.position.copy(c);
    const cam = this.sol.shadow.camera;
    cam.left = cam.bottom = -r;
    cam.right = cam.top = r;
    cam.near = 0.5;
    cam.far = r * 4;
    cam.updateProjectionMatrix();
    if (this.sol.shadow.mapSize.x < 2048) this.tamanhoDaSombra(2048);
    this.sol.shadow.bias = -0.0004;
    this.sol.shadow.normalBias = 0.03;
    this.sol.shadow.radius = 3;
  }

  /**
   * Prepara um renderizador (o da viewport ou um dedicado, do vídeo e do relatório) para desenhar a cena
   * com a aparência atual: mapeamento de tons, sombras, reflexos de ambiente e oclusão de ambiente (GTAO).
   */
  criarDesenhista(renderer: THREE.WebGLRenderer, largura: number, altura: number, opcoes: { maxima?: boolean } = {}): Desenhista {
    const real = this.aparencia === "realista";
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = real ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = real ? parametrosDoSol(this.solElev).exposicao : 1.0;
    renderer.shadowMap.enabled = real;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (!real) {
      return { desenhar: (cam) => renderer.render(this.scene, cam), redimensionar: () => {}, dispose: () => {} };
    }
    // céu e reflexos: alvos de renderização, então cada renderizador gera os seus
    const ceu = () => {
      const p = parametrosDoSol(this.solElev);
      return { sol: this.solDir, turbidez: p.turbidez, rayleigh: p.rayleigh, noturno: p.ceuNoturno };
    };
    let fundo = criarFundo(renderer, ceu());
    let versaoFundo = this.versaoCeu;
    const camBase = new THREE.PerspectiveCamera();
    // alvo com multiamostragem (MSAA): o composer, sem isso, perde o antialias do renderizador (ADR-24)
    const alvo = new THREE.WebGLRenderTarget(largura, altura, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(renderer, alvo);
    const passoCena = new RenderPass(this.scene, camBase);
    const gtao = new GTAOPass(this.scene, camBase, largura, altura);
    const amostras = opcoes.maxima ? 24 : 12;
    gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1, scale: 1.1, samples: amostras });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: amostras });
    gtao.blendIntensity = 0.9;
    // brilho só nas fontes de luz (LED e lâmpadas, emissivas e intensas): o limiar fica acima de uma
    // fachada branca ao sol (≈ 2,5 em luz linear), para o dia não estourar
    const brilho = new UnrealBloomPass(new THREE.Vector2(largura, altura), 0.18, 0.3, 4);
    brilho.enabled = parametrosDoSol(this.solElev).brilho; // de dia, o céu claro passaria do limiar e enevoaria a imagem
    const acabamento = passoAcabamento();
    composer.addPass(passoCena);
    composer.addPass(gtao);
    composer.addPass(brilho);
    composer.addPass(new OutputPass());
    composer.addPass(acabamento);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(largura, altura);
    return {
      desenhar: (cam, quadro) => {
        this.liberarVista(cam);
        // o sol andou: refaz o céu e os reflexos deste renderizador; exposição e brilho seguem o sol
        if (versaoFundo !== this.versaoCeu) {
          fundo.dispose();
          fundo = criarFundo(renderer, ceu());
          versaoFundo = this.versaoCeu;
        }
        const p = parametrosDoSol(this.solElev);
        renderer.toneMappingExposure = p.exposicao;
        brilho.enabled = p.brilho;
        const anterior = this.scene.environment, ceuAnterior = this.scene.background;
        this.scene.environment = fundo.environment;
        this.scene.background = fundo.background;
        passoCena.camera = cam;
        gtao.camera = cam;
        acabamento.definirQuadro(quadro ?? 0);
        acabamento.uniforms.temperatura.value = temperaturaDoSol(this.solElev);
        // tom azul do degradê só de dia: no entardecer o céu já tem cor (ADR-33)
        acabamento.uniforms.tomCeu.value = temperaturaDoSol(this.solElev) / AJUSTE_PADRAO.temperatura;
        composer.render();
        this.scene.environment = anterior;
        this.scene.background = ceuAnterior;
      },
      redimensionar: (w, h) => composer.setSize(w, h),
      dispose: () => {
        composer.dispose();
        gtao.dispose();
        brilho.dispose();
        acabamento.dispose();
        alvo.dispose();
        fundo.dispose();
      },
    };
  }

  /** Lê --papel do tema atual para o fundo da aparência técnica (a realista usa o céu). */
  atualizarTema(): void {
    const papel = getComputedStyle(document.documentElement).getPropertyValue("--papel").trim() || "#f3f1ec";
    this.corPapel = new THREE.Color(papel);
    if (this.aparencia === "tecnica") this.scene.background = this.corPapel;
    this.pedirQuadro();
  }

  private redimensionar(): void {
    const w = Math.max(this.host.clientWidth, 1);
    const h = Math.max(this.host.clientHeight, 1);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.desenhista?.redimensionar(this.renderer.domElement.width, this.renderer.domElement.height);
    this.pedirQuadro();
  }

  pedirQuadro(): void {
    if (this.pendente || this.silencioso) return;
    this.pendente = true;
    requestAnimationFrame(() => {
      this.pendente = false;
      if (!this.silencioso) this.desenhista.desenhar(this.camera);
    });
  }

  /** `foraDoEnquadramento`: elementos que não entram na caixa de enquadramento (ex.: terreno e árvores). */
  carregar(malhas: MalhaElemento[], foraDoEnquadramento: Set<string> = new Set(), metas: Map<string, MetaVisual> = new Map()): void {
    this.limpar();
    this.metas = metas;
    this.fora = foraDoEnquadramento;
    this.ultimasCamadas = null;
    for (const m of malhas) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(m.posicoes, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(m.normais, 3));
      geo.setAttribute("uv", new THREE.BufferAttribute(uvsPorProjecao(m.posicoes, m.normais), 2));
      geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      const cor = new THREE.Color().setRGB(m.cor[0], m.cor[1], m.cor[2], THREE.SRGBColorSpace);
      const malha = new THREE.Mesh(geo, this.material(cor, m.cor[3], false));
      malha.userData.guid = m.guid;
      malha.userData.opacidadeBase = m.cor[3];
      malha.userData.terreno = foraDoEnquadramento.has(m.guid);
      const real = this.aparencia === "realista";
      malha.castShadow = real && m.cor[3] >= 0.99 && !malha.userData.terreno;
      malha.receiveShadow = real;
      this.malhas.set(m.guid, malha);
      this.corBase.set(m.guid, cor);
      const b = geo.boundingBox!;
      this.baseY.set(m.guid, b.min.y);
      this.eixoH.set(m.guid, b.max.x - b.min.x >= b.max.z - b.min.z ? { eixo: "x", min: b.min.x } : { eixo: "z", min: b.min.z });
      this.scene.add(malha);
    }
    this.caixa.makeEmpty();
    for (const [guid, m] of this.malhas) if (!foraDoEnquadramento.has(guid)) this.caixa.union(m.geometry.boundingBox!);
    if (this.caixa.isEmpty()) for (const m of this.malhas.values()) this.caixa.union(m.geometry.boundingBox!);
    this.ajustarSol();
    this.vooCache = null;
    this.aplicarLuzDoSol();
    this.montarAmbiente();
    this.vista("isometrica");
  }

  /** Sólidos da obra (sem terreno), para a navegação do drone. */
  private solidos(): Solido[] {
    return [...this.malhas]
      .filter(([g]) => !this.fora.has(g))
      .map(([guid, m]) => ({ guid, ifcType: this.metas.get(guid)?.ifcType ?? "", posicoes: m.geometry.getAttribute("position").array as Float32Array, indices: m.geometry.getIndex()!.array }));
  }

  /** Voo de drone e passeio (ADR-23), calculado uma vez por modelo. */
  voo(): Voo | null {
    if (this.caixa.isEmpty()) return null;
    if (!this.vooCache) {
      const e = this.enquadramento();
      this.vooCache = montarVoo(this.solidos(), { min: this.caixa.min.toArray(), max: this.caixa.max.toArray() }, e.centro, e.raio);
    }
    return this.vooCache;
  }

  /** Esconde, neste quadro, as casas vizinhas e árvores do entorno que tampam a obra (ADR-31). */
  private liberarVista(cam: THREE.Camera): void {
    const grupos: THREE.Object3D[] = [];
    this.ambiente.traverse((o) => {
      if (o.userData.ocultavel) grupos.push(o);
    });
    if (!grupos.length || this.caixa.isEmpty()) return;
    const c = this.caixa.getCenter(new THREE.Vector3());
    const t = this.caixa;
    const alvos = [c, new THREE.Vector3(c.x, t.max.y, c.z), new THREE.Vector3(t.min.x, c.y, c.z), new THREE.Vector3(t.max.x, c.y, c.z), new THREE.Vector3(c.x, t.min.y + 0.5, t.max.z)];
    const caixas = grupos.map((o) => (o.userData.caixa ??= new THREE.Box3().setFromObject(o)) as THREE.Box3);
    const pos = cam.getWorldPosition(new THREE.Vector3());
    tampamAVista(pos, alvos, caixas).forEach((tampa, i) => (grupos[i].visible = !tampa));
  }

  /** Chão até o horizonte, cava, árvores e pessoas (aparência realista). */
  private montarAmbiente(): void {
    for (const o of [...this.ambiente.children, ...this.pessoas.children]) {
      o.traverse((x) => {
        if (x instanceof THREE.Mesh) x.geometry.dispose();
      });
    }
    this.ambiente.clear();
    this.pessoas.clear();
    this.arvores.clear();
    this.montarLampadas();
    if (this.caixa.isEmpty() || !this.fotos) return;
    // lote do IFC (terreno e paisagismo) ou, sem ele, a casa com folga
    const lote = new THREE.Box3();
    let semente = 1;
    for (const g of this.fora) {
      const m = this.malhas.get(g)!;
      if (ehArvore(this.metas.get(g))) {
        const a = arvore(m.geometry.boundingBox!, semente++ * 97);
        this.arvores.set(g, a);
        this.ambiente.add(a);
      } else lote.union(m.geometry.boundingBox!);
    }
    const paredes = [...this.malhas].filter(([g]) => /IfcWall/.test(this.metas.get(g)?.ifcType ?? "")).map(([, m]) => m.geometry.boundingBox!.min.y);
    const piso = paredes.length ? Math.min(...paredes) : this.caixa.min.y;
    this.nivelPiso = piso;
    const buraco = lote.isEmpty()
      ? { x0: this.caixa.min.x - 0.8, x1: this.caixa.max.x + 0.8, z0: this.caixa.min.z - 0.8, z1: this.caixa.max.z + 0.8 }
      : { x0: lote.min.x, x1: lote.max.x, z0: lote.min.z, z1: lote.max.z };
    const y = lote.isEmpty() ? piso - 0.02 : lote.max.y - 0.05;
    this.ambiente.add(montarChao(this.fotos, buraco, y, Math.min(this.caixa.min.y, y - 0.5) - 0.1));
    // rua, calçada, muros, vizinhos e árvores: a casa num lote urbano, não num campo vazio (ADR-31)
    const e = this.enquadramento();
    const voo = this.voo();
    // mureta com gradil da frente até a fachada, portão no eixo da porta de entrada (ADR-33)
    this.ambiente.add(montarEntorno(this.fotos, buraco, y, e.centro, e.raio, { zFachada: this.caixa.max.z, xPorta: voo?.entrada?.centro[0] ?? null }));
    voo?.pessoas.forEach((p, i) => this.pessoas.add(pessoa(p.pos, p.olhar, 31 + i * 17)));
    this.pessoas.visible = false;
    this.ambiente.visible = this.aparencia === "realista";
  }

  /**
   * Abre as portas perto da câmera do drone (ou fecha todas, com null): a folha gira na dobradiça
   * até 90° para o lado em que o drone segue, e o drone passa pelo vão sem atravessá-la.
   */
  atualizarPortas(cam: THREE.Vector3 | null): void {
    const voo = cam ? this.voo() : this.vooCache;
    this.aberturas.clear();
    if (cam && voo) for (const f of voo.folhas) {
      const a = aberturaDaPorta(f, [cam.x, cam.y, cam.z]);
      if (a > 0) this.aberturas.set(f.guid, { abertura: a, lado: f.lado });
    }
    this.aplicarPortas();
    this.pedirQuadro();
  }

  /** Estado das portas num instante do voo automático (calculado pelo tempo, não pela proximidade). */
  definirPortas(portas: Map<string, EstadoPorta> | null): void {
    this.aberturas = new Map(portas ?? []);
    this.aplicarPortas();
    this.pedirQuadro();
  }

  private aplicarPortas(): void {
    const voo = this.vooCache;
    if (!voo) return;
    for (const f of voo.folhas) {
      const m = this.malhas.get(f.guid);
      if (!m) continue;
      const e = this.aberturas.get(f.guid);
      const a = e?.abertura ?? 0;
      const t = anguloDaPorta(f, a, e?.lado), c = Math.cos(t), s = Math.sin(t);
      const [hx, hz] = f.dobradica;
      // giro em torno do eixo vertical da dobradiça (a geometria já está em coordenadas da cena)
      m.rotation.y = t;
      m.position.x = a > 0 ? hx - (hx * c + hz * s) : m.position.x;
      m.position.z = a > 0 ? hz - (-hx * s + hz * c) : m.position.z;
      if (a === 0) m.rotation.y = 0;
    }
  }

  /** Coloca uma câmera num quadro livre do voo de drone. */
  posicionarLivre(camera: THREE.PerspectiveCamera, q: QuadroCamera): void {
    if (q.portas) this.definirPortas(q.portas);
    camera.position.set(q.pos[0], q.pos[1], q.pos[2]);
    camera.up.set(0, 1, 0);
    camera.fov = q.fov;
    camera.near = 0.05;
    camera.far = Math.max(this.enquadramento().raio * 80, 1500);
    camera.lookAt(q.alvo[0], q.alvo[1], q.alvo[2]);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  /** Cota da base de um elemento (para ordenar pavimentos). */
  baseDe(guid: string): number | undefined {
    return this.baseY.get(guid);
  }

  /** Posição de cada elemento, para a fila do modo Por fases. */
  posicoes(): PosicaoElemento[] {
    return [...this.malhas].map(([guid, m]) => {
      const b = m.geometry.boundingBox!;
      return { guid, baseY: b.min.y, frente: b.max.z, lado: (b.min.x + b.max.x) / 2 };
    });
  }

  enquadramento(): Enquadramento {
    const s = this.caixa.getBoundingSphere(new THREE.Sphere());
    return { centro: [s.center.x, s.center.y, s.center.z], raio: Math.max(s.radius, 0.5) };
  }

  private material(cor: THREE.Color, opacidade: number, selecionado: boolean): THREE.MeshStandardMaterial {
    const op = Math.round(opacidade * 20) / 20; // limita o número de materiais
    const chave = `${cor.getHexString()}|${op}|${selecionado ? 1 : 0}`;
    let m = this.materiais.get(chave);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: cor,
        roughness: 0.85,
        metalness: 0,
        transparent: op < 0.99,
        opacity: op,
        depthWrite: op >= 0.99,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      if (selecionado) {
        m.emissive = COR_SELECAO;
        m.emissiveIntensity = 0.55;
      }
      this.materiais.set(chave, m);
    }
    return m;
  }

  private textura(tipo: TipoTextura, cor: THREE.Color | null): THREE.CanvasTexture {
    const chave = `${tipo}|${cor ? cor.getHexString() : ""}`;
    let t = this.texturas.get(chave);
    if (!t) {
      t = new THREE.CanvasTexture(desenharTextura(tipo, 512, cor ? [cor.r, cor.g, cor.b] : undefined));
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      const [eu, ev] = ESCALA_M[tipo];
      t.repeat.set(1 / eu, 1 / ev);
      t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      this.texturas.set(chave, t);
    }
    return t;
  }

  /** Material realista de um elemento (ADR-21), compartilhado entre elementos iguais. */
  private materialReal(guid: string, acabamento: string, opacidade: number, selecionado: boolean): THREE.MeshStandardMaterial {
    const meta = this.metas.get(guid) ?? { material: null, ifcType: "", objectType: null };
    const r = materialRealista(meta.material, meta.ifcType, acabamento, meta.objectType);
    const cor = r.usarCorIfc ? this.corBase.get(guid)! : null;
    const op = Math.round((r.opacidade ?? opacidade) * 20) / 20;
    const chave = `real|${r.textura}|${cor?.getHexString() ?? ""}|${op}|${r.rugosidade}|${r.metalico}|${selecionado ? 1 : 0}`;
    let m = this.materiais.get(chave);
    if (!m) {
      m = this.criarMaterialReal(r.textura, r.rugosidade, r.metalico, r.relevo, cor, op);
      if (selecionado) {
        m.emissive = COR_SELECAO;
        m.emissiveIntensity = 0.55;
      }
      this.materiais.set(chave, m);
    }
    return m;
  }

  /**
   * Material realista (ADR-24): foto PBR (cor, relevo e rugosidade) quando ela carregou, tingida até o
   * tom de referência do material; sem foto, a textura procedural do ADR-21. Pintura usa a cor da tinta
   * com o relevo da foto do reboco. Vidro e piso são materiais físicos (reflexo e verniz).
   */
  private criarMaterialReal(tipo: TipoTextura, rugosidade: number, metalico: number, relevo: number, cor: THREE.Color | null, op: number): THREE.MeshStandardMaterial {
    const comuns = { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, transparent: op < 0.99, opacity: op, depthWrite: op >= 0.99 };
    const fotoDe = (t: TipoTextura) => (t === "pintura" ? this.fotos?.get("reboco") : t === "liso" || t === "folhagem" ? undefined : this.fotos?.get(t as Foto));
    const foto = fotoDe(tipo);
    if (tipo === "liso" && op < 0.99) {
      // vidro: reflexo do céu e transparência
      return new THREE.MeshPhysicalMaterial({ ...comuns, color: cor ?? new THREE.Color(0.8, 0.88, 0.9), roughness: 0.04, metalness: 0, ior: 1.5, specularIntensity: 1, envMapIntensity: 1.6 });
    }
    if (foto && tipo === "pintura") {
      const mapa = this.textura("pintura", cor ?? TINTA_BRANCA);
      const m = new THREE.MeshStandardMaterial({ ...comuns, map: mapa, normalMap: foto.normalMap, roughnessMap: foto.roughnessMap, roughness: 1, metalness: 0 });
      m.normalScale.set(0.35, 0.35);
      return m;
    }
    if (foto) {
      const Classe = tipo === "porcelanato" ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
      const m = new Classe({ ...comuns, map: foto.map, normalMap: foto.normalMap, roughnessMap: foto.roughnessMap, roughness: Math.min(1, rugosidade + 0.15), metalness: metalico });
      const alvo = TOM_FOTO[tipo as Foto];
      if (alvo) m.color.setRGB(...tingir(tipo as Foto, alvo));
      if (tipo === "grama") m.color.setRGB(...tingir("grama", TOM_GRAMADO)); // verde seco de lote, não marrom (ADR-33)
      if (m instanceof THREE.MeshPhysicalMaterial) {
        m.clearcoat = 0.35;
        m.clearcoatRoughness = 0.12;
      }
      m.normalScale.set(0.9, 0.9);
      return tipo === "reboco" || tipo === "concreto" || tipo === "terra" || tipo === "grama" ? semRepeticao(m) : m;
    }
    const mapa = this.textura(tipo, tipo === "liso" || tipo === "pintura" ? (cor ?? TINTA_BRANCA) : null);
    return new THREE.MeshStandardMaterial({ ...comuns, map: mapa, roughness: rugosidade, metalness: metalico, bumpMap: relevo > 0 ? mapa : null, bumpScale: relevo });
  }

  /** Aplica as camadas: estado 4D (com o modo de animação) < ocultos pelo usuário < isolamento (ADR-02). */
  aplicar(c: Camadas): void {
    this.ultimasCamadas = c;
    const real = this.aparencia === "realista";
    this.ultimosDesvios = { atrasado: 0, adiantado: 0 };
    for (const [guid, malha] of this.malhas) {
      const estado = c.estados?.get(guid);
      let visivel = estado ? estado.visivel : true;
      if (c.ocultos.has(guid)) visivel = false;
      if (c.isolados && !c.isolados.has(guid)) visivel = false;

      const desvio = c.desvios?.get(guid);
      if (desvio === "atrasado") visivel = !c.ocultos.has(guid) && !(c.isolados && !c.isolados.has(guid)); // o que devia existir aparece, marcado
      const p = estado ? parametros(estado, c.modo, c.tipos.get(guid) ?? "", c.fila?.get(guid)) : { opacidade: 1, escalaY: 1 };
      const opacidadeBase = malha.userData.opacidadeBase as number;
      if (p.opacidade * opacidadeBase < 0.025) visivel = false;
      // humanização (ADR-23): a mobília só aparece com a obra pronta
      const tipo = this.metas.get(guid)?.ifcType ?? "";
      if (CLASSES_HUMANIZACAO.has(tipo)) visivel = (c.concluida ?? true) && !c.ocultos.has(guid) && !(c.isolados && !c.isolados.has(guid));
      malha.visible = visivel;
      const arv = this.arvores.get(guid);
      if (arv) {
        arv.visible = visivel && real;
        if (real) malha.visible = false;
      }
      // crescimento: escala vertical com pivô na base; avanço horizontal com pivô na borda mínima
      const by = this.baseY.get(guid)!;
      malha.scale.set(1, p.escalaY, 1);
      malha.position.set(0, by * (1 - p.escalaY), 0);
      if (p.escalaH !== undefined) {
        const h = this.eixoH.get(guid)!;
        malha.scale[h.eixo] = p.escalaH;
        malha.position[h.eixo] = h.min * (1 - p.escalaH);
      }
      if (!visivel) continue;
      if (arv && real) continue;

      const base = this.corBase.get(guid)!;
      const sel = c.selecionado === guid;
      if (desvio === "atrasado") {
        this.ultimosDesvios.atrasado++;
        malha.scale.set(1, 1, 1);
        malha.position.set(0, 0, 0);
        malha.material = this.material(estado?.visivel ? base.clone().lerp(COR_ATRASADO, 0.75) : COR_ATRASADO, estado?.visivel ? opacidadeBase : 0.4, sel);
        continue;
      }
      if (desvio === "adiantado") {
        this.ultimosDesvios.adiantado++;
        malha.material = this.material(base.clone().lerp(COR_ADIANTADO, 0.7), opacidadeBase * p.opacidade, sel);
        continue;
      }
      // realista: materiais com textura e sem a cor de "em execução" (a revelação progressiva já mostra o avanço)
      if (real && (!estado || estado.fase === "concluido" || estado.fase === "em-execucao")) {
        malha.material = this.materialReal(guid, estado?.aparencia ?? "base", opacidadeBase * p.opacidade, sel);
        continue;
      }
      // no Progressivo, o elemento que já se formou ganha a cor final sem esperar o fim da tarefa
      if (!estado || estado.fase === "concluido" || (estado.fase === "em-execucao" && p.formado)) {
        const ap = estado && APARENCIAS[estado.aparencia];
        malha.material = this.material(ap ? new THREE.Color(ap) : base, opacidadeBase * p.opacidade, sel);
      } else if (estado.fase === "em-execucao") {
        const ap = APARENCIAS[estado.aparencia];
        malha.material = this.material((ap ? new THREE.Color(ap) : base.clone()).lerp(COR_EM_EXECUCAO, 0.85), opacidadeBase * p.opacidade, sel);
      } else if (estado.fase === "fantasma") {
        malha.material = this.material(COR_FANTASMA, 0.15, sel);
      }
    }
    this.pessoas.visible = real && (c.concluida ?? true) && !c.isolados;
    this.atualizarLampadas((c.concluida ?? true) && !c.isolados);
    this.aplicarPortas();
    this.pedirQuadro();
  }

  /** Caixa da casa em planta (x e z), para posicionar a planta sobreposta. */
  caixaPlanta(): { x0: number; x1: number; z0: number; z1: number } | null {
    if (this.caixa.isEmpty()) return null;
    return { x0: this.caixa.min.x, x1: this.caixa.max.x, z0: this.caixa.min.z, z1: this.caixa.max.z };
  }

  /** Planta sobreposta (§29): textura num plano horizontal logo acima do contrapiso. */
  definirPlanta(p: PlantaSobreposta | null, url: string | null): void {
    if (!p || !url) {
      if (this.planta) {
        this.scene.remove(this.planta);
        this.planta.geometry.dispose();
        this.planta.material.map?.dispose();
        this.planta.material.dispose();
        this.planta = null;
        this.urlPlanta = null;
      }
      this.pedirQuadro();
      return;
    }
    if (!this.planta) {
      const geo = new THREE.PlaneGeometry(1, 1);
      geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      this.planta = new THREE.Mesh(geo, mat);
      this.planta.renderOrder = 1;
      this.scene.add(this.planta);
    }
    if (url !== this.urlPlanta) {
      this.urlPlanta = url;
      this.planta.material.map?.dispose();
      const tex = new THREE.TextureLoader().load(url, () => this.pedirQuadro());
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      this.planta.material.map = tex;
      this.planta.material.needsUpdate = true;
    }
    this.planta.visible = p.visivel;
    this.planta.material.opacity = p.opacidade;
    this.planta.scale.set(p.larguraM, 1, p.larguraM * p.proporcao);
    this.planta.position.set(p.x, 0.03, p.z);
    this.planta.rotation.y = THREE.MathUtils.degToRad(-p.rotacaoGraus);
    this.pedirQuadro();
  }

  /** Imagem da cena numa resolução qualquer, para o relatório (PNG). */
  async capturar(largura: number, altura: number, pose: Pose): Promise<Blob> {
    await this.prontoFotos;
    const canvas = document.createElement("canvas");
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    const d = this.criarDesenhista(r, largura, altura);
    try {
      r.setPixelRatio(1);
      r.setSize(largura, altura, false);
      d.redimensionar(largura, altura);
      const cam = new THREE.PerspectiveCamera(45, largura / altura, 0.05, 4000);
      this.posicionar(cam, pose);
      d.desenhar(cam);
      return await new Promise<Blob>((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error("toBlob falhou"))), "image/jpeg", 0.9));
    } finally {
      d.dispose();
      r.dispose();
      r.forceContextLoss();
    }
  }

  /** guid do elemento sob o ponteiro (coordenadas do cliente). */
  escolher(x: number, y: number): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(ndc, this.camera);
    const visiveis = [...this.malhas.values()].filter((m) => m.visible);
    const hit = this.raycaster.intersectObjects(visiveis, false)[0];
    return (hit?.object.userData.guid as string | undefined) ?? null;
  }

  /** guids visíveis agora (usado nos testes de ponta a ponta). */
  visiveis(): string[] {
    return [...this.malhas].filter(([, m]) => m.visible).map(([g]) => g);
  }

  /** Posição na tela (coordenadas do cliente) de um ponto da cena. */
  projetar(x: number, y: number, z: number): { x: number; y: number } {
    this.camera.updateMatrixWorld();
    const p = new THREE.Vector3(x, y, z).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  /** Coloca uma câmera na pose dada, para a proporção dessa câmera. */
  posicionar(camera: THREE.PerspectiveCamera, pose: Pose): void {
    const e = this.enquadramento();
    camera.fov = 45; // o drone usa lente mais aberta; os presets e o roteiro voltam à de 45°
    const dEnq = distanciaDeEnquadramento(e.raio, camera.fov, camera.aspect);
    const [x, y, z] = posicaoDaPose(pose, dEnq);
    camera.position.set(x, y, z);
    camera.up.set(0, 1, 0);
    camera.near = Math.max(dEnq * pose.dist * 0.01, 0.05);
    camera.far = dEnq * 30;
    camera.lookAt(pose.alvo[0], pose.alvo[1], pose.alvo[2]);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  /** Pose atual da viewport (para capturar no roteiro do vídeo). */
  poseAtual(): Pose {
    const e = this.enquadramento();
    const dEnq = distanciaDeEnquadramento(e.raio, this.camera.fov, this.camera.aspect);
    const p = this.camera.position, t = this.controls.target;
    return poseDaPosicao([p.x, p.y, p.z], [t.x, t.y, t.z], dEnq);
  }

  /** Presets de câmera; Órbita liga e desliga a rotação automática. */
  vista(v: Preset): boolean {
    if (v === "orbita") return this.alternarGiro();
    this.pararGiro();
    this.mostrarPose(poseDoPreset(v, this.enquadramento()));
    return false;
  }

  /** Leva a câmera da viewport a uma pose (presets e prévia do roteiro). */
  mostrarPose(pose: Pose): void {
    this.posicionar(this.camera, pose);
    this.controls.target.set(pose.alvo[0], pose.alvo[1], pose.alvo[2]);
    this.controls.update();
    this.pedirQuadro();
  }

  /** Enquadra a casa inteira mantendo o ângulo atual. */
  casaInteira(): void {
    const atual = this.poseAtual();
    this.mostrarPose({ ...atual, dist: 1, alvo: this.enquadramento().centro });
  }

  focar(guid: string): void {
    const m = this.malhas.get(guid);
    if (!m) return;
    const s = m.geometry.boundingSphere!;
    const e = this.enquadramento();
    const atual = this.poseAtual();
    this.mostrarPose({ ...atual, alvo: [s.center.x, s.center.y, s.center.z], dist: Math.max((s.radius * 2.2) / e.raio, 0.08) });
  }

  get emOrbita(): boolean {
    return this.girando;
  }

  private alternarGiro(): boolean {
    if (this.girando) {
      this.pararGiro();
      return false;
    }
    this.girando = true;
    this.controls.autoRotate = true;
    this.ultimoGiro = performance.now();
    const passo = (agora: number) => {
      if (!this.girando) return;
      this.controls.update((agora - this.ultimoGiro) / 1000);
      this.ultimoGiro = agora;
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
    return true;
  }

  pararGiro(): void {
    this.girando = false;
    this.controls.autoRotate = false;
  }

  private limpar(): void {
    this.vooCache = null;
    for (const m of this.malhas.values()) {
      m.geometry.dispose();
      this.scene.remove(m);
    }
    for (const mat of this.materiais.values()) mat.dispose();
    this.malhas.clear();
    this.corBase.clear();
    this.baseY.clear();
    this.eixoH.clear();
    this.materiais.clear();
  }

  dispose(): void {
    this.pararGiro();
    this.definirPlanta(null, null);
    this.desenhista.dispose();
    for (const t of this.texturas.values()) t.dispose();
    this.ceu?.dispose();
    this.limpar();
    this.observador.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
