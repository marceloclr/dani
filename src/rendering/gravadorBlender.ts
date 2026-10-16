// Pacote para o Blender (INC-23, ADR-43): percorre os quadros do vídeo sem desenhar e grava o que o WebGL
// desenharia (câmera, luz do sol, luminárias e, por objeto, visibilidade, material e matriz), só nas mudanças.
// A cena sai num GLB com todos os materiais que aparecem no vídeo; o script do Blender refaz os quadros.
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import type { Cena } from "./Cena";
import type { Desenho3D } from "./VideoRenderer";
import { direcaoDaLuz, parametrosDoSol } from "./iluminacao";

export const VERSAO_PACOTE = 1;

export type OrigemDoPacote = "obra" | "imagens";

export interface FaixasBlender {
  versao: number;
  /** Identifica o pacote: o MP4 do Blender leva-a no nome, e o app confere ao usá-lo. */
  assinatura: string;
  origem: OrigemDoPacote;
  nome: string;
  fps: number;
  quadros: number;
  largura: number;
  altura: number;
  /** Nome de cada objeto no GLB, na ordem dos índices de `estados`. */
  objetos: string[];
  /** Nome de cada material no GLB (o índice usado em `estados`). */
  materiais: string[];
  /** O que o script do Blender ajusta em cada material: opacidade, vidro e o disco aceso das luminárias. */
  tiposMaterial: Record<string, { opacidade: number; vidro?: boolean; emissivo?: boolean }>;
  /** Luminárias: posição na cena (Y para cima), força plena e alcance (m). */
  lampadas: { pos: number[]; forca: number; alcance: number }[];
  /** Por quadro: [fov vertical (graus), perto, longe, matriz do mundo 4×4 por colunas] ou null (sem 3D). */
  camera: (number[] | null)[];
  /** Mudanças da luz, uma linha por mudança: ver `COLUNAS_LUZ`. */
  luz: number[][];
  /** Por objeto, as mudanças: [quadro, visível 0/1, material] e, quando a matriz muda, os 12 números dela. */
  estados: number[][][];
}

/** Colunas de cada linha de `FaixasBlender.luz` (o script do Blender lê pela mesma ordem). */
export const COLUNAS_LUZ = [
  "quadro", "elevacao", "sol_x", "sol_y", "sol_z", "luz_x", "luz_y", "luz_z",
  "cor_sol", "forca_sol", "cor_ceu", "forca_ceu", "reflexos", "exposicao", "noturno", "luminarias",
] as const;

const r5 = (x: number) => Math.round(x * 1e5) / 1e5;

/** As 12 primeiras entradas de uma matriz afim (três linhas × quatro colunas), por colunas e arredondadas. */
export function matrizAfim(e: ArrayLike<number>): number[] {
  return [e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10], e[12], e[13], e[14]].map(r5);
}

/**
 * Faixa de um objeto: acrescenta o estado do quadro só se mudou. Enquanto o objeto está escondido, as
 * trocas de material e de matriz não importam; ao reaparecer, entra a matriz se ela mudou desde a última gravada.
 */
export class FaixaDoObjeto {
  readonly linhas: number[][] = [];
  private vis = -1;
  private mat = -1;
  private matriz = "";

  registrar(q: number, visivel: boolean, material: number, matriz: number[]): void {
    const v = visivel ? 1 : 0;
    if (!v) {
      if (this.vis !== 0) this.linhas.push([q, 0, Math.max(this.mat, 0)]);
      this.vis = 0;
      return;
    }
    const chave = matriz.join(",");
    const mudouM = chave !== this.matriz;
    if (this.vis === 1 && material === this.mat && !mudouM) return;
    this.linhas.push(mudouM ? [q, 1, material, ...matriz] : [q, 1, material]);
    this.vis = 1;
    this.mat = material;
    if (mudouM) this.matriz = chave;
  }
}

