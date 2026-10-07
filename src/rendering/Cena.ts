// Viewport Three.js: uma malha por elemento (ADR-01), materiais compartilhados por cor, opacidade e estado.
// Renderiza sob demanda: só desenha quando a câmera ou o estado mudam.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { materialRealista, uvsPorProjecao, type Aparencia3D } from "./aparencia";
import { ESCALA_M, desenharTextura, type TipoTextura } from "./texturas";
import type { MalhaElemento } from "../bim/parseIfc";
import { parametros, type PosicaoElemento, type PosicaoFila } from "../fourd/animacao";
import type { Desvio, EstadoElemento, ModoAnimacao, PlantaSobreposta } from "../types";
import { distanciaDeEnquadramento, poseDaPosicao, poseDoPreset, posicaoDaPose, type Enquadramento, type Pose, type Preset } from "./cameras";
import { arvore, carregarFotos, criarFundo, montarChao, neblina, pessoa, semRepeticao, type Foto, type MapasFoto } from "./ambiente";
import { montarVoo, type QuadroCamera, type Voo } from "./drone";
import type { Solido } from "./navegacao";
import { CLASSES_HUMANIZACAO } from "../fourd/regras";

const ehArvore = (m: MetaVisual | undefined) => !!m && m.ifcType === "IfcGeographicElement" && /copa|arvore|árvore|tree/i.test((m.material ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
/** Cores de aparência por acabamento concluído; "base" usa a cor do IFC. */
const APARENCIAS: Record<string, string> = { reboco: "#cfc9bd", pintura: "#f1ede4" };
const COR_EM_EXECUCAO = new THREE.Color("#c4a45e"); // --latao (escuro), legível nos dois temas
const COR_SELECAO = new THREE.Color("#3f5c78"); // --ardosia
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
  desenhar(camera: THREE.PerspectiveCamera): void;
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
  private readonly prontoFotos: Promise<void>;
  private ambiente = new THREE.Group();
  private arvores = new Map<string, THREE.Group>();
  private pessoas = new THREE.Group();
  private vooCache: Voo | null = null;
  private fora = new Set<string>();

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
    this.scene.add(this.ambiente, this.pessoas);
    this.atualizarTema();
    this.definirAparencia(this.aparencia);
    this.redimensionar();
    this.prontoFotos = carregarFotos().then((f) => {
      this.fotos = f;
      for (const [k, m] of this.materiais) if (k.startsWith("real|terra") || k.startsWith("real|grama")) (m.dispose(), this.materiais.delete(k));
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
    this.scene.fog = real && !this.caixa.isEmpty() ? neblina(this.enquadramento().raio) : null;
    this.ambiente.visible = real;
    this.hemi.color.set(real ? 0xdde8f4 : 0xffffff);
    this.hemi.groundColor.set(real ? 0x6e5c46 : 0x8a8170);
    this.hemi.intensity = real ? 1.1 : 1.6;
    this.sol.color.set(real ? 0xfff0dc : 0xffffff);
    this.sol.intensity = real ? 2.8 : 1.6;
    this.sol.castShadow = real;
    this.contraluz.intensity = real ? 0.25 : 0.5;
    this.scene.environmentIntensity = 0.45;
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

  /** Ajusta a câmera de sombra do sol à casa (e um pouco além). */
  private ajustarSol(): void {
    if (this.caixa.isEmpty()) return;
    const c = this.caixa.getCenter(new THREE.Vector3());
    const r = this.caixa.getBoundingSphere(new THREE.Sphere()).radius + 6;
    // sol da frente e da direita: fachadas da frente iluminadas e sombras para trás e para a esquerda, à vista da câmera isométrica
    this.sol.position.copy(c).add(new THREE.Vector3(0.65, 0.7, 0.35).normalize().multiplyScalar(r * 2));
    this.sol.target.position.copy(c);
    const cam = this.sol.shadow.camera;
    cam.left = cam.bottom = -r;
    cam.right = cam.top = r;
    cam.near = 0.5;
    cam.far = r * 4;
    cam.updateProjectionMatrix();
    this.sol.shadow.mapSize.set(2048, 2048);
    this.sol.shadow.bias = -0.0004;
    this.sol.shadow.normalBias = 0.03;
    this.sol.shadow.radius = 3;
  }

  /**
   * Prepara um renderizador (o da viewport ou um dedicado, do vídeo e do relatório) para desenhar a cena
   * com a aparência atual: mapeamento de tons, sombras, reflexos de ambiente e oclusão de ambiente (GTAO).
   */
  criarDesenhista(renderer: THREE.WebGLRenderer, largura: number, altura: number): Desenhista {
    const real = this.aparencia === "realista";
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = real ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = real;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (!real) {
      return { desenhar: (cam) => renderer.render(this.scene, cam), redimensionar: () => {}, dispose: () => {} };
    }
    // céu e reflexos: alvos de renderização, então cada renderizador gera os seus
    const fundo = criarFundo(renderer);
    const camBase = new THREE.PerspectiveCamera();
    const composer = new EffectComposer(renderer);
    const passoCena = new RenderPass(this.scene, camBase);
    const gtao = new GTAOPass(this.scene, camBase, largura, altura);
    gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.5, thickness: 1, scale: 1.1, samples: 12 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    gtao.blendIntensity = 0.9;
    composer.addPass(passoCena);
    composer.addPass(gtao);
    composer.addPass(new OutputPass());
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(largura, altura);
    return {
      desenhar: (cam) => {
        const anterior = this.scene.environment, ceu = this.scene.background;
        this.scene.environment = fundo.environment;
        this.scene.background = fundo.background;
        passoCena.camera = cam;
        gtao.camera = cam;
        composer.render();
        this.scene.environment = anterior;
        this.scene.background = ceu;
      },
      redimensionar: (w, h) => composer.setSize(w, h),
      dispose: () => {
        composer.dispose();
        gtao.dispose();
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
    this.scene.fog = this.aparencia === "realista" && !this.caixa.isEmpty() ? neblina(this.enquadramento().raio) : null;
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
    const buraco = lote.isEmpty()
      ? { x0: this.caixa.min.x - 0.8, x1: this.caixa.max.x + 0.8, z0: this.caixa.min.z - 0.8, z1: this.caixa.max.z + 0.8 }
      : { x0: lote.min.x, x1: lote.max.x, z0: lote.min.z, z1: lote.max.z };
    const y = lote.isEmpty() ? piso - 0.02 : lote.max.y - 0.05;
    this.ambiente.add(montarChao(this.fotos, buraco, y, Math.min(this.caixa.min.y, y - 0.5) - 0.1));
    const voo = this.voo();
    voo?.pessoas.forEach((p, i) => this.pessoas.add(pessoa(p.pos, p.olhar, 31 + i * 17)));
    this.pessoas.visible = false;
    this.ambiente.visible = this.aparencia === "realista";
  }

  /** Coloca uma câmera num quadro livre do voo de drone. */
  posicionarLivre(camera: THREE.PerspectiveCamera, q: QuadroCamera): void {
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
    const chave = `real|${r.textura}|${cor?.getHexString() ?? ""}|${op}|${selecionado ? 1 : 0}`;
    let m = this.materiais.get(chave);
    const foto = (r.textura === "terra" || r.textura === "grama") && this.fotos?.get(r.textura);
    if (!m && foto) {
      m = semRepeticao(new THREE.MeshStandardMaterial({ map: foto.map, normalMap: foto.normalMap, roughnessMap: foto.roughnessMap, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
      if (r.textura === "grama") m.color.set("#b9d79a");
      if (selecionado) {
        m.emissive = COR_SELECAO;
        m.emissiveIntensity = 0.55;
      }
      this.materiais.set(chave, m);
    }
    if (!m) {
      const mapa = this.textura(r.textura, r.textura === "liso" || r.textura === "pintura" ? (cor ?? new THREE.Color(0.95, 0.94, 0.91)) : null);
      m = new THREE.MeshStandardMaterial({
        map: mapa,
        roughness: r.rugosidade,
        metalness: r.metalico,
        bumpMap: r.relevo > 0 ? mapa : null,
        bumpScale: r.relevo,
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
