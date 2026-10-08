// Mixagem do áudio (ADR-34): ducking, cruzamento, laço, fim sem corte seco e limitador.
import { describe, expect, it } from "vitest";
import { FADE_OUT_S, PICO_DB, SILENCIO_FINAL_S, TRILHA_SEM_VOZ_DB, TRILHA_SOB_VOZ_DB, amostraEmLaco, envelopeDaVoz, mixar } from "../src/rendering/mixagem";

const T = 8000; // taxa baixa: testes rápidos
const constante = (s: number, v = 0.5) => new Float32Array(Math.round(s * T)).fill(v);
const nivel = (c: Float32Array, a: number, b: number) => {
  let m = 0;
  for (let i = Math.round(a * T); i < Math.round(b * T); i++) m = Math.max(m, Math.abs(c[i]));
  return m;
};
const db = (x: number) => 20 * Math.log10(x);

describe("mixagem", () => {
  it("ducking: a trilha fica em −10 dB sem voz e −20 dB sob a voz (volume 1)", () => {
    // voz de 4 a 8 s; trilha de nível 1 o tempo todo
    const voz = new Float32Array(12 * T);
    for (let i = 4 * T; i < 8 * T; i++) voz[i] = i % 2 ? 0.3 : -0.3;
    const [l] = mixar([voz], [{ canais: [constante(20, 1)], iniS: 0, volume: 1 }], 12, T);
    expect(db(nivel(l, 2, 3))).toBeCloseTo(TRILHA_SEM_VOZ_DB, 0);
    // sob a voz: a amostra = voz ± trilha; tira a voz para medir a trilha
    let m = 0;
    for (let i = 5 * T; i < 7 * T; i++) m = Math.max(m, Math.abs(l[i] - voz[i]));
    expect(db(m)).toBeCloseTo(TRILHA_SOB_VOZ_DB, 0);
  });

  it("o envelope sobe antes da voz e só desce depois da soltura", () => {
    const voz = new Float32Array(6 * T);
    for (let i = 2 * T; i < 3 * T; i++) voz[i] = 0.3;
    const e = envelopeDaVoz([voz], voz.length, T);
    expect(e[Math.round(1.95 * T)]).toBeGreaterThan(0); // antecipa
    expect(e[Math.round(2.5 * T)]).toBe(1);
    expect(e[Math.round(3.3 * T)]).toBeGreaterThan(0); // soltura
    expect(e[Math.round(4.5 * T)]).toBe(0);
  });

  it("fim sem corte seco: fade-out da trilha nos últimos 3 s e silêncio no último 0,3 s", () => {
    const [l] = mixar(null, [{ canais: [constante(30, 1)], iniS: 0, volume: 1 }], 10, T);
    const fimSom = 10 - SILENCIO_FINAL_S;
    expect(nivel(l, fimSom - FADE_OUT_S - 0.5, fimSom - FADE_OUT_S)).toBeGreaterThan(0.3);
    expect(nivel(l, fimSom - 0.2, fimSom)).toBeLessThan(0.05);
    expect(nivel(l, fimSom, 10)).toBe(0);
  });

  it("duas trilhas: a segunda entra cruzando com a primeira, sem buraco", () => {
    const [l] = mixar(null, [{ canais: [constante(30, 1)], iniS: 0, volume: 1 }, { canais: [constante(30, 1)], iniS: 5, volume: 1 }], 12, T);
    // no meio do cruzamento as duas somam o nível de uma
    for (const t of [4.5, 5, 5.5]) expect(db(Math.abs(l[Math.round(t * T)]))).toBeCloseTo(TRILHA_SEM_VOZ_DB, 0);
  });

  it("laço: a música curta repete, e a emenda cruza (sem salto)", () => {
    const c = new Float32Array(4 * T).map((_, i) => i / (4 * T)); // rampa 0 → 1
    const cruz = T; // 1 s
    const periodo = 3 * T;
    expect(amostraEmLaco(c, 10, cruz)).toBe(c[10]);
    // logo depois da emenda, o valor ainda é quase o fim da volta anterior
    expect(amostraEmLaco(c, periodo + 1, cruz)).toBeCloseTo(c[periodo + 1], 2);
    // no fim do cruzamento, já é o começo da volta nova
    expect(amostraEmLaco(c, periodo + cruz - 1, cruz)).toBeCloseTo(c[cruz - 1], 2);
  });

  it("limitador: o pico não passa de −1 dBFS", () => {
    const voz = constante(4, 1);
    const [l] = mixar([voz], [{ canais: [constante(4, 1)], iniS: 0, volume: 1 }], 4, T);
    expect(db(nivel(l, 0, 4))).toBeLessThanOrEqual(PICO_DB + 1e-6);
  });

  it("sem trilha e sem voz: silêncio do tamanho do vídeo", () => {
    const out = mixar(null, [], 3, T);
    expect(out[0].length).toBe(3 * T);
    expect(nivel(out[0], 0, 3)).toBe(0);
  });
});
