// Viewport Three.js: uma malha por elemento (ADR-01), materiais compartilhados por cor e estado.
// Renderiza sob demanda: só desenha quando a câmera ou o estado mudam.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { MalhaElemento } from "../bim/parseIfc";
import type { EstadoElemento } from "../types";

export type Vista = "superior" | "frontal" | "lateral" | "isometrica";

/** Cores de aparência por acabamento concluído; "base" usa a cor do IFC. */
const APARENCIAS: Record<string, string> = { reboco: "#cfc9bd", pintura: "#f1ede4" };
const COR_EM_EXECUCAO = new THREE.Color("#c4a45e"); // --latao (escuro), legível nos dois temas
const COR_SELECAO = new THREE.Color("#3f5c78"); // --ardosia

export interface Camadas {
  /** Estado 4D por guid (camada de baixo). */
  estados: Map<string, EstadoElemento> | null;
  /** Override do usuário (OCULTAR). */
  ocultos: Set<string>;
  /** Isolamento: se definido, só esses elementos aparecem (camada de cima). */
  isolados: Set<string> | null;
  selecionado: string | null;
}

export class Cena {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  readonly controls: OrbitControls;
  private malhas = new Map<string, THREE.Mesh>();
  private corBase = new Map<string, THREE.Color>();
  private materiais = new Map<string, THREE.MeshStandardMaterial>();
  private caixa = new THREE.Box3();
  private pendente = false;
  private observador: ResizeObserver;
  private raycaster = new THREE.Raycaster();

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.addEventListener("change", () => this.pedirQuadro());

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
    if (this.pendente) return;
    this.pendente = true;
    requestAnimationFrame(() => {
      this.pendente = false;
      this.renderer.render(this.scene, this.camera);
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
      this.scene.add(malha);
    }
    this.caixa.makeEmpty();
    for (const [guid, m] of this.malhas) if (!foraDoEnquadramento.has(guid)) this.caixa.union(m.geometry.boundingBox!);
    if (this.caixa.isEmpty()) for (const m of this.malhas.values()) this.caixa.union(m.geometry.boundingBox!);
    this.vista("isometrica");
  }

  private material(cor: THREE.Color, opacidade: number, selecionado: boolean, fantasma = false): THREE.MeshStandardMaterial {
    const chave = `${cor.getHexString()}|${opacidade.toFixed(2)}|${selecionado ? 1 : 0}|${fantasma ? 1 : 0}`;
    let m = this.materiais.get(chave);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: cor,
        roughness: 0.85,
        metalness: 0,
        transparent: opacidade < 0.99,
        opacity: opacidade,
        depthWrite: opacidade >= 0.99,
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

  /** Aplica as camadas: estado 4D < ocultos pelo usuário < isolamento (ADR-02). */
  aplicar(c: Camadas): void {
    for (const [guid, malha] of this.malhas) {
      const estado = c.estados?.get(guid);
      let visivel = estado ? estado.visivel : true;
      if (c.ocultos.has(guid)) visivel = false;
      if (c.isolados && !c.isolados.has(guid)) visivel = false;
      malha.visible = visivel;
      if (!visivel) continue;

      const base = this.corBase.get(guid)!;
      const opacidadeBase = malha.userData.opacidadeBase as number;
      const sel = c.selecionado === guid;
      if (!estado || estado.fase === "concluido") {
        const ap = estado && APARENCIAS[estado.aparencia];
        malha.material = this.material(ap ? new THREE.Color(ap) : base, opacidadeBase, sel);
      } else if (estado.fase === "em-execucao") {
        const ap = APARENCIAS[estado.aparencia];
        malha.material = this.material((ap ? new THREE.Color(ap) : base.clone()).lerp(COR_EM_EXECUCAO, 0.85), opacidadeBase, sel);
      } else if (estado.fase === "fantasma") {
        malha.material = this.material(new THREE.Color("#8d949d"), 0.14, sel, true);
      }
    }
    this.pedirQuadro();
  }

  /** guid do elemento sob o ponteiro (coordenadas do cliente). */
  escolher(x: number, y: number): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
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

  private enquadrarCaixa(caixa: THREE.Box3, direcao: THREE.Vector3, up = new THREE.Vector3(0, 1, 0)): void {
    if (caixa.isEmpty()) return;
    const centro = caixa.getCenter(new THREE.Vector3());
    const raio = caixa.getBoundingSphere(new THREE.Sphere()).radius;
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const dist = (raio / Math.sin(Math.min(vfov, hfov) / 2)) * 0.92;
    this.camera.up.copy(up);
    this.camera.position.copy(centro).addScaledVector(direcao.normalize(), dist);
    this.camera.near = Math.max(dist / 500, 0.05);
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(centro);
    this.controls.update();
    this.pedirQuadro();
  }

  /** Vistas-padrão. No IFC, a frente da casa fica em +z da cena e o fundo em −z. */
  vista(v: Vista): void {
    const dirs: Record<Vista, [THREE.Vector3, THREE.Vector3?]> = {
      superior: [new THREE.Vector3(0, 1, 0.0001), new THREE.Vector3(0, 0, -1)],
      frontal: [new THREE.Vector3(0, 0.08, 1)],
      lateral: [new THREE.Vector3(1, 0.08, 0)],
      isometrica: [new THREE.Vector3(-1, 0.85, 1)],
    };
    const [d, up] = dirs[v];
    this.enquadrarCaixa(this.caixa, d.clone(), up);
  }

  /** Enquadra a casa inteira mantendo a direção atual da câmera. */
  casaInteira(): void {
    this.enquadrarCaixa(this.caixa, this.camera.position.clone().sub(this.controls.target), this.camera.up.clone());
  }

  focar(guid: string): void {
    const m = this.malhas.get(guid);
    if (!m) return;
    const caixa = m.geometry.boundingBox!.clone().expandByScalar(1.5);
    this.enquadrarCaixa(caixa, this.camera.position.clone().sub(this.controls.target), this.camera.up.clone());
  }

  private limpar(): void {
    for (const m of this.malhas.values()) {
      m.geometry.dispose();
      this.scene.remove(m);
    }
    for (const mat of this.materiais.values()) mat.dispose();
    this.malhas.clear();
    this.corBase.clear();
    this.materiais.clear();
  }

  dispose(): void {
    this.limpar();
    this.observador.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
