import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { ErroParametro, dimensionar, gerarCasa, type ParametrosCasa } from "../src/bim/parametrico";
import { aplicarMapeamento, regrasPadrao, semTarefa } from "../src/fourd/regras";
import { avaliar } from "../src/fourd/simulacao";
import { formatarBR } from "../src/fourd/tempo";
import { importarCsv } from "../src/importers/cronograma";
import { importarXlsx, serialParaDia } from "../src/importers/xlsx";
import { ErroProjeto, exportar4dstudio, importar4dstudio, type RegistroProjeto } from "../src/storage/projeto";
import { useProjeto } from "../src/state/projectStore";

const base: ParametrosCasa = { terrenoLargura: 12, terrenoComprimento: 30, area: 120, pavimentos: 1, peDireito: 2.8, cobertura: "duas-aguas" };
const contar = (p: ParametrosCasa) => {
  const c: Record<string, number> = {};
  for (const e of gerarCasa(p).elementos) c[e.ifcType + (e.predefinedType ? `:${e.predefinedType}` : "")] = (c[e.ifcType + (e.predefinedType ? `:${e.predefinedType}` : "")] ?? 0) + 1;
  return c;
};
const demoCsv = () => importarCsv(new Uint8Array(readFileSync("public/samples/demo-cronograma.csv"))).cronograma!;

describe("modo paramétrico (ADR-12)", () => {
  it("é determinístico", () => {
    const a = gerarCasa(base), b = gerarCasa(base);
    expect(a.elementos).toEqual(b.elementos);
    expect([...a.malhas[10].posicoes]).toEqual([...b.malhas[10].posicoes]);
  });
  it("a área por pavimento é a pedida", () => {
    const d = dimensionar(base);
    expect(d.largura * d.profundidade).toBeCloseTo(120, 0);
    const d2 = dimensionar({ ...base, area: 200, pavimentos: 2 });
    expect(d2.areaPavimento).toBeCloseTo(100, 0);
  });
  it("gera todos os componentes do §28 numa casa térrea", () => {
    const c = contar(base);
    for (const k of ["IfcGeographicElement:TERRAIN", "IfcFooting:STRIP_FOOTING", "IfcFooting:PAD_FOOTING", "IfcSlab:BASESLAB", "IfcColumn:COLUMN", "IfcBeam:BEAM", "IfcWall:SOLIDWALL", "IfcDoor:DOOR", "IfcWindow:WINDOW", "IfcSlab:FLOOR", "IfcSlab:ROOF", "IfcCovering:FLOORING"]) {
      expect(c[k], k).toBeGreaterThan(0);
    }
    expect(c["IfcSlab:ROOF"]).toBe(3); // duas águas + telhado da varanda (ADR-31)
    expect(c["IfcStair:STRAIGHT_RUN_STAIR"]).toBeUndefined();
  });
  it("2 pavimentos: escada, laje intermediária e o dobro de pilares", () => {
    const um = contar(base); // 120 m² térreos
    const dois = contar({ ...base, area: 240, pavimentos: 2 }); // mesma planta, dois pavimentos
    expect(dois["IfcStair:STRAIGHT_RUN_STAIR"]).toBe(1);
    expect(dois["IfcSlab:FLOOR"]).toBe(2);
    expect(dois["IfcColumn:COLUMN"]).toBe(2 * um["IfcColumn:COLUMN"]);
    expect(dois["IfcFooting:PAD_FOOTING"]).toBe(um["IfcFooting:PAD_FOOTING"]);
    const escada = gerarCasa({ ...base, area: 240, pavimentos: 2 }).elementos.find((e) => e.ifcType === "IfcStair")!;
    expect(escada.pavimento).toBe("Térreo");
  });
  it("coberturas: plana tem platibanda; uma água tem uma laje inclinada", () => {
    expect(contar({ ...base, cobertura: "plana" })["IfcWall:PARAPET"]).toBe(4);
    expect(contar({ ...base, cobertura: "uma-agua" })["IfcSlab:ROOF"]).toBe(2); // + varanda
  });
  it("recusa casa que não cabe no lote e diz quanto falta", () => {
    expect(() => gerarCasa({ ...base, terrenoLargura: 10, terrenoComprimento: 20, area: 200 })).toThrow(ErroParametro);
    expect(() => gerarCasa({ ...base, terrenoLargura: 10, terrenoComprimento: 20, area: 200 })).toThrow(/faltam \d+(,\d+)? m²/);
    expect(() => gerarCasa({ ...base, peDireito: 2.2 })).toThrow(/pé-direito/);
  });
  it("as regras ligam 100% dos elementos ao cronograma de demonstração", () => {
    const casa = gerarCasa({ ...base, area: 200, pavimentos: 2 });
    const c = demoCsv();
    const v = aplicarMapeamento(casa.elementos, regrasPadrao(c.tarefas), []);
    expect(semTarefa(v)).toEqual([]);
    const fim = avaliar(179.99, { vinculos: v, tarefas: c.tarefas, politica: "fantasma" });
    expect([...fim.values()].every((s) => s.visivel && s.fase === "concluido")).toBe(true);
  });
  it("fachada frontal com entrada, varanda, peitoris, barrado de pedra e calçada (ADR-31)", () => {
    const casa = gerarCasa(base);
    const nomes = casa.elementos.map((e) => e.nome);
    const porta = casa.elementos.findIndex((e) => e.nome === "Porta de entrada, térreo");
    // a porta de entrada fica na fachada frontal (z ≈ 0), e não mais na lateral
    const zs = casa.malhas[porta].posicoes.filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs.map(Math.abs))).toBeLessThan(0.2);
    for (const n of ["Telhado da varanda", "Piso da varanda", "Revestimento de pedra da fachada", "Calçada em volta da casa"]) expect(nomes).toContain(n);
    expect(casa.elementos.filter((e) => e.objectType === "PILAR DA VARANDA")).toHaveLength(2);
    const peitoris = casa.elementos.filter((e) => e.predefinedType === "MOLDING" && e.nome.startsWith("Peitoril"));
    expect(peitoris.length).toBe(casa.elementos.filter((e) => e.ifcType === "IfcWindow" && !/transversal/.test(e.nome)).length);
  });
  it("normais apontam para fora (casa térrea: o telhado olha para cima)", () => {
    const casa = gerarCasa(base);
    const i = casa.elementos.findIndex((e) => e.predefinedType === "ROOF");
    const n = casa.malhas[i].normais;
    let cima = 0;
    for (let k = 1; k < n.length; k += 3) if (n[k] > 0.9) cima++;
    expect(cima).toBeGreaterThan(0);
  });
});

