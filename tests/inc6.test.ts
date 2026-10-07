import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import { gerarCasa } from "../src/bim/parametrico";
import { estimarCronograma, etapasDaEstimativa, pavimentosDoModelo, prazoSugerido } from "../src/fourd/estimativa";
import { aplicarMapeamento, regrasPadrao, semTarefa } from "../src/fourd/regras";
import { avaliar } from "../src/fourd/simulacao";
import { importarCsv } from "../src/importers/cronograma";
import { useProjeto } from "../src/state/projectStore";

describe("prazo sugerido (ADR-18)", () => {
  it("segue a fórmula", () => {
    expect(prazoSugerido(120, 1, "concreto")).toBe(168); // 60 + 108
    expect(prazoSugerido(120, 2, "concreto")).toBe(Math.round(168 * 1.15));
    expect(prazoSugerido(120, 1, "metalica")).toBe(Math.round(168 * 0.8));
    expect(prazoSugerido(120, 1, "alvenaria-estrutural")).toBeLessThan(prazoSugerido(120, 1, "concreto"));
    expect(prazoSugerido(400, 1, "concreto")).toBeGreaterThan(prazoSugerido(120, 1, "concreto"));
  });
});

describe("cronograma estimado", () => {
  const c = estimarCronograma({ area: 120, pavimentos: ["Térreo"], estrutura: "concreto", inicio: 20458, prazo: 180 });
  it("é marcado como estimado e cobre o prazo inteiro", () => {
    expect(c.estimado).toBe(true);
    expect(Math.min(...c.tarefas.map((t) => t.ini))).toBe(0);
    expect(Math.max(...c.tarefas.map((t) => t.fim))).toBe(179);
    expect(c.tarefas.every((t) => t.fim >= t.ini)).toBe(true);
  });
  it("ordem construtiva com sobreposição", () => {
    const ini = (id: string) => c.tarefas.find((t) => t.id === id)!.ini;
    const fim = (id: string) => c.tarefas.find((t) => t.id === id)!.fim;
    expect(ini("FUN-01")).toBeGreaterThanOrEqual(fim("PRE-01"));
    expect(ini("EST-1")).toBeGreaterThanOrEqual(fim("FUN-01"));
    expect(ini("ALV-1")).toBeLessThan(fim("EST-1")); // sobrepõe
    expect(ini("COB-01")).toBeGreaterThanOrEqual(fim("LAJ-1"));
    expect(fim("ENT-01")).toBe(179);
    expect(c.tarefas.map((t) => t.categoria)).toEqual(["terreno", "fundacao", "estrutura", "alvenaria", "laje", "cobertura", "instalacoes", "reboco", "esquadrias", "revestimento", "pintura", "loucas", "paisagismo", "limpeza", "entrega"]);
    expect(c.tarefas.some((t) => t.pavimento)).toBe(false); // um pavimento: vale para o prédio
  });
  it("um bloco estrutural por pavimento, de baixo para cima", () => {
    const pavs = ["Térreo", "Pavimento superior", "Cobertura técnica"];
    const e = etapasDaEstimativa(pavs, "concreto").filter((x) => x.pavimento);
    expect(e.map((x) => `${x.categoria}@${x.pavimento}`)).toEqual(pavs.flatMap((p) => [`estrutura@${p}`, `alvenaria@${p}`, `laje@${p}`]));
    const est = estimarCronograma({ area: 300, pavimentos: pavs, estrutura: "concreto", inicio: 0, prazo: 300 });
    const alvT = est.tarefas.find((t) => t.id === "ALV-1")!, estS = est.tarefas.find((t) => t.id === "EST-2")!;
    expect(estS.ini).toBeGreaterThan(alvT.ini);
  });
  it("prazo curto: toda etapa tem ao menos um dia", () => {
    const k = estimarCronograma({ area: 40, pavimentos: ["Térreo"], estrutura: "metalica", inicio: 0, prazo: 15 });
    expect(k.tarefas.every((t) => t.fim - t.ini + 1 >= 1 && t.fim <= 14)).toBe(true);
  });
  it("alvenaria estrutural: alvenaria antes de grautes e cintas", () => {
    const k = estimarCronograma({ area: 100, pavimentos: ["Térreo"], estrutura: "alvenaria-estrutural", inicio: 0, prazo: 200 });
    expect(k.tarefas.find((t) => t.id === "ALV-1")!.ini).toBeLessThan(k.tarefas.find((t) => t.id === "EST-1")!.ini);
    expect(k.tarefas.find((t) => t.id === "EST-1")!.nome).toBe("Grautes, cintas e vergas");
  });
});

describe("tarefa por pavimento (ADR-19)", () => {
  const casa = gerarCasa({ terrenoLargura: 12, terrenoComprimento: 30, area: 200, pavimentos: 2, peDireito: 2.8, cobertura: "duas-aguas" });
  const baseY = new Map(casa.malhas.map((m) => [m.guid, Math.min(...Array.from({ length: m.posicoes.length / 3 }, (_, i) => m.posicoes[i * 3 + 1]))]));
  it("lê os pavimentos do modelo de baixo para cima", () => {
    expect(pavimentosDoModelo(casa.elementos, (g) => baseY.get(g))).toEqual(["Térreo", "Pavimento superior"]);
  });
  it("as paredes de cima não sobem durante a alvenaria do térreo", () => {
    const c = estimarCronograma({ area: 200, pavimentos: ["Térreo", "Pavimento superior"], estrutura: "concreto", inicio: 0, prazo: 220 });
    const v = aplicarMapeamento(casa.elementos, regrasPadrao(c.tarefas), []);
    expect(semTarefa(v)).toEqual([]);
    const alvT = c.tarefas.find((t) => t.id === "ALV-1")!;
    const meio = Math.floor((alvT.ini + alvT.fim) / 2);
    const est = avaliar(meio, { vinculos: v, tarefas: c.tarefas, politica: "fantasma" });
    const paredes = (pav: string) => casa.elementos.filter((e) => e.ifcType === "IfcWall" && e.pavimento === pav && e.nome.startsWith("Parede"));
    expect(paredes("Térreo").every((e) => est.get(e.guid)!.visivel)).toBe(true);
    expect(paredes("Pavimento superior").some((e) => est.get(e.guid)!.visivel)).toBe(false);
  });
  it("importa a coluna pavimento", () => {
    const r = importarCsv(strToU8("id;nome;inicio;fim;categoria;pavimento\nA;Alvenaria do térreo;01/03/2026;10/03/2026;alvenaria;Térreo\nB;Pintura;11/03/2026;20/03/2026;pintura;\n"));
    expect(r.cronograma!.tarefas[0].pavimento).toBe("Térreo");
    expect(r.cronograma!.tarefas[1].pavimento).toBeUndefined();
    expect(regrasPadrao(r.cronograma!.tarefas)[0].onde.pavimento).toEqual(["Térreo"]);
  });
  it("editar uma estimativa a mantém estimada", () => {
    const st = useProjeto.getState();
    st.reiniciar();
    st.definirCronograma(estimarCronograma({ area: 100, pavimentos: ["Térreo"], estrutura: "concreto", inicio: 20000, prazo: 150 }), "estimativa automática", "estimativa", [], false);
    const t = useProjeto.getState().cronograma!.tarefas[0];
    expect(st.salvarTarefa({ id: t.id, nome: "Locação", categoria: t.categoria, inicio: 20000, fim: 20005 }, t.id)).toBeNull();
    expect(useProjeto.getState().cronograma!.estimado).toBe(true);
  });
});
