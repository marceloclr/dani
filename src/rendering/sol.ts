// Posição do sol (ADR-26): fórmulas do NOAA (Solar Calculator, baseadas em Meeus), precisão de cerca de
// 0,5°. Puro, testado no Node. Datas como dia civil (ADR-05) e hora local em minutos (Brasília, UTC−3).
import type { P3 } from "./navegacao";

const rad = (g: number) => (g * Math.PI) / 180;
const grau = (r: number) => (r * 180) / Math.PI;
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Fuso de Brasília (o Ceará não tem horário de verão). */
export const FUSO_PADRAO = -3;

export interface Local {
  lat: number;
  lon: number;
}

/** Sede de Fortaleza (IBGE): local padrão quando nem o IFC nem o município dizem. */
export const FORTALEZA: Local = { lat: -3.71664, lon: -38.5423 };

interface Orbita {
  declinacao: number; // graus
  equacaoDoTempo: number; // minutos
}

/** Declinação e equação do tempo num instante (dia juliano). */
function orbita(jd: number): Orbita {
  const T = (jd - 2451545) / 36525;
  const L0 = mod(280.46646 + T * (36000.76983 + T * 0.0003032), 360);
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T) + Math.sin(rad(3 * M)) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const declinacao = grau(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda))));
  const y = Math.tan(rad(eps / 2)) ** 2;
  const l = rad(L0), m = rad(M);
  const eqt = y * Math.sin(2 * l) - 2 * e * Math.sin(m) + 4 * e * y * Math.sin(m) * Math.cos(2 * l) - 0.5 * y * y * Math.sin(4 * l) - 1.25 * e * e * Math.sin(2 * m);
  return { declinacao, equacaoDoTempo: 4 * grau(eqt) };
}

/** Dia juliano à 0h UTC de um dia civil (dias desde 1970-01-01). */
const juliano = (diaCivil: number) => diaCivil + 2440587.5;

export interface PosicaoSol {
  /** Graus a partir do norte, no sentido horário (90 = leste, 270 = oeste). */
  azimute: number;
  /** Graus acima do horizonte, com refração (negativa à noite). */
  elevacao: number;
}

/** Sol no dia civil `diaCivil`, às `minutos` da hora local (0 a 1440), no local dado. */
export function posicaoDoSol(local: Local, diaCivil: number, minutos: number, fuso = FUSO_PADRAO): PosicaoSol {
  const utc = minutos - fuso * 60;
  const { declinacao, equacaoDoTempo } = orbita(juliano(diaCivil) + utc / 1440);
  const tempoSolar = mod(utc + equacaoDoTempo + 4 * local.lon, 1440);
  const angHorario = tempoSolar / 4 - 180;
  const lat = rad(local.lat), dec = rad(declinacao), ha = rad(angHorario);
  const cosZen = Math.min(1, Math.max(-1, Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha)));
  const zen = Math.acos(cosZen);
  // azimute pelo norte (atan2 evita a ambiguidade do acos)
  const az = mod(grau(Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat))) + 180, 360);
  const e = 90 - grau(zen);
  return { azimute: az, elevacao: e + refracao(e) };
}

/** Refração atmosférica aproximada (graus), como no NOAA. */
function refracao(e: number): number {
  if (e > 85) return 0;
  const t = Math.tan(rad(e));
  const seg = e > 5 ? 58.1 / t - 0.07 / t ** 3 + 0.000086 / t ** 5 : e > -0.575 ? 1735 + e * (-518.2 + e * (103.4 + e * (-12.79 + e * 0.711))) : -20.772 / t;
  return seg / 3600;
}

export interface Efemerides {
  /** Minutos locais do nascer, do meio-dia solar e do pôr do sol. */
  nascer: number;
  meioDia: number;
  por: number;
}