describe("XLSX (ADR-05)", () => {
  it("converte o número de série do Excel", () => {
    expect(formatarBR(serialParaDia(46027))).toBe("05/01/2026");
    expect(formatarBR(serialParaDia(44565, true))).toBe("05/01/2026"); // sistema de datas 1904
  });
  it("lê datas do Excel e datas em texto", async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["id", "nome", "inicio", "fim", "categoria"],
      ["F", "Fundação", 46027, 46036, "fundacao"],
      ["E", "Estrutura", "15/01/2026", "2026-02-03", "estrutura"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cronograma");
    const bytes = new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
    const r = await importarXlsx(bytes);
    expect(r.problemas).toEqual([]);
    expect(r.formato).toContain("Cronograma");
    expect(formatarBR(r.cronograma!.inicio)).toBe("05/01/2026");
    expect(r.cronograma!.tarefas.map((t) => [t.id, t.ini, t.fim])).toEqual([["F", 0, 9], ["E", 10, 29]]);
  });
  it("acusa coluna faltando", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["nome", "fim"], ["A", 46027]]), "P");
    const r = await importarXlsx(new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer));
    expect(r.cronograma).toBeNull();
    expect(r.problemas.map((p) => p.mensagem).join()).toMatch(/Falta a coluna "id"/);
  });
});

