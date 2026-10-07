// Ambiente da aparência realista (ADR-23): céu físico com nuvens, chão até o horizonte com a cava da
// obra, texturas fotográficas de grama e solo (Poly Haven, CC0), árvores e pessoas na obra pronta.
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { aleatorio } from "./texturas";
import type { P2, P3 } from "./navegacao";

export type Foto = "grama" | "terra";
const ARQUIVO: Record<Foto, string> = { grama: "sparse_grass", terra: "grass_path_2" };
/** Metros cobertos por uma repetição da foto. */
export const ESCALA_FOTO: Record<Foto, number> = { grama: 2.5, terra: 3 };

/** Direção do sol: da frente e da direita, alto (≈ 43° de elevação), igual à luz da cena. */
export const DIRECAO_SOL = new THREE.Vector3(0.65, 0.7, 0.35).normalize();
/** Cor do horizonte enevoado, para a neblina casar com o céu. */
const COR_NEBLINA = new THREE.Color("#c6d3de");

export interface MapasFoto {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

export interface Fundo {
  background: THREE.Texture;
  environment: THREE.Texture;
  dispose(): void;
}

/** Céu de Preetham com nuvens procedurais (determinísticas: o vídeo sai igual a cada geração). */
function cenaDoCeu(): THREE.Scene {
  const s = new THREE.Scene();
  const ceu = new Sky();
  ceu.scale.setScalar(1000);
  const u = ceu.material.uniforms;
  u.turbidity.value = 4.5;
  u.rayleigh.value = 1.2;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(DIRECAO_SOL);
  if (u.cloudCoverage) {
    u.cloudCoverage.value = 0.42;
    u.cloudDensity.value = 0.55;
    u.cloudElevation.value = 0.55;
    u.cloudScale.value = 0.00025;
    if (u.time) u.time.value = 40;
  }
  s.add(ceu);
  return s;
}

/**
 * Fundo e reflexos de um renderizador: o céu desenhado num cubo (fundo) e pré-filtrado (PMREM) para
 * a luz de ambiente. É alvo de renderização, então cada renderizador (viewport, vídeo, relatório) gera o seu.
 */
export function criarFundo(renderer: THREE.WebGLRenderer): Fundo {
  const cena = cenaDoCeu();
  const alvo = new THREE.WebGLCubeRenderTarget(1024, { type: THREE.HalfFloatType });
  const cubo = new THREE.CubeCamera(0.1, 5000, alvo);
  const tom = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  cubo.update(renderer, cena);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const ambiente = pmrem.fromScene(cena, 0, 0.1, 5000);
  renderer.toneMapping = tom;
  pmrem.dispose();
  (cena.children[0] as Sky).material.dispose();
  return {
    background: alvo.texture,
    environment: ambiente.texture,
    dispose: () => {
      alvo.dispose();
      ambiente.dispose();
    },
  };
}

/** Carrega as texturas fotográficas (uma vez por página). */
let fotos: Promise<Map<Foto, MapasFoto>> | null = null;
export function carregarFotos(): Promise<Map<Foto, MapasFoto>> {
  fotos ??= (async () => {
    const base = new URL("texturas/", document.baseURI).href;
    const carregador = new THREE.TextureLoader();
    const um = async (nome: string, cor: boolean) => {
      const t = await carregador.loadAsync(`${base}${nome}.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = cor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      return t;
    };
    const out = new Map<Foto, MapasFoto>();
    for (const f of ["grama", "terra"] as Foto[]) {
      const [map, normalMap, roughnessMap] = await Promise.all([um(`${ARQUIVO[f]}_cor`, true), um(`${ARQUIVO[f]}_normal`, false), um(`${ARQUIVO[f]}_rugosidade`, false)]);
      for (const t of [map, normalMap, roughnessMap]) t.repeat.set(1 / ESCALA_FOTO[f], 1 / ESCALA_FOTO[f]);
      out.set(f, { map, normalMap, roughnessMap });
    }
    return out;
  })().catch(() => new Map());
  return fotos;
}

/**
 * Variação em grande escala: mistura a foto com ela mesma numa escala 7× maior e deslocada,
 * para não se ver a repetição de 2 a 3 m quando o chão vai até o horizonte.
 */
export function semRepeticao(mat: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <map_fragment>",
      `#ifdef USE_MAP
        vec4 fotoA = texture2D(map, vMapUv);
        vec4 fotoB = texture2D(map, vMapUv * 0.137 + vec2(0.31, 0.71));
        float mancha = smoothstep(0.25, 0.75, texture2D(map, vMapUv * 0.031 + vec2(0.57, 0.13)).g * 1.8 - 0.2);
        diffuseColor *= mix(fotoA, fotoB, 0.35) * (0.82 + 0.32 * mancha);
      #endif`,
    );
  };
  mat.customProgramCacheKey = () => "sem-repeticao";
  return mat;
}

function materialFoto(m: MapasFoto | undefined, reserva: THREE.Color, escala = 1): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color: m ? 0xffffff : reserva, roughness: 1, metalness: 0 });
  if (m) {
    const clonar = (t: THREE.Texture) => {
      const c = t.clone();
      c.repeat.multiplyScalar(escala);
      c.needsUpdate = true;
      return c;
    };
    mat.map = clonar(m.map);
    mat.normalMap = clonar(m.normalMap);
    mat.roughnessMap = clonar(m.roughnessMap);
    mat.normalScale.set(0.8, 0.8);
  }
  return mat;
}

