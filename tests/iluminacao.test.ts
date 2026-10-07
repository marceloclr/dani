// Luz da cena e luminárias da obra pronta (ADR-24) nos dois modelos de exemplo.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { IfcAPI } from "web-ifc";
import { lerIfc } from "../src/bim/parseIfc";
import { direcaoDaLuz, luminarias, minutosDaLuz, parametrosDoSol } from "../src/rendering/iluminacao";
import { horarioDoVoo, resolverContexto } from "../src/rendering/cicloDia";
import { caixaDe, type Solido } from "../src/rendering/navegacao";
import { curvaS } from "../src/rendering/acabamento";
import { tingir } from "../src/rendering/ambiente";

const api = new IfcAPI();
beforeAll(async () => {
  await api.Init(undefined, true);
});

function solidosDe(arquivo: string): Solido[] {
  const m = lerIfc(api, new Uint8Array(readFileSync(arquivo)));
  return m.malhas.map((x, i) => ({ guid: x.guid, ifcType: m.elementos[i].ifcType, nome: m.elementos[i].nome, posicoes: x.posicoes, indices: x.indices }));
}

describe.each([
  ["sobrado", "public/modelos/sobrado-exemplo.ifc", 2],
  ["demo", "public/modelos/casa-exemplo.ifc", 1],
])("luminárias no modelo %s", (_n, arquivo, pavimentos) => {
  let solidos: Solido[];
  beforeAll(() => {
    solidos = solidosDe(arquivo);
  });
  it("põe luz em cada pavimento, dentro da casa, longe das paredes e abaixo do teto", () => {
    const l = luminarias(solidos);
    expect(l.length).toBeGreaterThanOrEqual(pavimentos * 2);
    const alturas = new Set(l.map((x) => Math.round(x.pos[1])));
    expect(alturas.size).toBe(pavimentos);
    const paredes = solidos.filter((s) => s.ifcType === "IfcWall").map(caixaDe);
    const x0 = Math.min(...paredes.map((b) => b.min[0])), x1 = Math.max(...paredes.map((b) => b.max[0]));
    const z0 = Math.min(...paredes.map((b) => b.min[2])), z1 = Math.max(...paredes.map((b) => b.max[2]));
    for (const { pos, folga } of l) {
      expect(pos[0]).toBeGreaterThan(x0);
      expect(pos[0]).toBeLessThan(x1);
      expect(pos[2]).toBeGreaterThan(z0);
      expect(pos[2]).toBeLessThan(z1);
      expect(folga).toBeGreaterThanOrEqual(0.8); // a 0,8 m ou mais de qualquer parede ou móvel
    }
    // espaçadas
    for (let i = 0; i < l.length; i++)
      for (let j = i + 1; j < l.length; j++)
        if (Math.abs(l[i].pos[1] - l[j].pos[1]) < 0.5) expect(Math.hypot(l[i].pos[0] - l[j].pos[0], l[i].pos[2] - l[j].pos[2])).toBeGreaterThanOrEqual(2.8);
  });
});

describe("luz e acabamento", () => {
  it("a luz é contínua pela elevação do sol e as luminárias acendem conforme ele desce", () => {
    let ant = parametrosDoSol(60);
    for (let e = 59.5; e >= -15; e -= 0.5) {
      const p = parametrosDoSol(e);
      expect(Math.abs(p.intensidadeSol - ant.intensidadeSol)).toBeLessThan(0.3); // sem degraus
      expect(p.luminarias).toBeGreaterThanOrEqual(ant.luminarias - 1e-12); // só aumentam ao escurecer
      ant = p;
    }
    expect(parametrosDoSol(40).luminarias).toBe(0);
    expect(parametrosDoSol(-10).luminarias).toBe(1);
    expect(parametrosDoSol(40).brilho).toBe(false);
    expect(parametrosDoSol(2).brilho).toBe(false);
    expect(parametrosDoSol(-1).brilho).toBe(true);
    expect(parametrosDoSol(-6).ceuNoturno).toBe(true);
    expect(parametrosDoSol(-1).ceuNoturno).toBe(false);
  });
  it("abaixo do horizonte, a luz direcional vira o luar, alta e do lado oposto", () => {
    const l = direcaoDaLuz([1, -0.1, 0]);
    expect(l[1]).toBeGreaterThan(0.5);
    expect(l[0]).toBeLessThan(0);
    expect(direcaoDaLuz([0.6, 0.8, 0])).toEqual([0.6, 0.8, 0]);
  });
  it("horário de cada luz no dia", () => {
    const e = { nascer: 330, meioDia: 690, por: 1050 };
    expect(minutosDaLuz("nascer", e)).toBe(350);
    expect(minutosDaLuz("dia", e)).toBe(600);
    expect(minutosDaLuz("entardecer", e)).toBe(1015);
    expect(minutosDaLuz("noite", e)).toBe(1100);
    expect(minutosDaLuz("ciclo", e)).toBe(600);
  });
  it("ciclo do voo: do amanhecer à noite, sem voltar atrás, com a hora dourada no instante pedido", () => {
    const e = { nascer: 330, meioDia: 690, por: 1050 };
    const m = { fimConstrucao: 0.47, inicioInterno: 0.62, inicioVoltaFinal: 0.82, fimMovimento: 0.94 };
    expect(horarioDoVoo(0, m, 0.86, e)).toBe(305);
    expect(horarioDoVoo(0.47, m, 0.86, e)).toBe(720);
    expect(horarioDoVoo(0.86, m, 0.86, e)).toBe(1015);
    expect(horarioDoVoo(1, m, 0.86, e)).toBe(1100);
    let ant = -1;
    for (let u = 0; u <= 1; u += 0.005) {
      const h = horarioDoVoo(u, m, 0.86, e);
      expect(h).toBeGreaterThanOrEqual(ant);
      ant = h;
    }
  });
  it("local e norte: o ajustado vence o IFC, que vence o município; sem nada, Fortaleza e a frente ao norte", () => {
    expect(resolverContexto({ norteGraus: 30 }, { norteGraus: 70, lat: -3, lon: -38 }, null)).toMatchObject({ norte: 30, origemNorte: "ajustado", origemLocal: "ifc" });
    expect(resolverContexto(undefined, { norteGraus: 70 }, { lat: -4, lon: -38.5 })).toMatchObject({ norte: 70, origemNorte: "ifc", origemLocal: "municipio" });
    expect(resolverContexto(undefined, {}, null)).toMatchObject({ norte: 0, origemNorte: "padrao", origemLocal: "padrao" });
  });
  it("a curva de contraste preserva preto, branco e meio-tom", () => {
    expect(curvaS(0, 0.3)).toBe(0);
    expect(curvaS(1, 0.3)).toBe(1);
    expect(curvaS(0.5, 0.3)).toBeCloseTo(0.5);
    expect(curvaS(0.25, 0.3)).toBeLessThan(0.25);
    expect(curvaS(0.75, 0.3)).toBeGreaterThan(0.75);
  });
  it("tingir leva a média da foto à cor de referência", () => {
    expect(tingir("reboco", [142, 138, 136]).every((v) => Math.abs(v - 1) < 1e-9)).toBe(true);
    const [r, , b] = tingir("reboco", [206, 199, 186]);
    expect(r).toBeGreaterThan(1);
    expect(b).toBeGreaterThan(1);
  });
});
