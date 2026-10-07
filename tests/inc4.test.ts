import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { importarCsv, importarJson, lerAvanco } from "../src/importers/cronograma";
import { importarXlsx } from "../src/importers/xlsx";
import { dataExif, lerFotosCsv } from "../src/importers/fotos";
import { avaliarReal, avancoPlanejado, avancoReal, compararEstados, dataDeStatus, desviosDasTarefas, fotoAte, tarefasReais } from "../src/fourd/real";
import { avaliar } from "../src/fourd/simulacao";
import { formatarBR } from "../src/fourd/tempo";
import { exportar4dstudio, importar4dstudio, type RegistroProjeto } from "../src/storage/projeto";
import type { FotoObra, Tarefa, Vinculo } from "../src/types";

const ler = (p: string) => new Uint8Array(readFileSync(p));

describe("colunas reais (ADR-13)", () => {
  it("avanço aceita 45%, 0,45 e 45", () => {
    expect(lerAvanco("45%")).toBeCloseTo(0.45);
    expect(lerAvanco("0,45")).toBeCloseTo(0.45);
    expect(lerAvanco("45")).toBeCloseTo(0.45);
    expect(lerAvanco("")).toBeUndefined();
    expect(lerAvanco("150%")).toBeNaN();
  });
  it("lê início, fim e avanço reais e valida", () => {
    const ok = importarCsv(strToU8("id;nome;inicio;fim;categoria;inicio_real;fim_real;avanco\nA;A;01/03/2026;10/03/2026;alvenaria;03/03/2026;15/03/2026;100%\nB;B;11/03/2026;20/03/2026;laje;16/03/2026;;40%\n"));
    expect(ok.problemas).toEqual([]);
    expect(ok.cronograma!.tarefas[0]).toMatchObject({ realIni: 2, realFim: 14, avanco: 1 });
    expect(ok.cronograma!.tarefas[1]).toMatchObject({ realIni: 15, avanco: 0.4 });
    expect(ok.cronograma!.tarefas[1].realFim).toBeUndefined();
    const ruim = importarCsv(strToU8("id,nome,inicio,fim,categoria,inicio_real,fim_real,avanco\nA,A,2026-03-01,2026-03-10,x,,2026-03-12,\nB,B,2026-03-01,2026-03-10,x,2026-03-05,2026-03-02,\nC,C,2026-03-01,2026-03-10,x,,,abc\n"));
    expect(ruim.cronograma).toBeNull();
    const m = ruim.problemas.map((p) => p.mensagem).join("\n");
    expect(m).toMatch(/fim real sem início real/);
    expect(m).toMatch(/anterior ao início real/);
    expect(m).toMatch(/avanço inválido/);
  });
});