describe(".4dstudio (§38)", () => {
  const registro: RegistroProjeto = {
    id: "x",
    nome: "Casa da Dani",
    criadoEm: "2026-10-07T10:00:00.000Z",
    atualizadoEm: "2026-10-07T11:00:00.000Z",
    modelo: { tipo: "IFC", arquivo: "demo.ifc", tamanho: 3 },
    cronograma: demoCsv(),
    arquivoCronograma: "demo-cronograma.csv",
    excecoes: [{ taskId: "ALV-01", guid: "g1", acao: "construct", modo: "exclude" }],
    politica: "oculto",
    modoAnimacao: "crescimento",
    video: { formato: "vertical", fps: 24, segundos: 60, roteiro: [{ segundo: 0, camera: "orbita" }] },
    demo: false,
  };
  it("ida e volta preserva tudo", () => {
    const ifc = new Uint8Array(readFileSync("public/samples/demo.ifc"));
    const { registro: r, ifc: i } = importar4dstudio(exportar4dstudio(registro, ifc));
    const { id: _id, ...semId } = registro;
    expect(r).toEqual({ ...semId, fotos: [], planta: null, aparencia3d: "realista" }); // v2 sempre devolve os anexos e a aparência

    expect(i!.length).toBe(ifc.length);
  });
  it("modelo paramétrico vai sem IFC", () => {
    const p: RegistroProjeto = { ...registro, modelo: { tipo: "PARAMETRICO", parametros: base } };
    const { registro: r, ifc } = importar4dstudio(exportar4dstudio(p, null));
    expect(r.modelo).toEqual(p.modelo);
    expect(ifc).toBeNull();
  });
  it("recusa arquivo que não é .4dstudio", () => {
    expect(() => importar4dstudio(new TextEncoder().encode("não é zip"))).toThrow(ErroProjeto);
    expect(() => importar4dstudio(new TextEncoder().encode("não é zip"))).toThrow("Este arquivo não é um projeto .4dstudio.");
  });
});

describe("edição de tarefas (§12)", () => {
  it("editar preserva exceções; excluir a tarefa remove as dela", () => {
    const st = useProjeto.getState();
    st.reiniciar();
    st.definirCronograma(demoCsv(), "demo.csv", "CSV", [], false);
    st.definirProjeto({}); // sem efeito, só confirma que a ação existe
    useProjeto.setState({ excecoes: [
      { taskId: "ALV-01", guid: "g1", acao: "construct", modo: "exclude" },
      { taskId: "PIN-01", guid: "g2", acao: "finish", modo: "exclude" },
    ] });
    const c = useProjeto.getState().cronograma!;
    const alv = c.tarefas.find((t) => t.id === "ALV-01")!;
    // estende a alvenaria em 5 dias e renomeia o ID
    const erro = st.salvarTarefa({ id: "ALV-02", nome: "Alvenaria estendida", categoria: "alvenaria", inicio: c.inicio + alv.ini, fim: c.inicio + alv.fim + 5 }, "ALV-01");
    expect(erro).toBeNull();
    const s = useProjeto.getState();
    expect(s.cronograma!.tarefas.find((t) => t.id === "ALV-02")!.fim).toBe(alv.fim + 5);
    expect(s.excecoes.map((x) => x.taskId).sort()).toEqual(["ALV-02", "PIN-01"]);
    st.excluirTarefa("PIN-01");
    expect(useProjeto.getState().excecoes.map((x) => x.taskId)).toEqual(["ALV-02"]);
  });
  it("valida fim antes do início e ID repetido", () => {
    const st = useProjeto.getState();
    const c = useProjeto.getState().cronograma!;
    expect(st.salvarTarefa({ id: "N", nome: "X", categoria: "pintura", inicio: c.inicio + 10, fim: c.inicio + 5 }, null)).toMatch(/termina antes/);
    expect(st.salvarTarefa({ id: "FUN-01", nome: "X", categoria: "pintura", inicio: c.inicio, fim: c.inicio }, null)).toMatch(/Já existe/);
  });
  it("criar cronograma do zero com a primeira tarefa", () => {
    const st = useProjeto.getState();
    st.reiniciar();
    expect(st.salvarTarefa({ id: "T-01", nome: "Fundação", categoria: "fundacao", inicio: 20_000, fim: 20_009 }, null)).toBeNull();
    expect(useProjeto.getState().cronograma).toEqual({ inicio: 20_000, tarefas: [{ id: "T-01", nome: "Fundação", categoria: "fundacao", ini: 0, fim: 9 }] });
  });
});
