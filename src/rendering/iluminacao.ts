// Luz da cena (ADR-24): dia, entardecer e noite, e as luminárias da obra pronta. Puro, sem Three.js,
// testado no Node: as luminárias saem do próprio IFC (o meio de cada cômodo, logo abaixo da laje).
import { caixaDe, escadas, gradeDoPavimento, type Caixa2D, type P3, type Solido } from "./navegacao";

export type Luz = "dia" | "entardecer" | "noite";

export interface ParametrosLuz {
  /** Direção do sol (para onde ele está, a partir da cena), normalizada. */
  sol: P3;
  corSol: number;
  intensidadeSol: number;
  /** Céu (hemisfério) e chão refletido. */
  corCeu: number;
  corChao: number;
  intensidadeCeu: number;
  /** Peso dos reflexos do céu. */
  intensidadeAmbiente: number;
  /** Luminárias da casa (0 = apagadas). */
  luminarias: number;
  exposicao: number;
  /** Turbidez e Rayleigh do céu de Preetham (mais altos = céu mais dourado no entardecer). */
  turbidez: number;
  rayleigh: number;
}

const norm = (v: P3): P3 => {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};

/**
 * Parâmetros de cada luz. O sol fica sempre do lado da frente e da direita (as fachadas da frente
 * recebem a luz, ADR-21): alto de dia, a 6° no entardecer e abaixo do horizonte à noite (hora azul).
 */
export const LUZES: Record<Luz, ParametrosLuz> = {
  dia: { sol: norm([0.65, 0.7, 0.35]), corSol: 0xfff0dc, intensidadeSol: 2.8, corCeu: 0xdde8f4, corChao: 0x6e5c46, intensidadeCeu: 1.1, intensidadeAmbiente: 0.45, luminarias: 0, exposicao: 0.82, turbidez: 4.5, rayleigh: 1.2 },
  entardecer: { sol: norm([0.8, 0.105, 0.45]), corSol: 0xffa25a, intensidadeSol: 2.2, corCeu: 0xf2c79a, corChao: 0x5a4636, intensidadeCeu: 0.55, intensidadeAmbiente: 0.35, luminarias: 0.7, exposicao: 1.0, turbidez: 8, rayleigh: 2.5 },
  noite: { sol: norm([0.8, -0.04, 0.45]), corSol: 0x8fa8d8, intensidadeSol: 0.45, corCeu: 0x6a80b0, corChao: 0x2a2a30, intensidadeCeu: 0.6, intensidadeAmbiente: 0.25, luminarias: 1, exposicao: 1.15, turbidez: 2, rayleigh: 3 },
};

export const NOME_LUZ: Record<Luz, string> = { dia: "Dia", entardecer: "Entardecer", noite: "Noite" };

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