describe("simulação real e comparação", () => {
  const tarefas: Tarefa[] = [
    { id: "A", nome: "Alvenaria", categoria: "alvenaria", ini: 10, fim: 19, realIni: 12, realFim: 25 },
    { id: "L", nome: "Laje", categoria: "laje", ini: 20, fim: 29, realIni: 26 },
    { id: "C", nome: "Cobertura", categoria: "cobertura", ini: 30, fim: 39 },
  ];
  const v = new Map<string, Vinculo[]>([
    ["parede", [{ taskId: "A", acao: "construct", origem: "regra" }]],
    ["laje", [{ taskId: "L", acao: "construct", origem: "regra" }]],
    ["telhado", [{ taskId: "C", acao: "construct", origem: "regra" }]],
  ]);
  const ctx = { vinculos: v, tarefas, politica: "fantasma" as const };

  it("data de status é a última data real ou de foto", () => {
    expect(dataDeStatus(tarefas)).toBe(26);
    expect(dataDeStatus(tarefas, [40])).toBe(40);
    expect(dataDeStatus([{ id: "x", nome: "x", categoria: "", ini: 0, fim: 1 }])).toBeNull();
  });
  it("sem início real, a tarefa não começou; sem fim real, segue em execução", () => {
    const r = tarefasReais(tarefas);
    expect(r[2].ini).toBeGreaterThan(1e6);
    expect(avaliarReal(11, ctx).get("parede")!.visivel).toBe(false); // começou só no dia 12
    expect(avaliarReal(22, ctx).get("parede")!.fase).toBe("em-execucao"); // terminou só no 25
    expect(avaliarReal(60, ctx).get("laje")!.fase).toBe("em-execucao");
    expect(avaliarReal(60, ctx).get("telhado")!.visivel).toBe(false);
  });
  it("compara: atrasado, adiantado e em dia", () => {
    const dia = 22;
    const d = compararEstados(avaliar(dia, ctx), avaliarReal(dia, ctx));
    expect(d.get("parede")).toBe("atrasado"); // planejado concluído, real em execução
    expect(d.get("laje")).toBe("atrasado"); // planejado existe, real ainda não
    expect(d.get("telhado")).toBe("em-dia");
    const adiantado: Tarefa[] = [{ id: "A", nome: "A", categoria: "alvenaria", ini: 10, fim: 19, realIni: 5, realFim: 8 }];
    const ctx2 = { vinculos: new Map([["parede", v.get("parede")!]]), tarefas: adiantado, politica: "fantasma" as const };
    expect(compararEstados(avaliar(7, ctx2), avaliarReal(7, ctx2)).get("parede")).toBe("adiantado");
  });
  it("indicadores de avanço", () => {
    expect(avancoPlanejado(tarefas, 19)).toBeCloseTo(10 / 30);
    expect(avancoPlanejado(tarefas, 100)).toBe(1);
    // A concluída (1 × 10), L sem avanço informado em execução desde 26: dia 30 → 5/10 × 10, C 0
    expect(avancoReal(tarefas, 30)).toBeCloseTo((10 + 5) / 30);
    expect(avancoReal([{ ...tarefas[1], avanco: 0.4 }], 30)).toBeCloseTo(0.4);
  });
  it("desvios por tarefa", () => {
    const d = desviosDasTarefas(tarefas, 33);
    expect(d.map((x) => [x.tarefa.id, x.dias])).toEqual([
      ["A", 6], // terminou 6 dias depois
      ["L", 4], // em execução além do prazo (29)
      ["C", 3], // não começou na data (30)
    ]);
  });
  it("foto mais recente até o dia", () => {
    const f = (dia: number): FotoObra => ({ id: String(dia), arquivo: "", tipo: "image/jpeg", dia, local: "", descricao: "", etapa: null });
    expect(fotoAte([f(10), f(20), f(30)], 25)!.dia).toBe(20);
    expect(fotoAte([f(10)], 5)).toBeNull();
  });
});

