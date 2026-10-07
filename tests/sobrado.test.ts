import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { IfcAPI } from "web-ifc";
import { lerIfc } from "../src/bim/parseIfc";
import { pavimentosDoModelo } from "../src/fourd/estimativa";
import { aplicarMapeamento, regrasPadrao, semTarefa } from "../src/fourd/regras";
import { avaliar } from "../src/fourd/simulacao";
import { importarCsv } from "../src/importers/cronograma";

const api = new IfcAPI();
beforeAll(async () => {
  await api.Init(undefined, true);
});

describe("sobrado-exemplo.ifc (segundo modelo de teste)", () => {
  const ler = () => lerIfc(api, new Uint8Array(readFileSync("public/modelos/sobrado-exemplo.ifc")));

  it("abre com dois pavimentos, escada e telhado de duas águas", () => {
    const m = ler();
    expect(m.esquema).toBe("IFC4");
    expect(m.elementos).toHaveLength(157); // 176 produtos − 14 vãos − sítio, edifício, 2 pavimentos − IfcRoof (agregado, sem geometria); 24 são móveis e 32 acabamentos (INC-13)
    const baseY = new Map(m.malhas.map((x) => [x.guid, Math.min(...Array.from({ length: x.posicoes.length / 3 }, (_, i) => x.posicoes[i * 3 + 1]))]));
    expect(pavimentosDoModelo(m.elementos, (g) => baseY.get(g))).toEqual(["Térreo", "Pavimento superior"]);
    expect(m.elementos.filter((e) => e.ifcType === "IfcStair")).toHaveLength(1);
    expect(m.elementos.filter((e) => e.predefinedType === "ROOF").map((e) => e.pavimento)).toEqual(["Pavimento superior", "Pavimento superior"]);
    // cumeeira a 7,40 m
    const i = m.elementos.findIndex((e) => e.nome === "Oitão frontal");
    let maxY = -Infinity;
    for (let k = 1; k < m.malhas[i].posicoes.length; k += 3) maxY = Math.max(maxY, m.malhas[i].posicoes[k]);
    expect(maxY).toBeCloseTo(7.4, 2);
  });

  it("o cronograma do sobrado liga todos os elementos e respeita os pavimentos", () => {
    const m = ler();
    const c = importarCsv(new Uint8Array(readFileSync("public/modelos/cronograma-sobrado.csv"))).cronograma!;
    expect(c.tarefas).toHaveLength(18);
    const v = aplicarMapeamento(m.elementos, regrasPadrao(c.tarefas), []);
    expect(semTarefa(v)).toEqual([]);
    const alvT = c.tarefas.find((t) => t.id === "ALV-T")!;
    const est = avaliar(Math.floor((alvT.ini + alvT.fim) / 2), { vinculos: v, tarefas: c.tarefas, politica: "fantasma" });
    const paredes = (pav: string) => m.elementos.filter((e) => e.ifcType === "IfcWall" && e.pavimento === pav && e.nome.startsWith("Parede"));
    expect(paredes("Térreo").every((e) => est.get(e.guid)!.visivel)).toBe(true);
    expect(paredes("Pavimento superior").some((e) => est.get(e.guid)!.visivel)).toBe(false);
    const fim = avaliar(269.99, { vinculos: v, tarefas: c.tarefas, politica: "fantasma" });
    expect([...fim.values()].every((s) => s.visivel)).toBe(true);
  });
});
