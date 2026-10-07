// Viewport Three.js: uma malha por elemento (ADR-01), materiais compartilhados por cor, opacidade e estado.
// Renderiza sob demanda: só desenha quando a câmera ou o estado mudam.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { MalhaElemento } from "../bim/parseIfc";
import { parametros, type PosicaoElemento, type PosicaoFila } from "../fourd/animacao";
import type { Desvio, EstadoElemento, ModoAnimacao, PlantaSobreposta } from "../types";
import { distanciaDeEnquadramento, poseDaPosicao, poseDoPreset, posicaoDaPose, type Enquadramento, type Pose, type Preset } from "./cameras";

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

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener("change", () => this.pedirQuadro());
    this.controls.autoRotateSpeed = 1.5;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8170, 1.6));
    const sol = new THREE.DirectionalLight(0xffffff, 1.6);
    sol.position.set(30, 50, 20);
    this.scene.add(sol);
    const contraluz = new THREE.DirectionalLight(0xffffff, 0.5);
    contraluz.position.set(-30, 20, -40);
    this.scene.add(contraluz);

    this.observador = new ResizeObserver(() => this.redimensionar());
    this.observador.observe(host);
    this.atualizarTema();
    this.redimensionar();
  }

  /** Lê --papel do tema atual para o fundo da cena. */
  atualizarTema(): void {
    const papel = getComputedStyle(document.documentElement).getPropertyValue("--papel").trim() || "#f3f1ec";
    this.scene.background = new THREE.Color(papel);
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
    this.pedirQuadro();
  }

  pedirQuadro(): void {
    if (this.pendente || this.silencioso) return;
    this.pendente = true;
    requestAnimationFrame(() => {
      this.pendente = false;
      if (!this.silencioso) this.renderer.render(this.scene, this.camera);
    });
  }

  /** `foraDoEnquadramento`: elementos que não entram na caixa de enquadramento (ex.: terreno e árvores). */
  carregar(malhas: MalhaElemento[], foraDoEnquadramento: Set<string> = new Set()): void {
    this.limpar();
    for (const m of malhas) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(m.posicoes, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(m.normais, 3));
      geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      const cor = new THREE.Color().setRGB(m.cor[0], m.cor[1], m.cor[2], THREE.SRGBColorSpace);
      const malha = new THREE.Mesh(geo, this.material(cor, m.cor[3], false));
      malha.userData.guid = m.guid;
      malha.userData.opacidadeBase = m.cor[3];
      this.malhas.set(m.guid, malha);
      this.corBase.set(m.guid, cor);
      this.baseY.set(m.guid, geo.boundingBox!.min.y);
      this.scene.add(malha);
    }
    this.caixa.makeEmpty();
    for (const [guid, m] of this.malhas) if (!foraDoEnquadramento.has(guid)) this.caixa.union(m.geometry.boundingBox!);
    if (this.caixa.isEmpty()) for (const m of this.malhas.values()) this.caixa.union(m.geometry.boundingBox!);
    this.vista("isometrica");
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

  /** Aplica as camadas: estado 4D (com o modo de animação) < ocultos pelo usuário < isolamento (ADR-02). */
  aplicar(c: Camadas): void {
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
      malha.visible = visivel;
      // crescimento: escala vertical com pivô na base do elemento
      const by = this.baseY.get(guid)!;
      malha.scale.y = p.escalaY;
      malha.position.y = by * (1 - p.escalaY);
      if (!visivel) continue;

      const base = this.corBase.get(guid)!;
      const sel = c.selecionado === guid;
      if (desvio === "atrasado") {
        this.ultimosDesvios.atrasado++;
        malha.scale.y = 1;
        malha.position.y = 0;
        malha.material = this.material(estado?.visivel ? base.clone().lerp(COR_ATRASADO, 0.75) : COR_ATRASADO, estado?.visivel ? opacidadeBase : 0.4, sel);
        continue;
      }
      if (desvio === "adiantado") {
        this.ultimosDesvios.adiantado++;
        malha.material = this.material(base.clone().lerp(COR_ADIANTADO, 0.7), opacidadeBase * p.opacidade, sel);
        continue;
      }
      if (!estado || estado.fase === "concluido") {
        const ap = estado && APARENCIAS[estado.aparencia];
        malha.material = this.material(ap ? new THREE.Color(ap) : base, opacidadeBase * p.opacidade, sel);
      } else if (estado.fase === "em-execucao") {
        const ap = APARENCIAS[estado.aparencia];
        malha.material = this.material((ap ? new THREE.Color(ap) : base.clone()).lerp(COR_EM_EXECUCAO, 0.85), opacidadeBase * p.opacidade, sel);
      } else if (estado.fase === "fantasma") {
        malha.material = this.material(COR_FANTASMA, 0.15, sel);
      }
    }
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
    const canvas = document.createElement("canvas");
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    try {
      r.setPixelRatio(1);
      r.setSize(largura, altura, false);
      r.outputColorSpace = THREE.SRGBColorSpace;
      const cam = new THREE.PerspectiveCamera(45, largura / altura, 0.05, 4000);
      this.posicionar(cam, pose);
      r.render(this.scene, cam);
      return await new Promise<Blob>((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error("toBlob falhou"))), "image/jpeg", 0.9));
    } finally {
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
    for (const m of this.malhas.values()) {
      m.geometry.dispose();
      this.scene.remove(m);
    }
    for (const mat of this.materiais.values()) mat.dispose();
    this.malhas.clear();
    this.corBase.clear();
    this.baseY.clear();
    this.materiais.clear();
  }

  dispose(): void {
    this.pararGiro();
    this.definirPlanta(null, null);
    this.limpar();
    this.observador.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