/** Vidro: material físico translúcido e liso (`criarMaterialReal`); emissivo: o disco aceso das luminárias. */
export function tipoDoMaterial(m: THREE.Material): FaixasBlender["tiposMaterial"][string] {
  const t: FaixasBlender["tiposMaterial"][string] = { opacidade: r5(m.opacity) };
  if (m instanceof THREE.MeshPhysicalMaterial && m.opacity < 0.99 && m.roughness < 0.1) t.vidro = true;
  if (m instanceof THREE.MeshBasicMaterial) t.emissivo = true;
  return t;
}

const visivelDeFato = (o: THREE.Object3D): boolean => {
  for (let x: THREE.Object3D | null = o; x; x = x.parent) if (!x.visible) return false;
  return true;
};

/** Gravador do pacote: fica no lugar do desenho 3D enquanto `percorrerVideo` corre os quadros. */
export class GravadorBlender {
  private readonly objetos: THREE.Mesh[] = [];
  private readonly nomes: string[] = [];
  private readonly faixas: FaixaDoObjeto[] = [];
  private readonly materiais = new Map<THREE.Material, number>();
  private readonly lista: THREE.Material[] = [];
  /** Material de cada objeto no primeiro quadro em que aparece (o do GLB). */
  private readonly primeiro: (THREE.Material | null)[] = [];
  private readonly camera: (number[] | null)[];
  private readonly luz: number[][] = [];
  private ultimaLuz = "";
  private readonly fonte: ReturnType<Cena["paraOBlender"]>;

