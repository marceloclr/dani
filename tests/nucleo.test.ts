import { describe, expect, it } from "vitest";
import { formatarBR, lerData } from "../src/fourd/tempo";
import { importarCsv, importarJson } from "../src/importers/cronograma";
import { aplicarMapeamento, casa, regrasPadrao } from "../src/fourd/regras";
import { estadoDe } from "../src/fourd/simulacao";
import type { ElementoMeta, Tarefa, Vinculo } from "../src/types";

const enc = (s: string) => new TextEncoder().encode(s);
/** Windows-1252 para os caracteres usados nos testes. */
const cp1252 = (s: string) => Uint8Array.from([...s].map((c) => ({ ç: 0xe7, ã: 0xe3, é: 0xe9, í: 0xed, ó: 0xf3 } as Record<string, number>)[c] ?? c.charCodeAt(0)));

const el = (p: Partial<ElementoMeta>): ElementoMeta => ({
  guid: p.guid ?? "g", expressId: 1, ifcType: "IfcWall", predefinedType: null, objectType: null, nome: "x", pavimento: "Térreo", material: null, ...p,
});

describe("datas (ADR-05)", () => {
  it("2026-01-01 continua sendo 1º de janeiro em America/Fortaleza", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("America/Fortaleza");
    expect(formatarBR(lerData("2026-01-01")!)).toBe("01/01/2026");
    expect(formatarBR(lerData("15/03/2026")!)).toBe("15/03/2026");
  });
  it("rejeita datas inexistentes", () => {
    expect(lerData("31/02/2026")).toBeNull();
    expect(lerData("2026-13-01")).toBeNull();
    expect(lerData("amanhã")).toBeNull();
  });
});

describe("importação de cronograma", () => {
  it("lê CSV com ; e datas brasileiras", () => {
    const r = importarCsv(enc("id;nome;inicio;fim;categoria\nA;Fundação;01/03/2026;15/03/2026;fundacao\nB;Estrutura;16/03/2026;31/03/2026;estrutura\n"));
    expect(r.problemas).toEqual([]);
    expect(r.formato).toContain('";"');
    expect(r.cronograma!.tarefas.map((t) => [t.id, t.ini, t.fim])).toEqual([["A", 0, 14], ["B", 15, 30]]);
  });
  it("lê Windows-1252 com acentos e UTF-8 com BOM", () => {
    const w = importarCsv(cp1252("id;nome;inicio;fim;categoria\n1;Fundação;2026-01-01;2026-01-10;fundacao\n"));
    expect(w.formato).toContain("windows-1252");
    expect(w.cronograma!.tarefas[0].nome).toBe("Fundação");
    const b = importarCsv(Uint8Array.from([0xef, 0xbb, 0xbf, ...enc("id,nome,inicio,fim,categoria\n1,Pintura,2026-01-01,2026-01-02,pintura\n")]));
    expect(b.cronograma!.tarefas[0].nome).toBe("Pintura");
  });
  it("acusa fim antes do início, ID repetido e ausente", () => {
    const r = importarCsv(enc("id,nome,inicio,fim,categoria\n1,A,2026-02-10,2026-02-01,x\n2,B,2026-01-01,2026-01-02,x\n2,C,2026-01-01,2026-01-02,x\n,D,2026-01-01,2026-01-02,x\n"));
    expect(r.cronograma).toBeNull();
    const msgs = r.problemas.map((p) => p.mensagem).join("\n");
    expect(msgs).toMatch(/termina antes de começar/);
    expect(msgs).toMatch(/"2" repetido/);
    expect(msgs).toMatch(/sem ID/);
  });
  it("aceita JSON no formato do §9", () => {
    const r = importarJson(enc(JSON.stringify({ schedule: { tasks: [{ id: "FOUND-001", name: "Fundação", category: "fundacao", startDate: "2026-01-01", endDate: "2026-01-15", progress: 0 }] } })));
    expect(r.cronograma!.tarefas[0]).toMatchObject({ id: "FOUND-001", ini: 0, fim: 14, categoria: "fundacao" });
  });
});

