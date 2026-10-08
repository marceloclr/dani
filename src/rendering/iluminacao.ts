// Luz da cena (ADR-24 e ADR-26): a luz sai da elevação do sol real (local, data e hora), em faixas
// interpoladas do dia à noite, e as luminárias da obra pronta. Puro, sem Three.js, testado no Node: as
// luminárias saem do próprio IFC (o meio de cada cômodo, logo abaixo da laje).
import { caixaDe, escadas, gradeDoPavimento, type Caixa2D, type P3, type Solido } from "./navegacao";
import type { Efemerides } from "./sol";

/** Luz escolhida: um horário do dia ou o ciclo (o horário corre durante o voo e o vídeo). */
export type Luz = "nascer" | "dia" | "entardecer" | "noite" | "ciclo";

export const NOME_LUZ: Record<Luz, string> = { nascer: "Nascer", dia: "Dia", entardecer: "Entardecer", noite: "Noite", ciclo: "Ciclo" };

/** Horário (minutos locais) de cada luz no dia da simulação. Parado (fora de um voo), o Ciclo mostra o Dia. */
export function minutosDaLuz(luz: Luz, e: Efemerides): number {
  switch (luz) {
    case "nascer":
      return e.nascer + 20;
    case "entardecer":
      return e.por - 35;
    case "noite":
      return e.por + 50;
    default:
      return 10 * 60;
  }
}

export interface ParametrosLuz {
  corSol: number;
  intensidadeSol: number;
  /** Céu (hemisfério) e chão refletido. */
  corCeu: number;
  corChao: number;
  intensidadeCeu: number;
  /** Peso dos reflexos do céu. */
  intensidadeAmbiente: number;
  /** Luminárias da casa (0 = apagadas, 1 = plenas). */
  luminarias: number;
  exposicao: number;
  /** Turbidez e Rayleigh do céu de Preetham (mais altos = céu mais dourado). */
  turbidez: number;
  rayleigh: number;
  /** Cor da neblina do horizonte. */
  corNeblina: number;
  /** Brilho (bloom) das fontes de luz: só com o céu escuro o bastante. */
  brilho: boolean;
  /** Céu da noite (degradê com estrelas) no lugar do de Preetham. */
  ceuNoturno: boolean;
}

type Numericos = Omit<ParametrosLuz, "brilho" | "ceuNoturno">;

/** Pontos de controle pela elevação do sol (graus), do mais alto ao mais baixo. Abaixo de 0°, o "sol" é o luar. */
const FAIXAS: [number, Numericos][] = [
  // dia: sol mais forte que o céu (sombra com contraste), céu limpo e azul, exposição contida para o branco não estourar (ADR-31)
  [25, { corSol: 0xfff1de, intensidadeSol: 3.2, corCeu: 0xd4e3f4, corChao: 0x6e5c46, intensidadeCeu: 0.72, intensidadeAmbiente: 0.34, luminarias: 0, exposicao: 0.74, turbidez: 2.6, rayleigh: 1.9, corNeblina: 0xbcd0e6 }],
  [10, { corSol: 0xffe0b0, intensidadeSol: 2.6, corCeu: 0xe6e0d4, corChao: 0x66553f, intensidadeCeu: 0.95, intensidadeAmbiente: 0.42, luminarias: 0, exposicao: 0.86, turbidez: 5.5, rayleigh: 1.6, corNeblina: 0xd4d3cc }],
  // entardecer (ADR-32): dourado no sol, mas céu limpo do azul ao laranja (turbidez baixa) e exposição contida;
  // a correção de cor não aquece de novo (temperatura 0 com o sol baixo)
  [3, { corSol: 0xffb36e, intensidadeSol: 2.5, corCeu: 0xc9d2e4, corChao: 0x5a4a3c, intensidadeCeu: 0.5, intensidadeAmbiente: 0.32, luminarias: 0.55, exposicao: 0.88, turbidez: 3.6, rayleigh: 2.2, corNeblina: 0xc8bfb6 }],
  [-2, { corSol: 0xc98a7c, intensidadeSol: 0.55, corCeu: 0x8a8fb8, corChao: 0x3a3238, intensidadeCeu: 0.5, intensidadeAmbiente: 0.3, luminarias: 0.9, exposicao: 1.1, turbidez: 3, rayleigh: 3, corNeblina: 0x6f6a8a }],
  [-8, { corSol: 0x8fa8d8, intensidadeSol: 0.45, corCeu: 0x6a80b0, corChao: 0x2a2a30, intensidadeCeu: 0.6, intensidadeAmbiente: 0.25, luminarias: 1, exposicao: 1.15, turbidez: 2, rayleigh: 3, corNeblina: 0x28324a }],
];

