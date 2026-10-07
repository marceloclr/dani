// Luz da cena e luminárias da obra pronta (ADR-24) nos dois modelos de exemplo.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { IfcAPI } from "web-ifc";
import { lerIfc } from "../src/bim/parseIfc";
import { LUZES, luminarias } from "../src/rendering/iluminacao";
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
  it("o sol fica acima do horizonte de dia e no entardecer, abaixo à noite", () => {
    expect(LUZES.dia.sol[1]).toBeGreaterThan(0.5);
    expect(LUZES.entardecer.sol[1]).toBeGreaterThan(0);
    expect(LUZES.entardecer.sol[1]).toBeLessThan(0.2);
    expect(LUZES.noite.sol[1]).toBeLessThan(0);
    expect(LUZES.dia.luminarias).toBe(0);
    expect(LUZES.noite.luminarias).toBe(1);
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