describe("fotos (ADR-14)", () => {
  /** JPEG mínimo com EXIF DateTimeOriginal. */
  function jpegComExif(data: string, le = true): Uint8Array {
    const t: number[] = [];
    const u16 = (n: number) => (le ? t.push(n & 255, n >> 8) : t.push(n >> 8, n & 255));
    const u32 = (n: number) => (le ? t.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24) : t.push(n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255));
    t.push(...(le ? [0x49, 0x49] : [0x4d, 0x4d]));
    u16(42);
    u32(8); // IFD0
    u16(1); // 1 entrada: ponteiro para o IFD EXIF
    u16(0x8769); u16(4); u32(1); u32(26);
    u32(0);
    u16(1); // IFD EXIF em 26
    u16(0x9003); u16(2); u32(20); u32(44);
    u32(0);
    t.push(...[...data].map((c) => c.charCodeAt(0)), 0);
    const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...t];
    return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255, ...app1, 0xff, 0xda, 0, 2]);
  }
  it("lê a data do EXIF (little e big endian)", () => {
    expect(formatarBR(dataExif(jpegComExif("2026:04:01 10:30:00"))!)).toBe("01/04/2026");
    expect(formatarBR(dataExif(jpegComExif("2026:02:02 08:00:00", false))!)).toBe("02/02/2026");
    expect(dataExif(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
  it("lê o fotos-modelo.csv", () => {
    const r = lerFotosCsv(ler("public/modelos/fotos-modelo.csv"));
    expect(r.problemas).toEqual([]);
    expect(r.linhas.size).toBe(4);
    const l = r.linhas.get("obra-2026-04-01.jpg")!;
    expect(formatarBR(l.dia!)).toBe("01/04/2026");
    expect(l).toMatchObject({ local: "Sala de pé-direito duplo", etapa: "ALV-01" });
  });
});

describe(".4dstudio versão 2", () => {
  const base: RegistroProjeto = {
    id: "x", nome: "Casa", criadoEm: "2026-10-07T10:00:00.000Z", atualizadoEm: "2026-10-07T11:00:00.000Z",
    modelo: { tipo: "PARAMETRICO", parametros: { terrenoLargura: 12, terrenoComprimento: 30, area: 120, pavimentos: 1, peDireito: 2.8, cobertura: "plana" } },
    cronograma: { inicio: 20458, tarefas: [{ id: "A", nome: "A", categoria: "alvenaria", ini: 0, fim: 9, realIni: 1, avanco: 0.5 }] },
    arquivoCronograma: "x.csv", excecoes: [], politica: "fantasma", modoAnimacao: "aparecimento",
    video: { formato: "horizontal", fps: 30, segundos: 30, roteiro: null }, demo: false,
    fotos: [{ id: "f1", arquivo: "a.jpg", tipo: "image/jpeg", dia: 20460, local: "Sala", descricao: "Teste", etapa: "A" }],
    planta: { arquivo: "planta.pdf", tipo: "image/png", larguraM: 12, x: 5, z: -9, rotacaoGraus: 90, opacidade: 0.8, visivel: true, proporcao: 0.7 },
  };
  it("ida e volta com fotos, planta e dados reais", () => {
    const foto = Uint8Array.from([1, 2, 3]), planta = Uint8Array.from([4, 5]);
    const zip = exportar4dstudio(base, null, { fotos: new Map([["f1", foto]]), planta });
    const arquivos = Object.keys(unzipSync(zip)).sort();
    expect(arquivos).toEqual(["assets/fotos/f1.jpg", "assets/planta.png", "attachments.json", "mappings.json", "project.json", "schedule.json", "settings.json"]);
    const r = importar4dstudio(zip);
    const { id: _i, ...semId } = base;
    expect(r.registro).toEqual(semId);
    expect([...r.anexos.fotos.get("f1")!]).toEqual([1, 2, 3]);
    expect([...r.anexos.planta!]).toEqual([4, 5]);
  });
  it("lê a versão 1, sem anexos", () => {
    const v1 = zipSync({
      "project.json": strToU8(JSON.stringify({ formato: "4dstudio", versao: 1, projeto: { nome: "Antigo" }, modelo: base.modelo })),
      "schedule.json": strToU8(JSON.stringify({ cronograma: base.cronograma })),
      "mappings.json": strToU8("{}"),
      "settings.json": strToU8("{}"),
    });
    const r = importar4dstudio(v1);
    expect(r.registro.nome).toBe("Antigo");
    expect(r.registro.fotos).toEqual([]);
    expect(r.registro.planta).toBeNull();
  });
});

describe("modelos de arquivo (public/modelos)", () => {
  const conferir = (c: { tarefas: Tarefa[]; inicio: number } | null) => {
    expect(c).not.toBeNull();
    expect(c!.tarefas).toHaveLength(15);
    expect(formatarBR(c!.inicio)).toBe("05/01/2026");
    const alv = c!.tarefas.find((t) => t.id === "ALV-01")!;
    expect(formatarBR(c!.inicio + alv.realFim!)).toBe("10/04/2026");
    expect(c!.tarefas.find((t) => t.id === "LAJ-01")!.avanco).toBeCloseTo(0.6);
  };
  it("cronograma-modelo.csv", () => {
    const r = importarCsv(ler("public/modelos/cronograma-modelo.csv"));
    expect(r.problemas).toEqual([]);
    expect(r.formato).toContain('";"');
    conferir(r.cronograma);
  });
  it("cronograma-modelo.xlsx", async () => {
    const r = await importarXlsx(ler("public/modelos/cronograma-modelo.xlsx"));
    expect(r.problemas).toEqual([]);
    expect(r.formato).toContain("Cronograma");
    conferir(r.cronograma);
  });
  it("cronograma-modelo.json", () => {
    const r = importarJson(ler("public/modelos/cronograma-modelo.json"));
    expect(r.problemas).toEqual([]);
    conferir(r.cronograma);
  });
  it("exemplo.4dstudio", () => {
    const r = importar4dstudio(ler("public/modelos/exemplo.4dstudio"));
    expect(r.registro.modelo.tipo).toBe("IFC");
    expect(r.ifc!.length).toBe(readFileSync("public/samples/demo.ifc").length);
    expect(r.registro.fotos).toHaveLength(4);
    expect(r.anexos.fotos.size).toBe(4);
    expect(r.registro.demo).toBe(true);
    expect(r.registro.fotos!.every((f) => f.descricao.startsWith("Ilustração gerada pela simulação"))).toBe(true);
    conferir(r.registro.cronograma);
  });
  it("casa-exemplo.ifc é a casa da demonstração", () => {
    expect(readFileSync("public/modelos/casa-exemplo.ifc").equals(readFileSync("public/samples/demo.ifc"))).toBe(true);
  });
});
