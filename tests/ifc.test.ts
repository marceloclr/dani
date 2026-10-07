import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { IfcAPI } from "web-ifc";
import { ErroIfc, lerIfc } from "../src/bim/parseIfc";
import { importarCsv } from "../src/importers/cronograma";
import { aplicarMapeamento, contarPorTarefa, regrasPadrao, semTarefa } from "../src/fourd/regras";
import { avaliar } from "../src/fourd/simulacao";

const api = new IfcAPI();
beforeAll(async () => {
  await api.Init(undefined, true);
});

describe("IFC de demonstração", () => {
  const modelo = () => lerIfc(api, new Uint8Array(readFileSync("public/samples/demo.ifc")));

  it("carrega 146 elementos com metadados e geometria", () => {
    const m = modelo();
    expect(m.esquema).toBe("IFC4");
    expect(m.elementos).toHaveLength(146);
    expect(m.malhas).toHaveLength(146);
    const parede = m.elementos.find((e) => e.nome === "Parede: Fachada frontal")!;
    expect(parede).toMatchObject({ ifcType: "IfcWall", pavimento: "Térreo", material: "Bloco cerâmico" });
    expect(parede.guid).toHaveLength(22);
    const telhado = m.elementos.find((e) => e.nome === "Telhado da sala")!;
    expect(telhado).toMatchObject({ predefinedType: "ROOF", pavimento: "Térreo" }); // herdado do IfcRoof
  });

  it("geometria em Y para cima: pé-direito duplo da sala chega a 6 m", () => {
    const m = modelo();
    const i = m.elementos.findIndex((e) => e.nome === "Parede: Lateral oeste, sala");
    const p = m.malhas[i].posicoes;
    let maxY = -Infinity;
    for (let k = 1; k < p.length; k += 3) maxY = Math.max(maxY, p[k]);
    expect(maxY).toBeCloseTo(6.0, 2);
  });

  it("as regras-padrão ligam todos os elementos ao cronograma da demo", () => {
    const m = modelo();
    const crono = importarCsv(new Uint8Array(readFileSync("public/samples/demo-cronograma.csv"))).cronograma!;
    expect(crono.tarefas).toHaveLength(15);
    const vinc = aplicarMapeamento(m.elementos, regrasPadrao(crono.tarefas), []);
    expect(semTarefa(vinc)).toEqual([]);
    const n = contarPorTarefa(vinc);
    for (const id of ["FUN-01", "EST-01", "ALV-01", "COB-01"]) expect(n.get(id)).toBeGreaterThan(0);
    // ordem construtiva: no fim da fundação ainda não há paredes; no último dia tudo está visível
    const fimFundacao = crono.tarefas.find((t) => t.id === "FUN-01")!.fim;
    const ctx = { vinculos: vinc, tarefas: crono.tarefas, politica: "fantasma" as const };
    const paredes = m.elementos.filter((e) => e.ifcType === "IfcWall").map((e) => e.guid);
    expect(paredes.every((g) => !avaliar(fimFundacao, ctx).get(g)!.visivel)).toBe(true);
    const fim = avaliar(179, ctx);
    expect([...fim.values()].every((s) => s.visivel)).toBe(true);
  });

  it("rejeita arquivo que não é IFC com mensagem amigável", () => {
    expect(() => lerIfc(api, new TextEncoder().encode("isto não é um IFC"))).toThrow(ErroIfc);
    expect(() => lerIfc(api, new TextEncoder().encode("isto não é um IFC"))).toThrow("O arquivo não parece ser um modelo IFC.");
  });
});