describe("regras de mapeamento (ADR-02)", () => {
  const t = (id: string, categoria: string): Tarefa => ({ id, nome: id, categoria, ini: 0, fim: 1 });
  const regras = regrasPadrao([t("F", "fundacao"), t("L", "laje"), t("C", "cobertura")]);
  const alvo = (pt: string) => regras.filter((r) => casa(el({ ifcType: "IfcSlab", predefinedType: pt }), r.onde)).map((r) => r.taskId);
  it("separa IfcSlab por PredefinedType", () => {
    expect(alvo("BASESLAB")).toEqual(["F"]);
    expect(alvo("FLOOR")).toEqual(["L"]);
    expect(alvo("ROOF")).toEqual(["C"]);
  });
  it("exceção exclui e inclui elementos", () => {
    const tarefas = [t("A", "alvenaria"), t("P", "pintura")];
    const els = [el({ guid: "p1" }), el({ guid: "p2" })];
    const m = aplicarMapeamento(els, regrasPadrao(tarefas), [{ taskId: "A", guid: "p1", acao: "construct", modo: "exclude" }]);
    expect(m.get("p1")!.map((v) => v.taskId)).toEqual(["P"]);
    expect(m.get("p2")!.map((v) => v.taskId)).toEqual(["A", "P"]);
  });
});

describe("simulação avaliar(dia) (ADR-03)", () => {
  const tarefas = new Map<string, Tarefa>([
    ["A", { id: "A", nome: "Alvenaria", categoria: "alvenaria", ini: 10, fim: 19 }],
    ["R", { id: "R", nome: "Reboco", categoria: "reboco", ini: 18, fim: 25 }],
    ["P", { id: "P", nome: "Pintura", categoria: "pintura", ini: 30, fim: 35 }],
  ]);
  const parede: Vinculo[] = [
    { taskId: "A", acao: "construct", origem: "regra" },
    { taskId: "R", acao: "finish", origem: "regra" },
    { taskId: "P", acao: "finish", origem: "regra" },
  ];
  const fase = (dia: number) => estadoDe(parede, dia, tarefas, "fantasma");

  it("antes da tarefa → oculto; primeiro e último dia → em execução; dia seguinte → concluído", () => {
    expect(fase(9)).toMatchObject({ visivel: false, fase: "oculto" });
    expect(fase(10)).toMatchObject({ visivel: true, fase: "em-execucao" });
    expect(fase(10).progresso).toBeCloseTo(0.1);
    expect(fase(19).fase).toBe("em-execucao");
    expect(fase(26)).toMatchObject({ fase: "concluido", aparencia: "reboco" });
  });
  it("tarefas sobrepostas: o acabamento prevalece sobre a construção", () => {
    expect(fase(18).fase).toBe("em-execucao");
    expect(fase(18).progresso).toBeCloseTo(1 / 8); // governado pelo reboco (dia 1 de 8)
  });
  it("aparência segue o último acabamento concluído", () => {
    expect(fase(29).aparencia).toBe("reboco");
    expect(fase(36).aparencia).toBe("pintura");
  });
  it("elemento sem tarefa segue a política configurada", () => {
    expect(estadoDe([], 0, tarefas, "fantasma")).toMatchObject({ visivel: true, fase: "fantasma" });
    expect(estadoDe([], 0, tarefas, "oculto")).toMatchObject({ visivel: false });
    expect(estadoDe([], 0, tarefas, "visivel")).toMatchObject({ visivel: true, fase: "concluido" });
  });
  it("parede excluída da alvenaria fica fantasma", () => {
    const soAcabamento = parede.filter((v) => v.taskId !== "A");
    expect(estadoDe(soAcabamento, 12, tarefas, "fantasma").fase).toBe("fantasma");
  });
});
