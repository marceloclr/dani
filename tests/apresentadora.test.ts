// Composição da apresentadora (ADR-24): layout, chave de croma, derrame de verde e duração pela fala.
import { describe, expect, it } from "vitest";
import { APRESENTADORA_PADRAO, alfaCroma, cantoDaAssinatura, duracaoDoVideo, layoutApresentadora, semDerrame, type ConfigApresentadora } from "../src/rendering/composicao";

const fala = (duracaoS: number, acompanharFala = true): ConfigApresentadora => ({ ...APRESENTADORA_PADRAO, arquivo: "fala.mp4", duracaoS, largura: 1080, altura: 1920, acompanharFala });

describe("layout da apresentadora", () => {
  it("fica dentro do quadro, ancorada embaixo, na altura pedida", () => {
    for (const [L, A] of [[1920, 1080], [1080, 1920], [1080, 1080]])
      for (const pos of ["esquerda", "centro", "direita"] as const) {
        const r = layoutApresentadora(L, A, 1080, 1920, pos, 0.72);
        expect(r.y).toBe(0);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(L);
        expect(r.h).toBeLessThanOrEqual(A);
        expect(r.w / r.h).toBeCloseTo(1080 / 1920, 1);
      }
  });
  it("à direita encosta na margem direita; à esquerda, na esquerda", () => {
    const d = layoutApresentadora(1920, 1080, 1080, 1920, "direita", 0.72);
    const e = layoutApresentadora(1920, 1080, 1080, 1920, "esquerda", 0.72);
    expect(1920 - (d.x + d.w)).toBe(e.x);
    expect(d.h).toBe(Math.round(1080 * 0.72));
  });
  it("vídeo horizontal num quadro vertical é reduzido para caber na largura", () => {
    const r = layoutApresentadora(1080, 1920, 1920, 1080, "centro", 1);
    expect(r.x).toBeGreaterThan(0);
    expect(r.x + r.w).toBeLessThan(1080);
    expect(r.h).toBeLessThan(1920);
  });
  it("a assinatura vai para o lado oposto", () => {
    expect(cantoDaAssinatura("esquerda")).toBe("direita");
    expect(cantoDaAssinatura("direita")).toBe("esquerda");
    expect(cantoDaAssinatura(null)).toBe("esquerda");
  });
});

describe("chave de croma", () => {
  const verde: [number, number, number] = [0, 177, 64];
  it("o pano verde some, inclusive na sombra", () => {
    expect(alfaCroma([0, 177, 64], verde, 0.16, 0.1)).toBe(0);
    expect(alfaCroma([10, 120, 50], verde, 0.16, 0.1)).toBe(0); // verde mais escuro
  });
  it("pele, cabelo, roupa branca e preta ficam opacos", () => {
    for (const px of [[224, 172, 140], [90, 60, 40], [245, 245, 245], [20, 20, 22], [40, 60, 140]] as [number, number, number][])
      expect(alfaCroma(px, verde, 0.16, 0.1)).toBe(1);
  });
  it("tira o verde que vaza na pele", () => {
    const [r, g, b] = semDerrame([200, 230, 150]);
    expect(r).toBe(200);
    expect(b).toBe(150);
    expect(g).toBeLessThanOrEqual(183);
    expect(semDerrame([224, 172, 140])).toEqual([224, 172, 140]); // pele sem verde não muda
  });
});

describe("duração pela fala", () => {
  it("acompanha a fala, arredondada ao décimo, entre 6 s e 5 min", () => {
    expect(duracaoDoVideo(30, fala(42.31))).toBe(42.4);
    expect(duracaoDoVideo(30, fala(3))).toBe(6);
    expect(duracaoDoVideo(30, fala(900))).toBe(300);
  });
  it("sem acompanhar, vale a escolhida", () => {
    expect(duracaoDoVideo(30, fala(42, false))).toBe(30);
    expect(duracaoDoVideo(60, null)).toBe(60);
  });
});