/**
 * Chão até o horizonte com um buraco no lugar do lote (ou da casa) e a cava da obra embaixo,
 * para a fundação aparecer escavada e não se ver o céu por baixo do terreno.
 */
export function montarChao(f: Map<Foto, MapasFoto>, buraco: { x0: number; x1: number; z0: number; z1: number }, y: number, fundo: number): THREE.Group {
  const g = new THREE.Group();
  g.name = "chao";
  const L = 1500;
  const forma = new THREE.Shape([new THREE.Vector2(-L, -L), new THREE.Vector2(L, -L), new THREE.Vector2(L, L), new THREE.Vector2(-L, L)]);
  // a forma fica no plano XY e gira para XZ (y da forma = −z da cena)
  forma.holes.push(new THREE.Path([new THREE.Vector2(buraco.x0, -buraco.z0), new THREE.Vector2(buraco.x0, -buraco.z1), new THREE.Vector2(buraco.x1, -buraco.z1), new THREE.Vector2(buraco.x1, -buraco.z0)]));
  const geo = new THREE.ShapeGeometry(forma);
  geo.rotateX(-Math.PI / 2);
  // coordenadas de textura em metros
  const pos = geo.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i);
    uv[i * 2 + 1] = pos.getZ(i);
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const matCampo = semRepeticao(materialFoto(f.get("grama"), new THREE.Color("#6f8f4e")));
  if (f.get("grama")) matCampo.color.set("#c4dba6"); // um pouco mais verde que a foto
  const campo = new THREE.Mesh(geo, matCampo);
  campo.position.y = y;
  campo.receiveShadow = true;
  g.add(campo);

  // cava: caixa aberta em cima, vista por dentro
  const w = buraco.x1 - buraco.x0, d = buraco.z1 - buraco.z0, h = Math.max(y - fundo, 0.3);
  const cava = new THREE.BoxGeometry(w, h, d);
  const p2 = cava.getAttribute("position"), n2 = cava.getAttribute("normal");
  const uv2 = new Float32Array(p2.count * 2);
  for (let i = 0; i < p2.count; i++) {
    const ay = Math.abs(n2.getY(i)) > 0.5, ax = Math.abs(n2.getX(i)) > 0.5;
    uv2[i * 2] = ay || !ax ? p2.getX(i) : p2.getZ(i);
    uv2[i * 2 + 1] = ay ? p2.getZ(i) : p2.getY(i);
  }
  cava.setAttribute("uv", new THREE.BufferAttribute(uv2, 2));
  const matCava = materialFoto(f.get("terra"), new THREE.Color("#7b5d40"));
  matCava.side = THREE.BackSide;
  matCava.color.set(f.get("terra") ? 0xb39a86 : 0x7b5d40); // solo escavado, mais escuro e avermelhado
  const caixaCava = new THREE.Mesh(cava, matCava);
  caixaCava.position.set((buraco.x0 + buraco.x1) / 2, y - h / 2 - 0.002, (buraco.z0 + buraco.z1) / 2);
  caixaCava.receiveShadow = true;
  g.add(caixaCava);
  return g;
}

/** Neblina leve que funde o chão com o horizonte do céu. */
export const neblina = (raio: number) => new THREE.Fog(COR_NEBLINA, Math.max(raio * 6, 60), Math.max(raio * 45, 450));

// ------------------------------------------------------------------ árvores

const matTronco = new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 0.95 });
const matsCopa = ["#3f6b2f", "#4b7a35", "#36602a"].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));

