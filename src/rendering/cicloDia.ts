// Ciclo do dia no voo (ADR-26): de onde vêm o local e o norte, e que horas são em cada instante do voo.
// Puro, testado no Node.
import type { P3 } from "./navegacao";
import { FORTALEZA, fachadaAoSol, posicaoDoSol, type Efemerides, type Local } from "./sol";

export interface ConfigSol {
  /** Rumo da fachada frontal ajustado na bússola; null/ausente = o do IFC. */
  norteGraus?: number | null;
  /** Local digitado; null/ausente = o do IFC e depois o do município. */
  lat?: number | null;
  lon?: number | null;
}

export interface ContextoSol {
  local: Local;
  origemLocal: "ajustado" | "ifc" | "municipio" | "padrao";
  norte: number;
  origemNorte: "ajustado" | "ifc" | "padrao";
}

/**
 * Local e norte valendo agora: o ajustado na tela vence; depois o do IFC; o local cai no município da
 * obra e, por último, em Fortaleza. Sem norte, a frente da casa é tomada como voltada para o norte (0°).
 */
export function resolverContexto(cfg: ConfigSol | undefined, geo: { lat?: number; lon?: number; norteGraus?: number }, municipio: Local | null): ContextoSol {
  const ok = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
  const local: [Local, ContextoSol["origemLocal"]] =
    ok(cfg?.lat) && ok(cfg?.lon) ? [{ lat: cfg.lat, lon: cfg.lon }, "ajustado"] : ok(geo.lat) && ok(geo.lon) ? [{ lat: geo.lat, lon: geo.lon }, "ifc"] : municipio ? [municipio, "municipio"] : [FORTALEZA, "padrao"];
  const norte: [number, ContextoSol["origemNorte"]] = ok(cfg?.norteGraus) ? [cfg.norteGraus, "ajustado"] : ok(geo.norteGraus) ? [geo.norteGraus, "ifc"] : [0, "padrao"];
  return { local: local[0], origemLocal: local[1], norte: ((norte[0] % 360) + 360) % 360, origemNorte: norte[1] };
}

/** Instantes (0 a 1) do voo que marcam as fases (Voo.marcas). */
export interface MarcasVoo {
  fimConstrucao: number;
  inicioInterno: number;
  inicioVoltaFinal: number;
  fimMovimento: number;
}

/** Horários-chave do ciclo, em minutos locais. */
export function horariosDoCiclo(e: Efemerides): { amanhecer: number; meioDia: number; tarde: number; dourada: number; noite: number } {
  return { amanhecer: e.nascer - 25, meioDia: 12 * 60, tarde: 15 * 60 + 30, dourada: e.por - 35, noite: e.por + 50 };
}

/**
 * Hora em cada instante `u` do voo: amanhece no começo, meio-dia quando a obra fica pronta, 15h30 ao
 * entrar, hora dourada em `uDourada` (o drone diante da fachada que recebe o sol da tarde) e noite no
 * fim do movimento; parado na fachada frontal, segue a noite. Interpolação monótona por pontos-chave.
 */
export function horarioDoVoo(u: number, m: MarcasVoo, uDourada: number, e: Efemerides): number {
  const h = horariosDoCiclo(e);
  let pts: [number, number][] = [
    [0, h.amanhecer],
    [m.fimConstrucao, h.meioDia],
    [m.inicioInterno, h.tarde],
    [uDourada, h.dourada],
    [m.fimMovimento, h.noite],
  ];
  // se as marcas não estiverem em ordem, distribui por igual (o horário nunca volta atrás)
  if (pts.some((p, i) => i > 0 && !(p[0] > pts[i - 1][0]))) pts = pts.map((p, i) => [(i / (pts.length - 1)) * m.fimMovimento, p[1]]);
  if (u >= pts[pts.length - 1][0]) return h.noite;
  for (let i = 1; i < pts.length; i++) {
    if (u <= pts[i][0]) {
      const t = (u - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]);
      return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t;
    }
  }
  return h.noite;
}

/**
 * Instante da última volta externa em que a câmera está diante da fachada que recebe o sol da hora
 * dourada: procura, entre `inicioVoltaFinal` e `fimMovimento`, o azimute da câmera (em volta de `centro`)
 * mais próximo do azimute dessa fachada. Na ida do drone ao redor da casa, a hora dourada cai ali.
 */
export function instanteDaHoraDourada(quadro: (u: number) => { pos: P3 }, centro: P3, m: MarcasVoo, local: Local, diaCivil: number, e: Efemerides, norte: number): { u: number; fachada: string } {
  const sol = posicaoDoSol(local, diaCivil, horariosDoCiclo(e).dourada);
  const { fachada, azCena } = fachadaAoSol(sol.azimute, norte);
  let melhor = (m.inicioVoltaFinal + m.fimMovimento) / 2, dist = Infinity;
  const N = 400;
  // só a primeira metade da volta final: depois da dourada ainda falta escurecer até a noite
  for (let k = 0; k <= N; k++) {
    const u = m.inicioVoltaFinal + ((m.fimMovimento - m.inicioVoltaFinal) * 0.75 * k) / N;
    const p = quadro(u).pos;
    const az = Math.atan2(p[0] - centro[0], p[2] - centro[2]);
    const d = Math.abs(Math.atan2(Math.sin(az - azCena), Math.cos(az - azCena)));
    if (d < dist) {
      dist = d;
      melhor = u;
    }
  }
  return { u: melhor, fachada };
}