/** Nascer, meio-dia solar e pôr do sol (elevação −0,833°: borda do disco com a refração). */
export function nascerEPor(local: Local, diaCivil: number, fuso = FUSO_PADRAO): Efemerides {
  let meioDiaUtc = 720 - 4 * local.lon;
  for (let k = 0; k < 2; k++) meioDiaUtc = 720 - 4 * local.lon - orbita(juliano(diaCivil) + meioDiaUtc / 1440).equacaoDoTempo;
  const { declinacao } = orbita(juliano(diaCivil) + meioDiaUtc / 1440);
  const lat = rad(local.lat), dec = rad(declinacao);
  const cosH = (Math.cos(rad(90.833)) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec));
  const H = grau(Math.acos(Math.min(1, Math.max(-1, cosH))));
  const meioDia = meioDiaUtc + fuso * 60;
  return { nascer: meioDia - 4 * H, meioDia, por: meioDia + 4 * H };
}

/**
 * Direção do sol na cena (Y para cima). `norte` é o rumo da bússola para onde a fachada frontal (+z) olha:
 * um sol no rumo A fica girado de (A − norte) a partir de +z, no sentido horário visto de cima.
 * Com a frente para o norte e o sol a leste, o sol fica em −x (à esquerda de quem olha a fachada).
 */
export function direcaoNaCena(p: PosicaoSol, norte: number): P3 {
  const a = rad(p.azimute - norte), e = rad(p.elevacao);
  return [-Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)];
}

export type Fachada = "frontal" | "lateral direita" | "fundos" | "lateral esquerda";

/**
 * Fachada que recebe o sol de rumo `azimute`, e o azimute da câmera na cena (atan2(x, z), como o voo)
 * que fica de frente para ela, do lado do sol.
 */
export function fachadaAoSol(azimute: number, norte: number): { fachada: Fachada; azCena: number } {
  const d = direcaoNaCena({ azimute, elevacao: 0 }, norte);
  const azCena = Math.atan2(d[0], d[2]);
  const rel = mod(grau(azCena) + 45, 360);
  const fachada: Fachada = rel < 90 ? "frontal" : rel < 180 ? "lateral direita" : rel < 270 ? "fundos" : "lateral esquerda";
  return { fachada, azCena };
}

const RUMOS = ["norte", "nor-nordeste", "nordeste", "lés-nordeste", "leste", "lés-sudeste", "sudeste", "su-sudeste", "sul", "su-sudoeste", "sudoeste", "oés-sudoeste", "oeste", "oés-noroeste", "noroeste", "nor-noroeste"];
/** Nome do rumo (16 pontos da rosa dos ventos). */
export const rumo = (azimute: number) => RUMOS[Math.round(mod(azimute, 360) / 22.5) % 16];

