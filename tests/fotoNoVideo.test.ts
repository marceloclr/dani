// Foto emoldurada no vídeo (ADR-34): proporções da moldura e animação de entrada e saída.
import { describe, expect, it } from "vitest";
import { ENTRADA_S, SAIDA_S, animacaoDaMoldura, layoutDaMoldura } from "../src/rendering/fotoNoVideo";

const dentro = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;

describe("moldura da foto", () => {
  it("vertical: papel com 84 % da largura, centrado; janela 4:3 dentro do papel; legenda abaixo da foto", () => {
    const l = layoutDaMoldura(1080, 1920, 4000, 3000);
    expect(l.papel.w).toBe(Math.round(1080 * 0.84));
    expect(l.papel.x * 2 + l.papel.w).toBeCloseTo(1080, -1);
    expect(l.janela.w / l.janela.h).toBeCloseTo(4 / 3, 1);
    expect(dentro(l.janela, l.papel)).toBe(true);
    expect(dentro(l.legenda, l.papel)).toBe(true);
    expect(l.legenda.y).toBe(l.janela.y + l.janela.h);
  });
  it("horizontal: papel com 70 % da altura; foto em retrato ganha janela 3:4 e cabe na tela", () => {
    const h = layoutDaMoldura(1920, 1080, 4000, 3000);
    expect(h.papel.h).toBe(Math.round(1080 * 0.7));
    const r = layoutDaMoldura(1920, 1080, 3000, 4000);
    expect(r.janela.w / r.janela.h).toBeCloseTo(3 / 4, 1);
    expect(dentro(r.papel, { x: 0, y: 0, w: 1920, h: 1080 })).toBe(true);
  });
  it("entra subindo e aparecendo, fica parada e sai esmaecendo", () => {
    expect(animacaoDaMoldura(0, 3)).toEqual({ opacidade: 0, subida: expect.any(Number) });
    expect(animacaoDaMoldura(0, 3).subida).toBeGreaterThan(0);
    expect(animacaoDaMoldura(ENTRADA_S, 3)).toEqual({ opacidade: 1, subida: 0 });
    expect(animacaoDaMoldura(1.5, 3).opacidade).toBe(1);
    expect(animacaoDaMoldura(3 - SAIDA_S / 2, 3).opacidade).toBeCloseTo(0.5);
    expect(animacaoDaMoldura(3, 3).opacidade).toBe(0);
  });
});
