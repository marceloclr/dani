// Presets e roteiro de câmera (§20, §21). Matemática pura, sem Three.js: testável no Node.
// Convenção da cena (web-ifc): Y para cima; a frente da casa fica em +z.
// Azimute 0 = câmera na frente (+z); 90° = lateral leste (+x).

export type Preset = "externa" | "isometrica" | "superior" | "frontal" | "lateral" | "orbita";

export const PRESETS: { id: Preset; rotulo: string; dica: string }[] = [
  { id: "externa", rotulo: "Externa", dica: "Do ponto de vista de quem passa na rua, à altura dos olhos." },
  { id: "isometrica", rotulo: "Isométrica", dica: "Vista de cima, a 45°, a partir da frente à esquerda. Também serve para reiniciar a câmera." },
  { id: "superior", rotulo: "Superior", dica: "Vista de cima, com o fundo do lote para o alto da tela." },
  { id: "frontal", rotulo: "Frontal", dica: "Vista da fachada da frente." },
  { id: "lateral", rotulo: "Lateral", dica: "Vista da fachada lateral leste." },
  { id: "orbita", rotulo: "Órbita", dica: "Gira em volta da casa. No vídeo, dá uma volta completa do início ao fim." },
];

export type Vec3 = [number, number, number];

/**
 * Pose em coordenadas esféricas em torno do alvo. `dist` é relativa à distância de
 * enquadramento, para a mesma pose servir a qualquer proporção de tela.
 */
export interface Pose {
  az: number; // rad
  el: number; // rad
  dist: number; // 1 = enquadra a caixa inteira
  alvo: Vec3;
}

export interface Enquadramento {
  centro: Vec3;
  raio: number;
}

const grau = (g: number) => (g * Math.PI) / 180;

/** Pose de um preset. Para Órbita, `fracao` (0..1) é a posição na volta. */
export function poseDoPreset(p: Preset, e: Enquadramento, fracao = 0): Pose {
  const c = e.centro;
  switch (p) {
    case "frontal":
      return { az: 0, el: grau(6), dist: 1, alvo: c };
    case "lateral":
      return { az: grau(90), el: grau(6), dist: 1, alvo: c };
    case "isometrica":
      return { az: grau(-45), el: grau(35), dist: 1, alvo: c };
    case "superior":
      return { az: 0, el: grau(89), dist: 0.95, alvo: c };
    case "externa":
      return { az: grau(-28), el: grau(4), dist: 1.15, alvo: [c[0], c[1] - e.raio * 0.15, c[2]] };
    case "orbita":
      return { az: grau(-45) + 2 * Math.PI * fracao, el: grau(24), dist: 1.05, alvo: c };
  }
}

/** Distância que enquadra uma esfera de raio `raio` com o campo de visão vertical `fovGraus`. */
export function distanciaDeEnquadramento(raio: number, fovGraus: number, aspecto: number): number {
  const v = grau(fovGraus);
  const h = 2 * Math.atan(Math.tan(v / 2) * aspecto);
  return (raio / Math.sin(Math.min(v, h) / 2)) * 0.92;
}

export function posicaoDaPose(p: Pose, distEnquadramento: number): Vec3 {
  const d = p.dist * distEnquadramento;
  return [p.alvo[0] + d * Math.cos(p.el) * Math.sin(p.az), p.alvo[1] + d * Math.sin(p.el), p.alvo[2] + d * Math.cos(p.el) * Math.cos(p.az)];
}

export function poseDaPosicao(posicao: Vec3, alvo: Vec3, distEnquadramento: number): Pose {
  const dx = posicao[0] - alvo[0], dy = posicao[1] - alvo[1], dz = posicao[2] - alvo[2];
  const d = Math.hypot(dx, dy, dz) || 1e-6;
  return { az: Math.atan2(dx, dz), el: Math.asin(Math.max(-1, Math.min(1, dy / d))), dist: d / distEnquadramento, alvo: [...alvo] as Vec3 };
}

// ------------------------------------------------------------------ roteiro

export interface PontoRoteiro {
  segundo: number;
  camera: Preset | "capturada";
  captura?: Pose; // quando camera = "capturada"
}

/** Roteiro do §21 (frontal → isométrica → lateral → superior), escalado para a duração. */
export function roteiroPadrao(segundos: number): PontoRoteiro[] {
  return [
    { segundo: 0, camera: "frontal" },
    { segundo: segundos / 3, camera: "isometrica" },
    { segundo: (2 * segundos) / 3, camera: "lateral" },
    { segundo: segundos, camera: "superior" },
  ];
}

const smoothstep = (u: number) => u * u * (3 - 2 * u);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Diferença angular pelo caminho mais curto, em (−π, π]. */
export function deltaAngular(de: number, para: number): number {
  let d = (para - de) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

export function interpolarPose(a: Pose, b: Pose, u: number): Pose {
  return {
    az: a.az + deltaAngular(a.az, b.az) * u,
    el: lerp(a.el, b.el, u),
    dist: lerp(a.dist, b.dist, u),
    alvo: [lerp(a.alvo[0], b.alvo[0], u), lerp(a.alvo[1], b.alvo[1], u), lerp(a.alvo[2], b.alvo[2], u)],
  };
}

function poseDoPonto(p: PontoRoteiro, e: Enquadramento, t: number, duracao: number): Pose {
  if (p.camera === "capturada") return p.captura ?? poseDoPreset("isometrica", e);
  return poseDoPreset(p.camera, e, duracao > 0 ? t / duracao : 0);
}

/** Pose da câmera no segundo `t` do vídeo, com transição suave entre pontos-chave. */
export function poseNoTempo(roteiro: PontoRoteiro[], e: Enquadramento, t: number, duracao: number): Pose {
  if (roteiro.length === 0) return poseDoPreset("isometrica", e);
  const r = [...roteiro].sort((x, y) => x.segundo - y.segundo);
  if (t <= r[0].segundo) return poseDoPonto(r[0], e, t, duracao);
  const ultimo = r[r.length - 1];
  if (t >= ultimo.segundo) return poseDoPonto(ultimo, e, t, duracao);
  let i = 0;
  while (r[i + 1].segundo < t) i++;
  const a = r[i], b = r[i + 1];
  const u = smoothstep((t - a.segundo) / (b.segundo - a.segundo || 1));
  return interpolarPose(poseDoPonto(a, e, t, duracao), poseDoPonto(b, e, t, duracao), u);
}

// ------------------------------------------------------------------ tempo da obra → tempo do vídeo (§23)

/** Número de quadros do vídeo. */
export const totalDeQuadros = (segundos: number, fps: number) => Math.round(segundos * fps);

/** Dia (fracionário) mostrado no quadro i de n: do primeiro ao último dia da obra. */
export function diaDoQuadro(i: number, n: number, diasDeObra: number): number {
  if (n <= 1) return diasDeObra - 1;
  // o dia k vai de k a k+1; o último quadro fica no fim do último dia (casa concluída)
  return (i / (n - 1)) * diasDeObra - (i === n - 1 ? 1e-6 : 0);
}