  constructor(private readonly cena: Cena, readonly total: number) {
    this.fonte = cena.paraOBlender();
    for (const [guid, m] of this.fonte.malhas) this.incluir(`ifc:${guid}`, m);
    for (const { prefixo, raiz } of this.fonte.raizes) {
      let k = 0;
      raiz.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) this.incluir(`${prefixo}:${k++}`, o as THREE.Mesh);
      });
    }
    this.camera = new Array(total).fill(null);
  }

  private incluir(origem: string, m: THREE.Mesh): void {
    this.objetos.push(m);
    this.nomes.push(origem);
    this.faixas.push(new FaixaDoObjeto());
    this.primeiro.push(null);
  }

  private indiceDoMaterial(m: THREE.Material | THREE.Material[]): number {
    const mat = Array.isArray(m) ? m[0] : m;
    let k = this.materiais.get(mat);
    if (k === undefined) {
      k = this.lista.length;
      this.materiais.set(mat, k);
      this.lista.push(mat);
    }
    return k;
  }

  /** Grava o quadro `i` com a câmera já posicionada (a cena já está no dia e no sol do quadro). */
  quadro(i: number, cam: THREE.PerspectiveCamera): void {
    this.cena.liberarVista(cam); // as casas vizinhas que tampam a obra somem como no WebGL
    this.cena.scene.updateMatrixWorld(true);
    cam.updateMatrixWorld();
    this.camera[i] = [r5(cam.fov), r5(cam.near), r5(cam.far), ...Array.from(cam.matrixWorld.elements, r5)];
    const { dir, elevacao } = this.cena.estadoSol;
    const p = parametrosDoSol(elevacao);
    const l = direcaoDaLuz(dir);
    const base = this.fonte.lampadas[0]?.userData.base as number | undefined;
    const lum = this.fonte.grupoLampadas.visible && base ? this.fonte.lampadas[0].intensity / base : 0;
    const linha = [elevacao, ...dir, ...l, p.corSol, p.intensidadeSol, p.corCeu, p.intensidadeCeu, p.intensidadeAmbiente, p.exposicao, p.ceuNoturno ? 1 : 0, lum].map(r5);
    const chave = linha.join(",");
    if (chave !== this.ultimaLuz) {
      this.luz.push([i, ...linha]);
      this.ultimaLuz = chave;
    }
    this.objetos.forEach((o, k) => {
      const vis = visivelDeFato(o);
      const mat = vis ? this.indiceDoMaterial(o.material) : -1;
      if (vis && !this.primeiro[k]) this.primeiro[k] = this.lista[mat];
      this.faixas[k].registrar(i, vis, mat, vis ? matrizAfim(o.matrixWorld.elements) : []);
    });
  }

  /** O gravador como desenho 3D do `percorrerVideo`. */
  comoDesenho(): Desenho3D {
    return { desenhar: (cam, i) => this.quadro(i, cam), dispose: () => {} };
  }

  faixasDoPacote(meta: Pick<FaixasBlender, "assinatura" | "origem" | "nome" | "fps" | "largura" | "altura">): FaixasBlender {
    const luzes = this.fonte.lampadas.map((l) => ({ pos: l.getWorldPosition(new THREE.Vector3()).toArray().map(r5), forca: (l.userData.base as number) ?? 0, alcance: r5(l.distance) }));
    return {
      versao: VERSAO_PACOTE,
      ...meta,
      quadros: this.total,
      objetos: this.objetos.map((_, k) => `o${k}`),
      materiais: this.lista.map((_, k) => `m${k}`),
      tiposMaterial: Object.fromEntries(this.lista.map((m, k) => [`m${k}`, tipoDoMaterial(m)])),
      lampadas: luzes,
      camera: this.camera,
      luz: this.luz,
      estados: this.faixas.map((f) => f.linhas),
    };
  }

  /** Objetos que nunca aparecem no vídeo ficam fora do GLB (o script do Blender ignora os que não acha). */
  private usados(): number[] {
    return this.objetos.map((_, k) => k).filter((k) => this.faixas[k].linhas.some((l) => l[1] === 1));
  }

  /**
   * O GLB da cena: cada objeto usado, com o material do primeiro quadro em que aparece e a matriz do mundo
   * de agora (o script põe a de cada quadro), e um triângulo por material que nenhum objeto leva no GLB,
   * para o Blender ter todos. Texturas de 1.024 px ou mais vão em JPEG.
   */
  async glb(): Promise<ArrayBuffer> {
    const cena = new THREE.Scene();
    const desfazer: (() => void)[] = [];
    this.lista.forEach((m, k) => {
      const n = m.name;
      m.name = `m${k}`;
      desfazer.push(() => (m.name = n));
      for (const v of Object.values(m)) {
        if (v instanceof THREE.Texture && v.image && (v.image.width ?? 0) >= 1024 && !v.userData.mimeType) {
          v.userData.mimeType = "image/jpeg";
          desfazer.push(() => delete v.userData.mimeType);
        }
      }
    });
    const levados = new Set<THREE.Material>();
    for (const k of this.usados()) {
      const o = this.objetos[k];
      const mat = this.primeiro[k] ?? (Array.isArray(o.material) ? o.material[0] : o.material);
      levados.add(mat);
      let x: THREE.Mesh;
      if (o instanceof THREE.InstancedMesh) {
        const im = new THREE.InstancedMesh(o.geometry, mat, o.count);
        im.instanceMatrix.copy(o.instanceMatrix);
        x = im;
      } else x = new THREE.Mesh(o.geometry, mat);
      x.name = `o${k}`;
      o.updateWorldMatrix(true, false);
      o.matrixWorld.decompose(x.position, x.quaternion, x.scale);
      cena.add(x);
    }
    const tri = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([0, -100, 0, 0.01, -100, 0, 0, -100, 0.01], 3));
    tri.setAttribute("normal", new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    tri.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    this.lista.forEach((m, k) => {
      if (levados.has(m)) return;
      const x = new THREE.Mesh(tri, m);
      x.name = `mat:m${k}`;
      cena.add(x);
    });
    try {
      const r = await new GLTFExporter().parseAsync(cena, { binary: true, onlyVisible: false, maxTextureSize: 2048 });
      return r as ArrayBuffer;
    } finally {
      desfazer.forEach((f) => f());
    }
  }
}
