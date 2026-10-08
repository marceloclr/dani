// Mixagem do áudio do vídeo (ADR-34): a voz (falas e narrações, já normalizada) e as trilhas sonoras, cada
// uma do ponto em que entra até a próxima, com laço, cruzamentos, ducking sob a voz e o fim sem corte seco.
// Puro, sobre Float32Array: testado no Node.

/** Nível da trilha (dB) sob a voz e sem voz, antes do volume escolhido. */
export const TRILHA_SOB_VOZ_DB = -20, TRILHA_SEM_VOZ_DB = -10;
/** Fade-in da primeira trilha, cruzamento entre trilhas e no laço, fade-out final e silêncio no fim (s). */
export const FADE_IN_S = 1, CRUZAMENTO_S = 1.5, LACO_S = 1, FADE_OUT_S = 3, SILENCIO_FINAL_S = 0.3;
/** Envelope da voz: janela, limiar de presença (dBFS), ataque e soltura (s). */
export const JANELA_S = 0.05, LIMIAR_VOZ_DB = -45, ATAQUE_S = 0.15, SOLTURA_S = 0.6;
/** Pico máximo do resultado (dBFS). */
export const PICO_DB = -1;

const ganhoDb = (db: number) => 10 ** (db / 20);

export interface TrilhaNaMix {
  /** Canais da música (1 ou 2), na taxa da mixagem. */
  canais: Float32Array[];
  /** Segundo do vídeo em que ela entra. */
  iniS: number;
  /** 0 a 1. */
  volume: number;
}

/**
 * Presença da voz por amostra (0 a 1): RMS em janelas de `JANELA_S` acima de `LIMIAR_VOZ_DB`, suavizado com
 * ataque e soltura (a trilha abaixa antes da voz ficar alta e só volta depois de uma pausa).
 */
export function envelopeDaVoz(voz: Float32Array[] | null, n: number, taxa: number): Float32Array {
  const env = new Float32Array(n);
  if (!voz?.length) return env;
  const j = Math.max(1, Math.round(JANELA_S * taxa));
  const nj = Math.ceil(n / j);
  const alvo = new Float32Array(nj);
  for (let w = 0; w < nj; w++) {
    let s = 0, k = 0;
    for (const c of voz)
      for (let i = w * j; i < Math.min(c.length, (w + 1) * j); i++) {
        s += c[i] * c[i];
        k++;
      }
    alvo[w] = k && Math.sqrt(s / k) > ganhoDb(LIMIAR_VOZ_DB) ? 1 : 0;
  }
  // suavização por janela: sobe em ATAQUE_S e desce em SOLTURA_S; a subida começa ATAQUE_S antes da voz
  const passoSobe = JANELA_S / ATAQUE_S, passoDesce = JANELA_S / SOLTURA_S;
  const adiante = Math.ceil(ATAQUE_S / JANELA_S);
  const suave = new Float32Array(nj);
  let v = 0;
  for (let w = 0; w < nj; w++) {
    let quer = 0;
    for (let d = 0; d <= adiante && w + d < nj; d++) if (alvo[w + d]) quer = 1;
    v = quer > v ? Math.min(quer, v + passoSobe) : Math.max(quer, v - passoDesce);
    suave[w] = v;
  }
  for (let i = 0; i < n; i++) env[i] = suave[Math.min(nj - 1, Math.floor(i / j))];
  return env;
}

/**
 * Amostra `p` da música em laço: período = L − cruz; nos primeiros `cruz` de cada volta (depois da primeira),
 * o começo entra cruzando com o fim da volta anterior. Fórmula: m = p mod período; v = c[m]·(m/cruz) + c[m + período]·(1 − m/cruz).
 */
export function amostraEmLaco(c: Float32Array, p: number, cruz: number): number {
  const L = c.length;
  const periodo = Math.max(1, L - cruz);
  const m = p % periodo, volta = Math.floor(p / periodo);
  if (volta === 0 || m >= cruz || cruz <= 0) return c[m];
  const t = m / cruz;
  return c[m] * t + c[m + periodo] * (1 - t);
}

/**
 * Mistura a voz e as trilhas num buffer de `totalS` segundos (2 canais):
 * - cada trilha toca de `iniS` até a entrada da próxima, em laço se for curta; a primeira entra com fade-in, as
 *   outras cruzam em `CRUZAMENTO_S`;
 * - nível da trilha = volume × (−10 dB sem voz → −20 dB sob a voz), pelo envelope da voz;
 * - fim: a trilha some em `FADE_OUT_S` e os últimos `SILENCIO_FINAL_S` ficam em silêncio;
 * - limitador: o pico não passa de `PICO_DB`.
 */
export function mixar(voz: Float32Array[] | null, trilhas: TrilhaNaMix[], totalS: number, taxa = 48000): Float32Array[] {
  const n = Math.max(1, Math.round(totalS * taxa));
  const out = [new Float32Array(n), new Float32Array(n)];
  if (voz?.length) for (let c = 0; c < 2; c++) out[c].set(voz[Math.min(c, voz.length - 1)].subarray(0, n));
  const fimSom = Math.max(0, n - Math.round(SILENCIO_FINAL_S * taxa));
  const lista = [...trilhas].filter((t) => t.canais.length && t.canais[0].length).sort((a, b) => a.iniS - b.iniS);
  if (lista.length) {
    const env = envelopeDaVoz(voz, n, taxa);
    const sem = ganhoDb(TRILHA_SEM_VOZ_DB), sob = ganhoDb(TRILHA_SOB_VOZ_DB);
    const meia = Math.round((CRUZAMENTO_S / 2) * taxa), fadeIn = Math.round(FADE_IN_S * taxa), fadeOut = Math.round(FADE_OUT_S * taxa);
    const cruzLaco = Math.round(LACO_S * taxa);
    lista.forEach((t, k) => {
      const ini = Math.max(0, Math.round(t.iniS * taxa));
      const prox = k + 1 < lista.length ? Math.round(lista[k + 1].iniS * taxa) : fimSom;
      // a trilha cobre [a, b): com as meias-faixas de cruzamento nas emendas internas
      const a = k === 0 ? ini : Math.max(0, ini - meia);
      const b = k + 1 < lista.length ? Math.min(fimSom, prox + meia) : fimSom;
      const cruz = Math.min(cruzLaco, Math.floor(t.canais[0].length / 3));
      for (let i = a; i < b; i++) {
        let g = t.volume * (sem + (sob - sem) * env[i]);
        if (k === 0 && i - a < fadeIn) g *= (i - a) / fadeIn;
        if (k > 0 && i < ini + meia) g *= (i - a) / (2 * meia); // entra cruzando
        if (k + 1 < lista.length && i >= prox - meia) g *= (b - i) / (2 * meia); // sai cruzando
        if (k + 1 === lista.length && i >= fimSom - fadeOut) g *= Math.max(0, (fimSom - i) / fadeOut); // fade-out final
        if (!(g > 0)) continue;
        const p = i - a;
        for (let c = 0; c < 2; c++) out[c][i] += amostraEmLaco(t.canais[Math.min(c, t.canais.length - 1)], p, cruz) * g;
      }
    });
  }
  for (const c of out) c.fill(0, fimSom);
  let pico = 0;
  for (const c of out) for (let i = 0; i < n; i++) pico = Math.max(pico, Math.abs(c[i]));
  const limite = ganhoDb(PICO_DB);
  if (pico > limite) for (const c of out) for (let i = 0; i < n; i++) c[i] *= limite / pico;
  return out;
}
