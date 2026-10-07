// Marca no vídeo (ADR-24): tempo da vinheta e monograma.
import { describe, expect, it } from "vitest";
import { VINHETA_S, opacidadeVinheta } from "../src/rendering/marcaVideo";
import { MONOGRAMA_DP } from "../src/app/marca";

describe("vinheta de abertura e encerramento", () => {
  it("cheia no começo, some até 2 s, volta nos 2 s finais", () => {
    expect(opacidadeVinheta(0, 30)).toBe(1);
    expect(opacidadeVinheta(VINHETA_S.cheia, 30)).toBe(1);
    expect(opacidadeVinheta(1.6, 30)).toBeGreaterThan(0);
    expect(opacidadeVinheta(1.6, 30)).toBeLessThan(1);
    expect(opacidadeVinheta(VINHETA_S.total, 30)).toBe(0);
    expect(opacidadeVinheta(15, 30)).toBe(0);
    expect(opacidadeVinheta(28, 30)).toBe(0);
    expect(opacidadeVinheta(28.4, 30)).toBeGreaterThan(0);
    expect(opacidadeVinheta(30 - VINHETA_S.total + (VINHETA_S.total - VINHETA_S.cheia), 30)).toBe(1);
    expect(opacidadeVinheta(30, 30)).toBe(1);
  });
  it("é monótona na abertura e no encerramento", () => {
    let antes = 1;
    for (let t = 0; t <= 2; t += 0.05) {
      const o = opacidadeVinheta(t, 30);
      expect(o).toBeLessThanOrEqual(antes + 1e-12);
      antes = o;
    }
  });
  it("vídeo curto fica sem vinheta", () => {
    expect(opacidadeVinheta(0, 5)).toBe(0);
  });
});

describe("monograma provisório", () => {
  it("cabe na caixa 100 × 100", () => {
    const nums = MONOGRAMA_DP.match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (const n of nums) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(100);
    }
  });
});