/** Árvore procedural no lugar da caixa do IFC: tronco e copa feita de vários blocos irregulares. */
export function arvore(caixa: THREE.Box3, semente: number): THREE.Group {
  const rnd = aleatorio(semente);
  const g = new THREE.Group();
  const c = caixa.getCenter(new THREE.Vector3());
  const tam = caixa.getSize(new THREE.Vector3());
  const alturaTronco = tam.y * 0.5;
  const raioCopa = Math.max(tam.x, tam.z) / 2;
  const tronco = new THREE.Mesh(new THREE.CylinderGeometry(raioCopa * 0.08, raioCopa * 0.13, alturaTronco + raioCopa * 0.4, 8), matTronco);
  tronco.position.set(c.x, caixa.min.y + (alturaTronco + raioCopa * 0.4) / 2, c.z);
  tronco.castShadow = true;
  g.add(tronco);
  const yCopa = caixa.min.y + alturaTronco + raioCopa * 0.55;
  for (let i = 0; i < 9; i++) {
    const r = raioCopa * (0.45 + rnd() * 0.3);
    const geo = new THREE.IcosahedronGeometry(r, 1);
    const p = geo.getAttribute("position");
    for (let k = 0; k < p.count; k++) p.setXYZ(k, p.getX(k) * (0.85 + rnd() * 0.3), p.getY(k) * (0.75 + rnd() * 0.3), p.getZ(k) * (0.85 + rnd() * 0.3));
    geo.computeVertexNormals();
    const bloco = new THREE.Mesh(geo, matsCopa[i % matsCopa.length]);
    const a = rnd() * Math.PI * 2, d = i === 0 ? 0 : raioCopa * (0.35 + rnd() * 0.3);
    bloco.position.set(c.x + Math.cos(a) * d, yCopa + (rnd() - 0.3) * raioCopa * 0.5, c.z + Math.sin(a) * d);
    bloco.castShadow = true;
    bloco.receiveShadow = true;
    g.add(bloco);
  }
  return g;
}

// ------------------------------------------------------------------ pessoas

const PELES = ["#8d5a3b", "#c68a5e", "#e2b48c", "#5e3a26", "#a86f4a"];
const ROUPAS = ["#2f4a6b", "#b04a3a", "#e3dccb", "#3d6b4f", "#d9a441", "#4a4a52", "#7c4f8f", "#f1efe8"];
const CALCAS = ["#2b3442", "#3b3b3b", "#6b5a45", "#24406b", "#c9c0ae"];

/** Pessoa estilizada (≈ 1,70 m), parada, de frente para `olhar`. Determinística pela semente. */
export function pessoa(pos: P3, olhar: P2, semente: number): THREE.Group {
  const rnd = aleatorio(semente);
  const g = new THREE.Group();
  const esc = 0.95 + rnd() * 0.12;
  const m = (c: string, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const pele = m(PELES[Math.floor(rnd() * PELES.length)], 0.6);
  const roupa = m(ROUPAS[Math.floor(rnd() * ROUPAS.length)]);
  const calca = m(CALCAS[Math.floor(rnd() * CALCAS.length)]);
  const cabelo = m(["#1e1712", "#3b2a1e", "#6b4a2e", "#222"][Math.floor(rnd() * 4)], 0.7);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0, rz = 0) => {
    const k = new THREE.Mesh(geo, mat);
    k.position.set(x, y, z);
    k.rotation.z = rz;
    k.castShadow = true;
    g.add(k);
  };
  add(new THREE.CapsuleGeometry(0.065, 0.72, 4, 10), calca, -0.09, 0.43); // pernas
  add(new THREE.CapsuleGeometry(0.065, 0.72, 4, 10), calca, 0.09, 0.43);
  add(new THREE.CapsuleGeometry(0.17, 0.42, 6, 14), roupa, 0, 1.12); // tronco
  add(new THREE.CapsuleGeometry(0.05, 0.55, 4, 8), roupa, -0.23, 1.08, 0, 0.12); // braços
  add(new THREE.CapsuleGeometry(0.05, 0.55, 4, 8), roupa, 0.23, 1.08, 0, -0.12);
  add(new THREE.SphereGeometry(0.105, 18, 14), pele, 0, 1.56); // cabeça
  add(new THREE.SphereGeometry(0.11, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2.1), cabelo, 0, 1.585);
  g.scale.setScalar(esc);
  g.position.set(pos[0], pos[1], pos[2]);
  g.rotation.y = Math.atan2(olhar[0], olhar[1]);
  return g;
}
