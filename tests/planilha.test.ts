import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { interpretarAbas, lerPlanilha, type Abas } from "../src/planilha/ler";
import { escreverPlanilha } from "../src/planilha/escrever";
import { formatarBR } from "../src/fourd/tempo";

const modelo = () => new Uint8Array(readFileSync("public/modelos/obra-dani.xlsx"));

describe("planilha única (ADR-29)", () => {
  it("lê a planilha modelo inteira sem erros", async () => {
    const { projeto, problemas } = await lerPlanilha(modelo());
    expect(problemas.filter((p) => p.nivel === "erro")).toEqual([]);
    const p = projeto!;
    expect(p.obra.nome).toBe("Sobrado de exemplo");
    expect(p.obra.municipio).toBe("fortaleza");
    expect(p.obra.arquivoIfc).toBe("sobrado-exemplo.ifc");
    expect(p.obra.rumoFrente).toBe(70);
    expect(formatarBR(p.obra.dataReferencia!)).toBe("15/08/2026");
    expect(p.modelo).toEqual({ terrenoLargura: 12, terrenoComprimento: 30, area: 120, pavimentos: 1, peDireito: 2.8, cobertura: "duas-aguas" });
    expect(p.cronograma!.tarefas).toHaveLength(18);
    expect(p.cronograma!.municipio).toBe("fortaleza");
    expect(formatarBR(p.cronograma!.inicio)).toBe("02/03/2026");
    const laj = p.cronograma!.tarefas.find((t) => t.id === "LAJ-S")!;
    expect(laj.avanco).toBeCloseTo(0.7);
    expect(laj.realFim).toBeUndefined();
    expect(p.video).toMatchObject({ formato: "vertical", segundos: null, fps: 30, qualidade: "maxima", aparencia: "realista", luz: "dia", animacao: "progressivo", assinatura: true });
    expect(p.documento.titulo).toBe("Relatório de acompanhamento da obra");
    expect(Object.values(p.documento.secoes).every(Boolean)).toBe(true);
    expect(p.falas).toEqual([]);
  });

  it("aponta a aba e a linha de cada problema sem travar a leitura", () => {
    const abas: Abas = {
      Obra: [{ campo: "Nome da obra", valor: "Casa" }, { campo: "Município", valor: "Recife" }, { campo: "Data de referência", valor: "31/02/2026" }],
      Modelo: [{ campo: "Pavimentos", valor: 3 }],
      Cronograma: [
        { id: "A", nome: "Fundação", inicio: "01/03/2026", fim: "10/03/2026", categoria: "fundacao" },
        { id: "B", nome: "Estrutura", inicio: "20/03/2026", fim: "11/03/2026", categoria: "estrutura" },
      ],
      Falas: [
        { ordem: 2, arquivo: "b.mp4", cena: "só a voz", recorte: "IA" },
        { ordem: 1, arquivo: "a.mp4", cena: "terreno", recorte: "fundo verde", inicio_s: 2, fim_s: 1 },
        { ordem: 3, arquivo: "c.mp4", cena: "no telhado" },
      ],
      Fotos: [{ arquivo: "f.jpg", data: "02/03/2026", etapa: "Z" }],
      "Vídeo": [{ campo: "Formato", valor: "panorâmico" }, { campo: "Duração (s)", valor: 300 }],
    };
    const { projeto, problemas } = interpretarAbas(abas);
    const msg = (aba: string) => problemas.filter((p) => p.aba === aba);
    expect(msg("Obra").map((p) => p.nivel)).toEqual(["aviso", "erro"]);
    expect(msg("Obra")[1].linha).toBe(4);
    expect(msg("Modelo").some((p) => p.mensagem.includes("1 ou 2"))).toBe(true);
    expect(msg("Cronograma")[0]).toMatchObject({ nivel: "erro", linha: 3 });
    expect(projeto.cronograma).toBeNull();
    expect(msg("Falas").map((p) => p.linha)).toEqual([3, 4]);
    expect(projeto.falas.map((f) => f.arquivo)).toEqual(["a.mp4", "b.mp4"]); // ordenadas pela coluna ordem
    expect(projeto.falas[1].cena).toBe("voz");
    expect(projeto.falas[0].recorte).toBe("verde");
    expect(msg("Vídeo")).toHaveLength(2);
  });

  it("ida e volta: escrever e ler de novo dá o mesmo projeto", async () => {
    const { projeto } = await lerPlanilha(modelo());
    const p = {
      ...projeto!,
      vinculos: [{ taskId: "ALV-T", guid: "0abc", acao: "construct" as const, modo: "exclude" as const }],
      falas: [
        { ordem: 1, arquivo: "abertura.mp4", assunto: "Apresentação", cena: "terreno" as const, recorte: "ia" as const, inicioS: 0.5, fimS: 12 },
        { ordem: 2, arquivo: "etapas.mp4", assunto: "Etapas", cena: "sobre-obra" as const, recorte: "verde" as const },
      ],
      fotos: [{ arquivo: "obra.jpg", dia: projeto!.cronograma!.inicio + 10, local: "Frente", descricao: "Gabarito", etapa: "PRE-01" }],
      documento: { ...projeto!.documento, observacoes: "Obra no prazo.", secoes: { ...projeto!.documento.secoes, fotos: false } },
    };
    const volta = await lerPlanilha(await escreverPlanilha(p));
    expect(volta.problemas.filter((x) => x.nivel === "erro")).toEqual([]);
    expect(volta.projeto).toEqual(p);
  });

  it("recusa um cronograma avulso como planilha da obra", async () => {
    const r = await lerPlanilha(new Uint8Array(readFileSync("public/modelos/cronograma-modelo.xlsx")));
    expect(r.projeto).toBeNull();
    expect(r.problemas[0].mensagem).toMatch(/abas Obra e Cronograma/);
  });
});

describe(".4dstudio com a planilha", () => {
  it("guarda e devolve os dados da planilha (obra, falas, fotos, documento e vínculos)", async () => {
    const { exportar4dstudio, importar4dstudio } = await import("../src/storage/projeto");
    const { projeto } = await lerPlanilha(modelo());
    const planilha = { arquivo: "obra-dani.xlsx", obra: projeto!.obra, falas: [{ ordem: 1, arquivo: "a.mp4", assunto: "", cena: "terreno" as const, recorte: "ia" as const }], fotos: [], documento: projeto!.documento, vinculos: [] };
    const base = {
      id: "p1", nome: "Sobrado", criadoEm: "2026-10-08T00:00:00Z", atualizadoEm: "2026-10-08T00:00:00Z",
      modelo: { tipo: "PARAMETRICO" as const, parametros: projeto!.modelo! }, cronograma: projeto!.cronograma, arquivoCronograma: "obra-dani.xlsx",
      excecoes: [], politica: "fantasma" as const, modoAnimacao: "progressivo" as const, video: { formato: "vertical" as const, fps: 30 as const, segundos: 30 as const, roteiro: null },
      demo: false, fotos: [], planta: null, aparencia3d: "realista" as const, planilha,
    };
    const r = importar4dstudio(exportar4dstudio(base, null));
    expect(r.registro.planilha).toEqual(planilha);
  });
});
