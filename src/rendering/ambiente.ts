// Ambiente da aparência realista (ADR-23): céu físico com nuvens, chão até o horizonte com a cava da
// obra, texturas fotográficas de grama e solo (Poly Haven, CC0), árvores e pessoas na obra pronta.
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { aleatorio } from "./texturas";
import type { P2, P3 } from "./navegacao";

export type Foto = "grama" | "terra" | "tijolo" | "reboco" | "concreto" | "telha-ceramica" | "telha-metalica" | "madeira" | "porcelanato" | "pedra";
const ARQUIVO: Record<Foto, string> = {
  grama: "sparse_grass",
  terra: "grass_path_2",
  // materiais da obra (ADR-24)
  tijolo: "large_red_bricks",
  reboco: "plastered_wall_04",
  concreto: "concrete_wall_008",
  "telha-ceramica": "clay_roof_tiles_02",
  "telha-metalica": "corrugated_iron_02",
  madeira: "oak_veneer_01",
  porcelanato: "marble_01",
  pedra: "coral_stone_wall",
};
/** Metros cobertos por uma repetição da foto (dimensões informadas pelo Poly Haven). */
export const ESCALA_FOTO: Record<Foto, number> = {
  grama: 2.5, terra: 3, tijolo: 2, reboco: 3.2, concreto: 2.7, "telha-ceramica": 2.5, "telha-metalica": 2.7, madeira: 1.83, porcelanato: 1.5, pedra: 2,
};
/** Cor média de cada foto (sRGB 0–255), para tingir a foto até a cor desejada (`tingir`). */
export const MEDIA_FOTO: Record<Foto, [number, number, number]> = {
  grama: [79, 61, 21], terra: [141, 129, 99], tijolo: [169, 116, 82], reboco: [142, 138, 136], concreto: [141, 134, 112],
  "telha-ceramica": [145, 80, 43], "telha-metalica": [89, 88, 81], madeira: [161, 126, 88], porcelanato: [178, 157, 122], pedra: [144, 131, 114],
};

const linear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
/**
 * Cor do material que leva a média da foto até `alvo` (sRGB 0–255). O material multiplica a textura
 * no espaço linear, então a razão é calculada lá; pode passar de 1 (clareia a foto).
 */
/** Tom do gramado (média sRGB): verde seco de lote, claro o bastante para a vista de cima (ADR-33). */
export const TOM_GRAMADO: [number, number, number] = [104, 110, 74];

export function tingir(foto: Foto, alvo: [number, number, number]): [number, number, number] {
  const m = MEDIA_FOTO[foto];
  return [0, 1, 2].map((i) => linear(alvo[i]) / Math.max(linear(m[i]), 1e-4)) as [number, number, number];
}

/** Céu de um instante (ADR-26): direção do sol na cena e o aspecto do céu na elevação dele. */
export interface Ceu {
  sol: P3;
  turbidez: number;
  rayleigh: number;
  noturno: boolean;
}

export const CEU_PADRAO: Ceu = { sol: [0.6, 0.65, 0.45], turbidez: 4.5, rayleigh: 1.2, noturno: false };

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
/**
 * Céu da noite (hora azul): o de Preetham fica preto com o sol abaixo do horizonte, então a noite usa
 * um degradê do azul-marinho no alto ao azul do horizonte, com estrelas fixas (determinísticas).
 */
