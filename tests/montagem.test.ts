// Montagem em cenas (ADR-25): roteiro Reels, tempo das cenas, normalização e cortina da revelação.
import { describe, expect, it } from "vitest";
import { MINIMO_CENA_S, cenaNoTempo, cortinaRevelacao, duracoes, normalizar, obraNaCena, roteiroReels, type Cena } from "../src/rendering/montagem";

const soma = (l: Cena[]) => l.reduce((s, c) => s + c.peso, 0);

describe("roteiro Reels", () => {
  it("soma 1, com e sem fala, e termina na marca", () => {
    for (const fala of [true, false]) {
      const r = roteiroReels(fala);
      expect(soma(r)).toBeCloseTo(1, 10);
      expect(r[r.length - 1].tipo).toBe("marca");
    }
  });
  it("com fala: abertura no terreno, revelação da obra de 0 a 1 e passeio pela obra pronta", () => {
    const r = roteiroReels(true);
    expect(r.map((c) => c.tipo)).toEqual(["fala", "revelacao", "obra", "obra", "marca"]);
    expect(r[1].obra).toEqual([0, 1]);
    expect(r[2].camera).toBe("drone");
    expect(r[2].obra).toEqual([1, 1]);
  });
  it("sem fala não tem fala, revelação nem pessoa", () => {
    const r = roteiroReels(false);
    expect(r.some((c) => c.tipo === "fala" || c.tipo === "revelacao")).toBe(false);
    expect(r.every((c) => c.pessoa === "oculta")).toBe(true);
  });
});

describe("tempo das cenas", () => {
  const r = roteiroReels(true);
  it("acerta os limites e o último instante cai na última cena", () => {
    expect(cenaNoTempo(r, 0, 40).indice).toBe(0);
    expect(cenaNoTempo(r, 0.15 * 40 - 1e-6, 40).indice).toBe(0);
    expect(cenaNoTempo(r, 0.15 * 40, 40).indice).toBe(1);
    const fim = cenaNoTempo(r, 40, 40);
    expect(fim.indice).toBe(r.length - 1);
    expect(fim.u).toBe(1);
    expect(fim.fim).toBe(40);
  });
  it("u vai de 0 a 1 dentro da cena", () => {
    const p = cenaNoTempo(r, 0.15 * 40 + 0.125 * 40, 40); // meio da revelação
    expect(p.cena.tipo).toBe("revelacao");
    expect(p.u).toBeCloseTo(0.5, 6);
  });
  it("as durações somam o total", () => {
    expect(duracoes(r, 37).reduce((s, d) => s + d, 0)).toBeCloseTo(37, 9);
  });
});

describe("normalizar", () => {
  it("garante 0,8 s por cena e soma 1", () => {
    const l = normalizar([...roteiroReels(true).slice(0, 4), { ...roteiroReels(true)[4], peso: 0.0001 }], 10, true);
    expect(soma(l)).toBeCloseTo(1, 9);
    for (const d of duracoes(l, 10)) expect(d).toBeGreaterThanOrEqual(MINIMO_CENA_S - 1e-9);
  });
  it("mantém uma única marca, a última", () => {
    const r = roteiroReels(true);
    const l = normalizar([r[4], ...r.slice(0, 4), { ...r[4], id: "outra" }], 30, true);
    expect(l.filter((c) => c.tipo === "marca")).toHaveLength(1);
    expect(l[l.length - 1].tipo).toBe("marca");
  });
  it("sem fala, tira fala e revelação e esconde a pessoa", () => {
    const l = normalizar(roteiroReels(true), 30, false);
    expect(l.some((c) => c.tipo === "fala" || c.tipo === "revelacao")).toBe(false);
    expect(l.every((c) => c.pessoa === "oculta")).toBe(true);
    expect(soma(l)).toBeCloseTo(1, 9);
  });
  it("lista vazia vira o roteiro Reels", () => {
    expect(normalizar([], 30, true).map((c) => c.tipo)).toEqual(roteiroReels(true).map((c) => c.tipo));
  });
});

describe("revelação", () => {
  it("a cortina começa cheia e termina vazia", () => {
    for (const y of [0, 0.3, 0.7, 1]) {
      expect(cortinaRevelacao(0, y)).toBe(1);
      expect(cortinaRevelacao(1, y)).toBe(0);
    }
  });
  it("o fundo some de baixo para cima (a obra sobe)", () => {
    expect(cortinaRevelacao(0.5, 0.1)).toBeLessThan(cortinaRevelacao(0.5, 0.9));
    expect(cortinaRevelacao(0.5, 0.1)).toBe(0);
    expect(cortinaRevelacao(0.5, 0.9)).toBe(1);
  });
  it("é monótona no tempo", () => {
    for (const y of [0.2, 0.5, 0.8]) {
      let antes = 1;
      for (let u = 0; u <= 1; u += 0.02) {
        const v = cortinaRevelacao(u, y);
        expect(v).toBeLessThanOrEqual(antes + 1e-12);
        antes = v;
      }
    }
  });
  it("a obra avança de 0 a 1 com início e fim suaves", () => {
    const c = roteiroReels(true)[1];
    expect(obraNaCena(c, 0)).toBe(0);
    expect(obraNaCena(c, 1)).toBe(1);
    expect(obraNaCena(c, 0.5)).toBeCloseTo(0.5);
    expect(obraNaCena(c, 0.1)).toBeLessThan(0.1);
  });
});

describe("câmera das cenas", () => {
  const e = { centro: [0, 2, 0] as [number, number, number], raio: 8 };
  it("as vistas se aproximam devagar e a órbita anda 15 % da volta", async () => {
    const { poseDaCena } = await import("../src/rendering/montagem");
    const a = poseDaCena("frontal", e, 0), b = poseDaCena("frontal", e, 1);
    expect(b.dist).toBeCloseTo(a.dist * 0.92);
    const o0 = poseDaCena("orbita", e, 0), o1 = poseDaCena("orbita", e, 1);
    expect(o1.az - o0.az).toBeCloseTo(2 * Math.PI * 0.15);
  });
  it("o drone usa o trecho da obra pronta quando a cena começa com a obra pronta", async () => {
    const { trechoDoVoo } = await import("../src/rendering/montagem");
    const r = roteiroReels(true);
    expect(trechoDoVoo(r[2], 0, 0.5)).toBe(0.5);
    expect(trechoDoVoo(r[2], 1, 0.5)).toBe(1);
    expect(trechoDoVoo({ ...r[2], obra: [0, 1] }, 1, 0.5)).toBe(0.5);
  });
});
