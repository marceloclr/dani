import { describe, expect, it } from "vitest";
import { parametros } from "../src/fourd/animacao";
import { dimensoesDaSaida } from "../src/rendering/VideoRenderer";
import type { EstadoElemento } from "../src/types";

const emExec = (s: number): EstadoElemento => ({ visivel: true, fase: "em-execucao", aparencia: "base", progresso: s, surgimento: s });

describe("modo Progressivo (ADR-17)", () => {
  it("paredes sobem, lajes avançam, portas aparecem aos poucos", () => {
    expect(parametros(emExec(0.4), "progressivo", "IfcWall")).toEqual({ opacidade: 1, escalaY: 0.4, formado: false });
    expect(parametros(emExec(0.4), "progressivo", "IfcSlab")).toEqual({ opacidade: 1, escalaY: 1, escalaH: 0.4, formado: false });
    expect(parametros(emExec(0.4), "progressivo", "IfcDoor")).toEqual({ opacidade: 0.4, escalaY: 1, formado: false });
  });
  it("na fila, cada elemento se forma na sua vez e ganha a cor final ao terminar", () => {
    const n = 4;
    expect(parametros(emExec(0.6), "progressivo", "IfcWall", { pos: 0, n })).toMatchObject({ escalaY: 1, formado: true }); // já formado
    expect(parametros(emExec(0.6), "progressivo", "IfcWall", { pos: 2, n }).escalaY).toBeCloseTo(0.4); // subindo
    expect(parametros(emExec(0.6), "progressivo", "IfcWall", { pos: 3, n })).toEqual({ opacidade: 0, escalaY: 1 }); // ainda não começou
  });
  it("tarefa de um elemento se forma ao longo da tarefa inteira", () => {
    expect(parametros(emExec(0.25), "progressivo", "IfcSlab", { pos: 0, n: 1 }).escalaH).toBeCloseTo(0.25);
  });
  it("concluído fica inteiro", () => {
    const c: EstadoElemento = { visivel: true, fase: "concluido", aparencia: "base", progresso: 1, surgimento: 1 };
    expect(parametros(c, "progressivo", "IfcWall", { pos: 3, n: 4 })).toEqual({ opacidade: 1, escalaY: 1 });
  });
});

describe("dimensões por saída (ADR-16)", () => {
  it("WhatsApp: no máximo 1280 px no lado maior", () => {
    expect(dimensoesDaSaida("mp4-whatsapp", 1080, 1920, 30)).toEqual({ largura: 720, altura: 1280, fps: 30 });
    expect(dimensoesDaSaida("mp4-whatsapp", 1920, 1080, 24)).toEqual({ largura: 1280, altura: 720, fps: 24 });
    expect(dimensoesDaSaida("mp4-whatsapp", 1080, 1080, 30)).toEqual({ largura: 720, altura: 720, fps: 30 });
  });
  it("GIF: 480 px e 10 fps; as demais mantêm a resolução", () => {
    expect(dimensoesDaSaida("gif", 1920, 1080, 30)).toEqual({ largura: 480, altura: 270, fps: 10 });
    expect(dimensoesDaSaida("mp4-alta", 1920, 1080, 30)).toEqual({ largura: 1920, altura: 1080, fps: 30 });
  });
});