function ceuNoturno(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      float h(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      void main() {
        float y = clamp(vDir.y, -1.0, 1.0);
        vec3 zenite = vec3(0.012, 0.022, 0.06), horizonte = vec3(0.07, 0.11, 0.22), brilho = vec3(0.16, 0.14, 0.2);
        vec3 c = mix(horizonte, zenite, smoothstep(0.0, 0.6, y));
        c = mix(c, brilho, exp(-max(y, 0.0) * 18.0) * 0.6); // claridade da cidade no horizonte
        if (y < 0.0) c = horizonte * 0.6;
        vec3 cel = floor(vDir * 380.0);
        float e = step(0.9975, h(cel)) * smoothstep(0.08, 0.3, y);
        c += e * (0.5 + 0.5 * h(cel + 1.0)) * 0.9;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  return m;
}

function cenaDoCeu(p: Ceu): THREE.Scene {
  if (p.noturno) {
    const s = new THREE.Scene();
    s.add(ceuNoturno());
    return s;
  }
  const s = new THREE.Scene();
  const ceu = new Sky();
  ceu.scale.setScalar(1000);
  const u = ceu.material.uniforms;
  u.turbidity.value = p.turbidez;
  u.rayleigh.value = p.rayleigh;
  u.mieCoefficient.value = 0.0025; // halo do sol contido: na hora dourada, o sol baixo não estoura a imagem
  u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.set(...p.sol);
  if (u.cloudCoverage) {
    u.cloudCoverage.value = 0.3; // menos nuvens: o céu do alto do quadro fica azul, não branco (ADR-33)
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
export function criarFundo(renderer: THREE.WebGLRenderer, ceu: Ceu = CEU_PADRAO): Fundo {
  const cena = cenaDoCeu(ceu);
  const alvo = new THREE.WebGLCubeRenderTarget(1024, { type: THREE.HalfFloatType });
  const cubo = new THREE.CubeCamera(0.1, 5000, alvo);
  const tom = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  cubo.update(renderer, cena);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const ambiente = pmrem.fromScene(cena, 0, 0.1, 5000);
  renderer.toneMapping = tom;
  pmrem.dispose();
  const malhaCeu = cena.children[0] as THREE.Mesh;
  (malhaCeu.material as THREE.Material).dispose();
  malhaCeu.geometry.dispose();
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
    // cada foto que falhar fica de fora: o material volta à textura procedural (funciona sem rede)
    await Promise.all(
      (Object.keys(ARQUIVO) as Foto[]).map(async (f) => {
        try {
          const [map, normalMap, roughnessMap] = await Promise.all([um(`${ARQUIVO[f]}_cor`, true), um(`${ARQUIVO[f]}_normal`, false), um(`${ARQUIVO[f]}_rugosidade`, false)]);
          for (const t of [map, normalMap, roughnessMap]) t.repeat.set(1 / ESCALA_FOTO[f], 1 / ESCALA_FOTO[f]);
          out.set(f, { map, normalMap, roughnessMap });
        } catch {
          /* fica a procedural */
        }
      }),
    );
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
  if (f.get("grama")) matCampo.color.setRGB(...tingir("grama", TOM_GRAMADO)); // verde seco de lote: a foto pura sai marrom-escura (ADR-33)
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
export const neblina = (raio: number, cor: number = 0xbcd0e6) => new THREE.Fog(cor, Math.max(raio * 10, 90), Math.max(raio * 90, 900));

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

// ------------------------------------------------------------------ entorno (ADR-31)

/** Caixa com coordenadas de textura em metros (as fotos repetem na escala real). */
function caixaMetros(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.getAttribute("position"), n = g.getAttribute("normal");
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ay = Math.abs(n.getY(i)) > 0.5, ax = Math.abs(n.getX(i)) > 0.5;
    uv[i * 2] = ay || !ax ? p.getX(i) : p.getZ(i);
    uv[i * 2 + 1] = ay ? p.getZ(i) : p.getY(i);
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Telhado de duas águas (prisma) sobre uma caixa w × d, cumeeira paralela a x. */
function telhado(w: number, d: number, altura: number, beiral: number): THREE.BufferGeometry {
  const W = w / 2 + beiral, D = d / 2 + beiral;
  const v = [
    [-W, 0, -D], [W, 0, -D], [W, 0, D], [-W, 0, D], [-W, altura, 0], [W, altura, 0],
  ];
  const f = [[0, 4, 5], [0, 5, 1], [3, 2, 5], [3, 5, 4], [0, 3, 4], [1, 5, 2]];
  const pos: number[] = [];
  for (const [a, b, c] of f) for (const k of [a, b, c]) pos.push(...v[k]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // textura em metros: águas pelo comprimento ao longo da inclinação; empenas (normal em x) pelo plano zy
  const n = g.getAttribute("normal"), uv: number[] = [];
  for (let i = 0; i < pos.length / 3; i++) {
    const [x, yy, z] = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
    if (Math.abs(n.getX(i)) > 0.5) uv.push(z, yy);
    else uv.push(x, Math.hypot(z, yy));
  }
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// fachadas de bairro: tons de areia, terracota clara, verde-acinzentado, azul-acinzentado e ocre
const CORES_VIZINHOS: [number, number, number][] = [[205, 188, 160], [196, 150, 120], [168, 178, 160], [160, 172, 184], [214, 186, 128], [190, 182, 170]];

/** Alturas das divisas (ADR-33): muro alto atrás da fachada; na frente, mureta com gradil, que não tampa a obra. */
export const MURO_ALTO = 1.8, MURETA = 0.5, GRADIL = 1.4, VAO_PORTAO = 3;

export interface TrechoMuro {
  tipo: "alto" | "baixo";
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * Divisas do lote (ADR-33), puras: na frente (z = `lote.z1`), mureta com gradil e o portão aberto de
 * `VAO_PORTAO` no eixo da porta de entrada (o caminho do drone); nas laterais, mureta com gradil do alinhamento
 * até a fachada frontal e muro alto dali ao fundo; no fundo, muro alto. Espessura `em`, por fora do lote.
 */
export function trechosDoMuro(lote: { x0: number; x1: number; z0: number; z1: number }, frente: { zFachada: number; xPorta: number | null }, em = 0.15): TrechoMuro[] {
  const t: TrechoMuro[] = [];
  const zCorte = Math.min(Math.max(frente.zFachada, lote.z0), lote.z1);
  for (const [xa, xb] of [[lote.x0 - em, lote.x0], [lote.x1, lote.x1 + em]]) {
    if (lote.z1 - zCorte > 0.05) t.push({ tipo: "baixo", x0: xa, x1: xb, z0: zCorte, z1: lote.z1 });
    if (zCorte - lote.z0 > 0.05) t.push({ tipo: "alto", x0: xa, x1: xb, z0: lote.z0, z1: zCorte });
  }
  t.push({ tipo: "alto", x0: lote.x0 - em, x1: lote.x1 + em, z0: lote.z0 - em, z1: lote.z0 });
  const xp = Math.min(Math.max(frente.xPorta ?? (lote.x0 + lote.x1) / 2, lote.x0 + VAO_PORTAO / 2), lote.x1 - VAO_PORTAO / 2);
  const zf = [lote.z1, lote.z1 + em];
  if (xp - VAO_PORTAO / 2 > lote.x0) t.push({ tipo: "baixo", x0: lote.x0 - em, x1: xp - VAO_PORTAO / 2, z0: zf[0], z1: zf[1] });
  if (xp + VAO_PORTAO / 2 < lote.x1) t.push({ tipo: "baixo", x0: xp + VAO_PORTAO / 2, x1: lote.x1 + em, z0: zf[0], z1: zf[1] });
  return t;
}

/**
 * Entorno de uma casa em lote urbano (ADR-31): calçada, meio-fio e rua asfaltada na frente (+z), muros nas
 * divisas (ADR-33: mureta com gradil na frente, muro alto atrás da fachada), casas vizinhas simples e árvores na calçada. Os vizinhos e as árvores ficam fora do caminho do
 * drone (além de 2,6 × o raio da casa, e as árvores fora do eixo da fachada). Determinístico.
 */
export function montarEntorno(f: Map<Foto, MapasFoto>, lote: { x0: number; x1: number; z0: number; z1: number }, y: number, centro: P3, raio: number, frente: { zFachada: number; xPorta: number | null } = { zFachada: lote.z1, xPorta: null }): THREE.Group {
  const g = new THREE.Group();
  g.name = "entorno";
  const rnd = aleatorio(7);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, yy: number, z: number, sombra = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, yy, z);
    m.castShadow = sombra;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const tingido = (foto: Foto, cor: [number, number, number], reserva: string) => {
    const mat = materialFoto(f.get(foto), new THREE.Color(reserva));
    if (f.get(foto)) mat.color.setRGB(...tingir(foto, cor));
    return mat;
  };
  // tons médios: branco puro ao sol estoura a imagem (ADR-31)
  const calcada = tingido("concreto", [158, 153, 144], "#9e9990");
  const asfalto = semRepeticao(tingido("concreto", [64, 65, 68], "#404144"));
  // asfalto fosco: sem o mapa de rugosidade do concreto, que contra o sol brilhava e deixava a rua bege (ADR-33)
  asfalto.roughnessMap = null;
  asfalto.roughness = 1;
  asfalto.envMapIntensity = 0.4;
  const meioFio = tingido("concreto", [176, 173, 166], "#b0ada6");
  const muro = tingido("reboco", [186, 176, 160], "#bab0a0");
  const faixa = new THREE.MeshStandardMaterial({ color: 0xe8e2c8, roughness: 0.8 });

  const L = 160; // extensão da rua para cada lado
  const cx = (lote.x0 + lote.x1) / 2;
  // frente: calçada (2,5 m), meio-fio, rua (8 m), meio-fio e calçada do outro lado
  const zCal = lote.z1, zRua = zCal + 2.5 + 0.15;
  add(caixaMetros(2 * L, 0.12, 2.5), calcada, cx, y + 0.06, zCal + 1.25, false);
  add(caixaMetros(2 * L, 0.15, 0.15), meioFio, cx, y + 0.075, zCal + 2.5 + 0.075, false);
  // o asfalto fica um pouco acima do gramado (que vai até o horizonte por baixo de tudo)
  add(caixaMetros(2 * L, 0.04, 8), asfalto, cx, y + 0.02, zRua + 4, false);
  for (let x = -L; x < L; x += 6) add(new THREE.BoxGeometry(3, 0.01, 0.12), faixa, cx + x, y + 0.045, zRua + 4, false);
  add(caixaMetros(2 * L, 0.15, 0.15), meioFio, cx, y + 0.075, zRua + 8 + 0.075, false);
  add(caixaMetros(2 * L, 0.12, 2.5), calcada, cx, y + 0.06, zRua + 8 + 1.4, false);

  // divisas (ADR-33): muro alto atrás da fachada; na frente, mureta com gradil de barras finas e portão aberto
  const larg = lote.x1 - lote.x0;
  const metal = new THREE.MeshStandardMaterial({ color: 0x26282b, roughness: 0.55, metalness: 0.6 });
  const barras: THREE.Matrix4[] = [];
  for (const t of trechosDoMuro(lote, frente)) {
    const w = t.x1 - t.x0, d = t.z1 - t.z0, mx = (t.x0 + t.x1) / 2, mz = (t.z0 + t.z1) / 2;
    const h = t.tipo === "alto" ? MURO_ALTO : MURETA;
    add(caixaMetros(w, h, d), muro, mx, y + h / 2, mz);
    if (t.tipo === "alto") continue;
    // corrimão no alto do gradil e barras verticais a cada 12 cm, ao longo do trecho
    add(new THREE.BoxGeometry(Math.max(w, 0.04), 0.05, Math.max(d, 0.04)), metal, mx, y + GRADIL, mz);
    const ao = w >= d ? "x" : "z", comp = Math.max(w, d);
    for (let k = 0.06; k < comp; k += 0.12) barras.push(new THREE.Matrix4().makeTranslation(ao === "x" ? t.x0 + k : mx, y + (MURETA + GRADIL) / 2, ao === "z" ? t.z0 + k : mz));
  }
  if (barras.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.02, GRADIL - MURETA, 0.02), metal, barras.length);
    barras.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true;
    im.receiveShadow = true;
    g.add(im);
  }

  // casas vizinhas: dos dois lados e do outro lado da rua, sempre além do voo do drone
  const longe = 2.6 * raio;
  // cada casa vizinha e cada árvore é um grupo "ocultável": some no quadro em que fica entre a câmera e a obra
  // as casas do outro lado da rua ficam atrás da câmera nas vistas da frente: com o sol vindo da frente, a sombra
  // delas caía na rua em degraus, sem a casa no quadro (ADR-33); por isso não fazem sombra
  const casa = (x: number, z: number, sombra = true) => {
    const w = 7 + rnd() * 3, d = 9 + rnd() * 3, h = rnd() < 0.35 ? 5.8 : 3.1;
    const cor = CORES_VIZINHOS[Math.floor(rnd() * CORES_VIZINHOS.length)];
    const grupo = new THREE.Group();
    grupo.userData.ocultavel = true;
    grupo.add(add(caixaMetros(w, h, d), tingido("reboco", cor, "#e2dac8"), x, y + h / 2, z, sombra));
    grupo.add(add(telhado(w, d, 1.4 + rnd() * 0.5, 0.5), tingido("telha-ceramica", [150 + rnd() * 20, 82, 48], "#96523a"), x, y + h, z, sombra)); // cumeeira paralela à rua
    g.add(grupo);
  };
  for (const lado of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const x = cx + lado * Math.max(longe, larg / 2 + 6) + lado * k * 12;
      if (Math.abs(x - centro[0]) < longe) continue;
      casa(x, lote.z1 - 9);
    }
  }
  for (let k = -5; k <= 5; k++) casa(cx + k * 12 + (rnd() - 0.5) * 2, zRua + 8 + 2.5 + 9, false);
  // fundo: uma fileira de casas atrás do lote, também além do voo
  const zFundo = Math.min(lote.z0 - 7, centro[2] - longe - 5);
  for (let k = -4; k <= 4; k++) casa(cx + k * 12 + (rnd() - 0.5) * 3, zFundo);

  // árvores na calçada, fora do eixo da fachada (onde o drone se aproxima)
  for (let x = -L / 2; x <= L / 2; x += 10) {
    if (Math.abs(cx + x - centro[0]) < 1.8 * raio) continue;
    const r = 1.8 + rnd() * 0.8, h = 5 + rnd() * 2;
    const a = arvore(new THREE.Box3(new THREE.Vector3(cx + x - r, y, zCal + 1.6 - r), new THREE.Vector3(cx + x + r, y + h, zCal + 1.6 + r)), 500 + Math.round(x));
    a.userData.ocultavel = true;
    g.add(a);
  }
  return g;
}

/** Até esta distância da câmera (m), um vizinho ou uma árvore só entraria no quadro como um pedaço cortado na borda. */
export const PERTO_DA_CAMERA = 6;

/**
 * O que do entorno tampa a obra vista de `camera` (ADR-31): grupos ocultáveis com a câmera dentro (com folga),
 * colados à câmera (a menos de `perto`: o telhado do vizinho entrava cortado na borda do quadro) ou cortando algum
 * dos raios da câmera ao centro, ao topo e às laterais da obra. Puro sobre caixas: testado no Node.
 */
export function tampamAVista(camera: THREE.Vector3, alvos: THREE.Vector3[], caixas: THREE.Box3[], folga = 0.6, perto = PERTO_DA_CAMERA): boolean[] {
  const raio = new THREE.Ray();
  const dir = new THREE.Vector3(), ponto = new THREE.Vector3();
  return caixas.map((c) => {
    const b = c.clone().expandByScalar(folga);
    if (b.containsPoint(camera) || c.distanceToPoint(camera) < perto) return true;
    return alvos.some((alvo) => {
      dir.subVectors(alvo, camera);
      const dist = dir.length();
      raio.set(camera, dir.normalize());
      const hit = raio.intersectBox(c, ponto);
      return !!hit && hit.distanceTo(camera) < dist;
    });
  });
}
