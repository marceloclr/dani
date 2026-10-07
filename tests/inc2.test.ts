import { describe, expect, it } from "vitest";
import { estadoDe } from "../src/fourd/simulacao";
import { filaPorFases, parametros } from "../src/fourd/animacao";
import { deltaAngular, diaDoQuadro, poseDaPosicao, poseDoPreset, poseNoTempo, posicaoDaPose, roteiroPadrao, totalDeQuadros } from "../src/rendering/cameras";
import type { EstadoElemento, Tarefa, Vinculo } from "../src/types";

const tarefas = new Map<string, Tarefa>([["A", { id: "A", nome: "Alvenaria", categoria: "alvenaria", ini: 10, fim: 19 }]]);
const parede: Vinculo[] = [{ taskId: "A", acao: "construct", origem: "regra" }];
const emExec = (s: number): EstadoElemento => ({ visivel: true, fase: "em-execucao", aparencia: "base", progresso: s, surgimento: s });

describe("surgimento com dia fracionário", () => {
  it("cresce de forma contínua ao longo da tarefa", () => {
    expect(estadoDe(parede, 10, tarefas, "fantasma").surgimento).toBeCloseTo(0.1);
    expect(estadoDe(parede, 14.5, tarefas, "fantasma").surgimento).toBeCloseTo(0.55);
    expect(estadoDe(parede, 19.99, tarefas, "fantasma").surgimento).toBe(1);
    expect(estadoDe(parede, 14.5, tarefas, "fantasma").fase).toBe("em-execucao");
    expect(estadoDe(parede, 9.99, tarefas, "fantasma").fase).toBe("oculto");
  });
});

describe("modos de animação", () => {
  it("aparecimento ignora o avanço", () => expect(parametros(emExec(0.2), "aparecimento", "IfcWall")).toEqual({ opacidade: 1, escalaY: 1 }));
  it("fade usa o avanço como opacidade", () => expect(parametros(emExec(0.2), "fade", "IfcWall").opacidade).toBeCloseTo(0.2));
  it("crescimento sobe paredes e faz fade no resto", () => {
    expect(parametros(emExec(0.3), "crescimento", "IfcWall")).toEqual({ opacidade: 1, escalaY: 0.3 });
    expect(parametros(emExec(0.3), "crescimento", "IfcSlab")).toEqual({ opacidade: 0.3, escalaY: 1 });
  });
  it("por fases: cada elemento surge na sua fatia", () => {
    expect(parametros(emExec(0.3), "fases", "IfcWall", { pos: 0, n: 4 }).opacidade).toBe(1);
    expect(parametros(emExec(0.3), "fases", "IfcWall", { pos: 1, n: 4 }).opacidade).toBeCloseTo(0.2);
    expect(parametros(emExec(0.3), "fases", "IfcWall", { pos: 2, n: 4 }).opacidade).toBe(0);
  });
  it("concluído fica inteiro em qualquer modo", () => {
    const c: EstadoElemento = { visivel: true, fase: "concluido", aparencia: "base", progresso: 1, surgimento: 1 };
    for (const m of ["fade", "crescimento", "fases"] as const) expect(parametros(c, m, "IfcWall", { pos: 3, n: 4 })).toEqual({ opacidade: 1, escalaY: 1 });
  });
  it("fila por fases: de baixo para cima, depois da frente para o fundo", () => {
    const v = new Map<string, Vinculo[]>(["a", "b", "c"].map((g) => [g, parede]));
    const fila = filaPorFases(
      [
        { guid: "a", baseY: 3, frente: 5, lado: 0 },
        { guid: "b", baseY: 0, frente: -5, lado: 0 },
        { guid: "c", baseY: 0, frente: 5, lado: 0 },
      ],
      v,
      [...tarefas.values()],
    );
    expect(["c", "b", "a"].map((g) => fila.get(g)!.pos)).toEqual([0, 1, 2]);
    expect(fila.get("a")!.n).toBe(3);
  });
});

describe("câmeras", () => {
  const e = { centro: [5, 2, -9] as [number, number, number], raio: 12 };
  it("frontal fica na frente (+z) e lateral a leste (+x)", () => {
    const f = posicaoDaPose(poseDoPreset("frontal", e), 30);
    const l = posicaoDaPose(poseDoPreset("lateral", e), 30);
    expect(f[2]).toBeGreaterThan(e.centro[2] + 25);
    expect(l[0]).toBeGreaterThan(e.centro[0] + 25);
    expect(poseDoPreset("superior", e).el).toBeGreaterThan(1.5);
  });
  it("pose ↔ posição são inversas", () => {
    const p = poseDoPreset("isometrica", e);
    const q = poseDaPosicao(posicaoDaPose(p, 30), p.alvo, 30);
    expect(q.az).toBeCloseTo(p.az);
    expect(q.el).toBeCloseTo(p.el);
    expect(q.dist).toBeCloseTo(p.dist);
  });
  it("azimute pelo caminho mais curto", () => {
    expect(deltaAngular(3, -3)).toBeCloseTo(2 * Math.PI - 6);
    expect(deltaAngular(-Math.PI / 2, Math.PI / 2)).toBeCloseTo(Math.PI);
  });
  it("roteiro: extremos exatos e transição suave", () => {
    const r = roteiroPadrao(30);
    expect(poseNoTempo(r, e, 0, 30)).toEqual(poseDoPreset("frontal", e));
    expect(poseNoTempo(r, e, 30, 30)).toEqual(poseDoPreset("superior", e));
    const meio = poseNoTempo(r, e, 5, 30); // metade entre frontal (0) e isométrica (−45°)
    expect(meio.az).toBeCloseTo(-Math.PI / 8);
    const quase = poseNoTempo(r, e, 0.1, 30); // smoothstep: começa devagar
    expect(Math.abs(quase.az)).toBeLessThan(0.01);
  });
  it("órbita dá uma volta completa no vídeo", () => {
    const r = [{ segundo: 0, camera: "orbita" as const }];
    const a = poseNoTempo(r, e, 0, 20).az, b = poseNoTempo(r, e, 10, 20).az, c = poseNoTempo(r, e, 20, 20).az;
    expect(b - a).toBeCloseTo(Math.PI);
    expect(c - a).toBeCloseTo(2 * Math.PI);
  });
});

describe("tempo da obra → tempo do vídeo (§23)", () => {
  it("180 dias em 30 s a 30 fps", () => {
    const n = totalDeQuadros(30, 30);
    expect(n).toBe(900);
    expect(diaDoQuadro(0, n, 180)).toBe(0);
    expect(Math.floor(diaDoQuadro(n - 1, n, 180))).toBe(179);
    expect(diaDoQuadro(Math.round((n - 1) / 2), n, 180)).toBeCloseTo(90, 0);
  });
});