/** "hh:mm" de minutos locais. */
export const hora = (minutos: number) => {
  const m = Math.round(mod(minutos, 1440));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Rumo para onde cada fachada olha. A frente (+z) olha para `norte`; com ela para o norte, o leste fica em −x. */
export function rumoDaFachada(f: Fachada, norte: number): number {
  const soma: Record<Fachada, number> = { frontal: 0, "lateral esquerda": 90, fundos: 180, "lateral direita": 270 };
  return mod(norte + soma[f], 360);
}

/**
 * Sol do vídeo na luz Dia (ADR-36): desvio em relação à frente (graus) e altura máxima. De lado, a fachada fica
 * ao sol e as sombras atravessam o gramado e a lateral; mais de frente, elas caíam atrás dos objetos e sumiam.
 * A partir de 25° de altura, a luz é a de dia cheio (iluminacao.ts), então 28° alonga a sombra sem mudar o tom.
 */
export const DESVIO_NA_FACHADA = 65, ALTURA_MAXIMA_NO_VIDEO = 28;

/**
 * Sol do vídeo na luz Dia (ADR-33 e ADR-36, escolha do usuário): a fachada frontal sempre ao sol, de lado, a
 * `DESVIO_NA_FACHADA`° da frente, do lado em que o sol real está (manhã ou tarde), e no máximo a
 * `ALTURA_MAXIMA_NO_VIDEO`° de altura. A Insolação e a viewport continuam com o sol real.
 */
export function solNaFachada(p: PosicaoSol, norte: number): PosicaoSol {
  const frente = rumoDaFachada("frontal", norte);
  const d = mod(p.azimute - frente + 180, 360) - 180; // −180 a 180
  return { ...p, azimute: mod(frente + (d < 0 ? -1 : 1) * DESVIO_NA_FACHADA, 360), elevacao: Math.min(p.elevacao, ALTURA_MAXIMA_NO_VIDEO) };
}

export const FACHADAS: Fachada[] = ["frontal", "lateral direita", "fundos", "lateral esquerda"];

/** Radiação direta normal (W/m²) com o sol a `elevacao` graus: modelo de Meinel (como no modulus). */
export function dni(elevacao: number): number {
  if (elevacao <= 2) return 0;
  const massaDeAr = 1 / Math.sin(rad(elevacao));
  return 1353 * Math.pow(0.7, Math.pow(massaDeAr, 0.678));
}

/** Cosseno da incidência do sol numa parede vertical que olha para `rumoParede` (0 se o sol está atrás). */
export function cosIncidencia(p: PosicaoSol, rumoParede: number): number {
  if (p.elevacao <= 0) return 0;
  return Math.max(0, Math.cos(rad(p.elevacao)) * Math.cos(rad(p.azimute - rumoParede)));
}

/**
 * Sol direto numa fachada no dia (kWh/m²): Σ DNI × cos da incidência, das 6h às 18h, de 15 em 15 min
 * (a mesma conta do "Sol direto nas fachadas" do modulus, aqui para o dia da simulação).
 */
export function radiacaoNaFachada(local: Local, diaCivil: number, rumoParede: number, fuso = FUSO_PADRAO): number {
  let wh = 0;
  for (let m = 6 * 60; m <= 18 * 60; m += 15) {
    const p = posicaoDoSol(local, diaCivil, m, fuso);
    wh += dni(p.elevacao) * cosIncidencia(p, rumoParede) * 0.25;
  }
  return wh / 1000;
}

/** Elevação do sol da luz Dia (ADR-31): baixa o bastante para sombras longas e volume, alta para luz de dia. */
export const ELEVACAO_DIA = 35;

/**
 * Horário da luz Dia (ADR-31): o instante, de manhã ou à tarde, em que o sol passa por `ELEVACAO_DIA` e bate
 * mais de frente na fachada frontal (a que as câmeras mostram). Fórmula: entre os dois instantes, o de maior
 * cos(elevação) × cos(azimute do sol − rumo da frente). Se o sol nunca chega a essa altura, o meio-dia solar.
 */
export function minutosDaLuzDia(local: Local, diaCivil: number, norte: number, fuso = FUSO_PADRAO): number {
  const e = nascerEPor(local, diaCivil, fuso);
  const cruzamento = (de: number, ate: number): number | null => {
    // a elevação sobe de manhã e desce à tarde: busca binária no meio período
    let a = de, b = ate;
    const sobe = posicaoDoSol(local, diaCivil, b, fuso).elevacao > posicaoDoSol(local, diaCivil, a, fuso).elevacao;
    const fa = posicaoDoSol(local, diaCivil, a, fuso).elevacao - ELEVACAO_DIA, fb = posicaoDoSol(local, diaCivil, b, fuso).elevacao - ELEVACAO_DIA;
    if (fa * fb > 0) return null;
    for (let k = 0; k < 30; k++) {
      const m = (a + b) / 2;
      const acima = posicaoDoSol(local, diaCivil, m, fuso).elevacao > ELEVACAO_DIA;
      if (acima === sobe) b = m;
      else a = m;
    }
    return Math.round((a + b) / 2);
  };
  const manha = cruzamento(e.nascer, e.meioDia), tarde = cruzamento(e.meioDia, e.por);
  const frente = rumoDaFachada("frontal", norte);
  const luz = (m: number | null) => (m === null ? -1 : cosIncidencia(posicaoDoSol(local, diaCivil, m, fuso), frente));
  if (manha === null && tarde === null) return Math.round(e.meioDia);
  return luz(tarde) > luz(manha) ? tarde! : manha!;
}