const misturaCor = (a: number, b: number, t: number) => {
  const c = (x: number, s: number) => (x >> s) & 255;
  return [16, 8, 0].reduce((v, s) => v | (Math.round(c(a, s) + (c(b, s) - c(a, s)) * t) << s), 0);
};

/** Parâmetros da luz para o sol na elevação `e` (graus): contínuos, sem degraus entre as faixas. */
export function parametrosDoSol(e: number): ParametrosLuz {
  const i = FAIXAS.findIndex(([lim]) => e >= lim);
  let base: Numericos;
  if (i === 0) base = FAIXAS[0][1];
  else if (i < 0) base = FAIXAS[FAIXAS.length - 1][1];
  else {
    const [ea, a] = FAIXAS[i - 1], [eb, b] = FAIXAS[i];
    const t = (ea - e) / (ea - eb);
    base = Object.fromEntries(
      (Object.keys(a) as (keyof Numericos)[]).map((k) => [k, k.startsWith("cor") ? misturaCor(a[k], b[k], t) : a[k] + (b[k] - a[k]) * t]),
    ) as Numericos;
  }
  return { ...base, brilho: e < 0, ceuNoturno: e < -4 }; // com o sol acima do horizonte, o céu passaria do limiar do brilho
}

/** Direção da luz direcional: o sol acima do horizonte; abaixo, o luar, alto e do lado oposto. */
export function direcaoDaLuz(sol: P3): P3 {
  if (sol[1] >= 0.02) return sol;
  const h = Math.hypot(sol[0], sol[2]) || 1;
  const v: P3 = [(-sol[0] / h) * 0.6, 0.8, (-sol[2] / h) * 0.6];
  return v;
}

export interface Luminaria {
  /** Ponto logo abaixo do teto, no meio do cômodo. */
  pos: P3;
  /** Distância livre até a parede mais próxima (m): cômodos maiores ganham luz mais forte. */
  folga: number;
}

const LAJES = new Set(["IfcSlab", "IfcRoof", "IfcCovering"]);

/**
 * Luminárias da obra pronta: em cada pavimento (térreo e o topo de cada escada), as células do mapa de
 * ocupação mais distantes das paredes são o meio dos cômodos; escolhe as mais centrais com 2,8 m entre si
 * (no máximo 8 por pavimento). O teto é a face de baixo da laje acima do ponto, ou 2,6 m sem laje.
 */
export function luminarias(solidos: Solido[]): Luminaria[] {
  const paredes = solidos.filter((s) => s.ifcType === "IfcWall" || s.ifcType === "IfcWallStandardCase");
  if (!paredes.length) return [];
  const cx = paredes.map(caixaDe);
  // interior: a caixa das paredes, um pouco recolhida (como no voo do drone)
  const interior: Caixa2D = {
    x0: Math.min(...cx.map((b) => b.min[0])) + 0.2,
    x1: Math.max(...cx.map((b) => b.max[0])) - 0.2,
    z0: Math.min(...cx.map((b) => b.min[2])) + 0.2,
    z1: Math.max(...cx.map((b) => b.max[2])) - 0.2,
  };
  const piso = Math.min(...paredes.map((s) => caixaDe(s).min[1]));
  const niveis = [piso, ...escadas(solidos).map((e) => e.pisoAlto)].sort((a, b) => a - b).filter((n, i, a) => i === 0 || n - a[i - 1] > 1.5);
  const lajes = solidos.filter((s) => LAJES.has(s.ifcType)).map(caixaDe);
  const out: Luminaria[] = [];
  for (const nivel of niveis) {
    const g = gradeDoPavimento(solidos, nivel, interior, 0.2, 0.2);
    const cand: { x: number; z: number; d: number }[] = [];
    for (let j = 0; j < g.nz; j++)
      for (let i = 0; i < g.nx; i++) {
        const k = j * g.nx + i;
        if (!g.livre[k] || g.distancia[k] < 0.8) continue;
        cand.push({ x: g.x0 + (i + 0.5) * g.passo, z: g.z0 + (j + 0.5) * g.passo, d: g.distancia[k] });
      }
    cand.sort((a, b) => b.d - a.d || a.x - b.x || a.z - b.z);
    const escolhidas: typeof cand = [];
    for (const c of cand) {
      if (escolhidas.length >= 8) break;
      if (escolhidas.every((e) => Math.hypot(e.x - c.x, e.z - c.z) >= 2.8)) escolhidas.push(c);
    }
    for (const c of escolhidas) {
      const acima = lajes.filter((b) => b.min[1] > nivel + 1.8 && c.x >= b.min[0] && c.x <= b.max[0] && c.z >= b.min[2] && c.z <= b.max[2]).map((b) => b.min[1]);
      const teto = acima.length ? Math.min(...acima) : nivel + 2.6;
      out.push({ pos: [c.x, Math.min(teto, nivel + 3.2) - 0.06, c.z], folga: c.d });
    }
  }
  return out;
}
