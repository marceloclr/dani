// Montagem em cenas (ADR-25): o vídeo vira uma sequência de cenas com cortes secos sobre a fala
// contínua da apresentadora, como nos Reels de arquitetura. Puro, sem DOM: testado no Node.
import { poseDoPreset, type Enquadramento, type Pose, type Preset } from "./cameras";

export type TipoCena = "fala" | "revelacao" | "obra" | "marca";
export type CameraCena = "drone" | Preset;
export type PessoaNaCena = "cheia" | "recortada" | "oculta";

export interface Cena {
  id: string;
  tipo: TipoCena;
  /** Parte do vídeo que cabe à cena: as durações acompanham a duração do vídeo (e da fala). */
  peso: number;
  camera: CameraCena;
  /** Avanço da obra (0 = terreno, 1 = pronta) no começo e no fim da cena. */
  obra: [number, number];
  /** Como a apresentadora aparece: o quadro original inteiro, recortada no canto ou fora. */
  pessoa: PessoaNaCena;
}

export const NOME_CENA: Record<TipoCena, string> = { fala: "Fala no terreno", revelacao: "Revelação", obra: "Obra", marca: "Marca" };

/** Duração mínima de uma cena, em segundos. */
export const MINIMO_CENA_S = 0.8;

const cena = (id: string, tipo: TipoCena, peso: number, camera: CameraCena, obra: [number, number], pessoa: PessoaNaCena): Cena => ({ id, tipo, peso, camera, obra, pessoa });

/**
 * Roteiro Reels. Com a fala: abertura com ela no terreno, revelação do projeto atrás dela (a obra sobe
 * do terreno à pronta), passeio do drone pela obra pronta, volta dela em primeiro plano e a marca.
 * Sem a fala: a obra se monta, o drone passeia e a marca fecha.
 */
export function roteiroReels(temFala: boolean): Cena[] {
  return temFala
    ? [
        cena("abertura", "fala", 0.15, "frontal", [0, 0], "cheia"),
        cena("revelacao", "revelacao", 0.25, "frontal", [0, 1], "cheia"),
        cena("passeio", "obra", 0.4, "drone", [1, 1], "oculta"),
        cena("volta", "obra", 0.12, "orbita", [1, 1], "recortada"),
        cena("marca", "marca", 0.08, "frontal", [1, 1], "oculta"),
      ]
    : [
        cena("montagem", "obra", 0.4, "isometrica", [0, 1], "oculta"),
        cena("passeio", "obra", 0.5, "drone", [1, 1], "oculta"),
        cena("marca", "marca", 0.1, "frontal", [1, 1], "oculta"),
      ];
}

/**
 * Deixa a lista pronta para gerar: só cenas possíveis (sem fala, nada de `fala`/`revelacao` nem pessoa),
 * pesos positivos com pelo menos 0,8 s por cena, e uma única `marca`, a última.
 */
export function normalizar(cenas: Cena[], total: number, temFala: boolean): Cena[] {
  let l = cenas.filter((c) => temFala || (c.tipo !== "fala" && c.tipo !== "revelacao")).map((c) => ({ ...c, pessoa: temFala ? c.pessoa : "oculta", peso: Math.max(0, c.peso) || 0 }));
  const marcas = l.filter((c) => c.tipo === "marca");
  l = l.filter((c) => c.tipo !== "marca");
  if (marcas.length) l.push(marcas[marcas.length - 1]);
  if (!l.length) return roteiroReels(temFala);
  const minimo = Math.min(1 / l.length, MINIMO_CENA_S / Math.max(total, 1e-6));
  let soma = l.reduce((s, c) => s + c.peso, 0);
  if (!(soma > 0)) {
    l.forEach((c) => (c.peso = 1));
    soma = l.length;
  }
  // garante o mínimo e redistribui o resto proporcionalmente
  const frac = l.map((c) => c.peso / soma);
  const curtas = frac.map((f) => f < minimo);
  const resto = 1 - minimo * curtas.filter(Boolean).length;
  const somaLongas = frac.reduce((s, f, i) => (curtas[i] ? s : s + f), 0);
  return l.map((c, i) => ({ ...c, peso: curtas[i] ? minimo : (frac[i] / (somaLongas || 1)) * resto }));
}

export interface PontoNaMontagem {
  indice: number;
  cena: Cena;
  /** Começo e fim da cena, em segundos. */
  inicio: number;
  fim: number;
  /** Posição dentro da cena (0 a 1). */
  u: number;
}

/** Em que cena está o segundo `t` de um vídeo de `total` segundos (o último instante cai na última cena). */
export function cenaNoTempo(cenas: Cena[], t: number, total: number): PontoNaMontagem {
  const soma = cenas.reduce((s, c) => s + c.peso, 0) || 1;
  let inicio = 0;
  for (let i = 0; i < cenas.length; i++) {
    const fim = i === cenas.length - 1 ? total : inicio + (cenas[i].peso / soma) * total;
    if (t < fim || i === cenas.length - 1) {
      const u = fim > inicio ? Math.min(1, Math.max(0, (t - inicio) / (fim - inicio))) : 1;
      return { indice: i, cena: cenas[i], inicio, fim, u };
    }
    inicio = fim;
  }
  throw new Error("montagem sem cenas");
}

/** Segundos de cada cena (para a faixa da interface). */
export function duracoes(cenas: Cena[], total: number): number[] {
  const soma = cenas.reduce((s, c) => s + c.peso, 0) || 1;
  return cenas.map((c) => (c.peso / soma) * total);
}

/** Avanço da obra dentro da cena, com início e fim suaves. */
export function obraNaCena(c: Cena, u: number): number {
  const s = u * u * (3 - 2 * u);
  return c.obra[0] + (c.obra[1] - c.obra[0]) * s;
}

/** Largura da borda suave da cortina, em fração da altura. */
export const BORDA_CORTINA = 0.12;

/**
 * Opacidade do fundo real na altura `y` do quadro (0 = embaixo, 1 = em cima) quando a revelação está em
 * `u`: a obra **sobe**, então o fundo some de baixo para cima, com borda suave. 1 em u = 0 (fundo
 * inteiro), 0 em u = 1 (só a obra atrás da pessoa). Mesma conta do shader.
 */
export function cortinaRevelacao(u: number, y: number): number {
  const b = BORDA_CORTINA;
  const frente = -b + u * (1 + 2 * b); // a frente da obra vai de abaixo do quadro a acima dele
  const t = Math.min(1, Math.max(0, (y - frente + b) / (2 * b)));
  return t * t * (3 - 2 * t);
}

/**
 * Câmera de uma cena com vista (não drone): o preset com movimento lento, como num Reels: a órbita
 * anda 15 % da volta; as outras vistas se aproximam 8 % e giram 3,4°.
 */
export function poseDaCena(camera: Preset, e: Enquadramento, u: number): Pose {
  if (camera === "orbita") return poseDoPreset("orbita", e, 0.15 * u);
  const p = poseDoPreset(camera, e);
  return { ...p, az: p.az + 0.06 * u, dist: p.dist * (1 - 0.08 * u) };
}

/** Trecho do voo do drone (0 a 1) numa cena: a montagem até `fimConstrucao`, o passeio pela obra pronta depois. */
export function trechoDoVoo(c: Cena, u: number, fimConstrucao: number): number {
  return c.obra[0] >= 1 ? fimConstrucao + u * (1 - fimConstrucao) : u * fimConstrucao;
}
