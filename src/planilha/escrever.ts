// Escrita da planilha única (ADR-29): leva de volta para o .xlsx o que foi ajustado na área de Gestão.
// Mesmas abas e cabeçalhos que tools/gerar_planilha_modelo.py; datas como data do Excel (DD/MM/AAAA).
// O SheetJS livre não grava listas suspensas: elas só existem na planilha modelo baixada do app.
import { MUNICIPIOS, OUTRO_MUNICIPIO, NOME_OUTRO } from "../fourd/feriados";
import { NOME_LUZ } from "../rendering/iluminacao";
import {
  ABAS, CAMPOS_DOCUMENTO, CAMPOS_MODELO, CAMPOS_OBRA, CAMPOS_VIDEO, ROTULO_ACAO, ROTULO_ANIMACAO, ROTULO_APARENCIA, ROTULO_CENA, ROTULO_COBERTURA,
  ROTULO_FORMATO, ROTULO_RECORTE, SECOES_DOCUMENTO, type ProjetoPlanilha,
} from "./tipos";

type Celula = string | number | { data: number } | null;
const SERIAL_1970 = 25569;
const data = (dia: number | null | undefined): Celula => (dia === null || dia === undefined ? null : { data: dia });
const pct = (f: number | undefined) => (f === undefined ? null : `${Math.round(f * 100)}%`);
const simNao = (b: boolean | undefined) => (b === undefined ? null : b ? "sim" : "não");
const nomeMunicipio = (id: string | null) => (!id ? null : id === OUTRO_MUNICIPIO ? NOME_OUTRO.split(" (")[0] : MUNICIPIOS.find((m) => m.id === id)?.nome ?? null);

/** Linhas (com cabeçalho) de cada aba, na ordem da planilha. Puro: os testes conferem a ida e a volta. */
export function linhasDaPlanilha(p: ProjetoPlanilha): [string, Celula[][]][] {
  const o = p.obra;
  const ficha = (campos: [string, Celula][]): Celula[][] => [["campo", "valor"], ...campos.map(([c, v]) => [c, v])];
  const c = p.cronograma;
  const abs = (d: number | undefined) => (c && d !== undefined ? c.inicio + d : undefined);
  return [
    ["LEIA-ME", [["DANIELLA POMPEU · ENGENHARIA QUE TRANSFORMA"], ["Planilha exportada pelo app. Para ter as listas suspensas, use a planilha modelo e copie estes dados."], ["Manual: https://marceloclr.github.io/dani/manual.html"]]],
    [ABAS.obra, ficha([
      [CAMPOS_OBRA.nome, o.nome], [CAMPOS_OBRA.proprietario, o.proprietario], [CAMPOS_OBRA.endereco, o.endereco],
      [CAMPOS_OBRA.municipio, nomeMunicipio(o.municipio)], [CAMPOS_OBRA.responsavel, o.responsavel], [CAMPOS_OBRA.crea, o.crea],
      [CAMPOS_OBRA.dataReferencia, data(o.dataReferencia)], [CAMPOS_OBRA.arquivoIfc, o.arquivoIfc], [CAMPOS_OBRA.rumoFrente, o.rumoFrente], [CAMPOS_OBRA.descricao, o.descricao],
    ])],
    [ABAS.modelo, ficha(p.modelo ? [
      [CAMPOS_MODELO.terrenoLargura, p.modelo.terrenoLargura], [CAMPOS_MODELO.terrenoComprimento, p.modelo.terrenoComprimento], [CAMPOS_MODELO.area, p.modelo.area],
      [CAMPOS_MODELO.pavimentos, p.modelo.pavimentos], [CAMPOS_MODELO.peDireito, p.modelo.peDireito], [CAMPOS_MODELO.cobertura, ROTULO_COBERTURA[p.modelo.cobertura]],
    ] : Object.values(CAMPOS_MODELO).map((k) => [k, null] as [string, Celula]))],
    [ABAS.cronograma, [
      ["id", "nome", "inicio", "fim", "categoria", "pavimento", "inicio_real", "fim_real", "avanco"],
      ...(c?.tarefas ?? []).map((t) => [t.id, t.nome, data(abs(t.ini)), data(abs(t.fim)), t.categoria, t.pavimento ?? null, data(abs(t.realIni)), data(abs(t.realFim)), pct(t.avanco)]),
    ]],
    [ABAS.vinculos, [["guid", "tarefa", "acao", "modo"], ...p.vinculos.map((v) => [v.guid, v.taskId, ROTULO_ACAO[v.acao], v.modo === "include" ? "incluir" : "excluir"])]],
    [ABAS.falas, [
      ["ordem", "arquivo", "assunto", "cena", "recorte", "inicio_s", "fim_s"],
      ...p.falas.map((f) => [f.ordem, f.arquivo, f.assunto, ROTULO_CENA[f.cena], ROTULO_RECORTE[f.recorte], f.inicioS ?? null, f.fimS ?? null]),
    ]],
    [ABAS.fotos, [["arquivo", "data", "local", "descricao", "etapa"], ...p.fotos.map((f) => [f.arquivo, data(f.dia), f.local, f.descricao, f.etapa])]],
    [ABAS.video, ficha([
      [CAMPOS_VIDEO.formato, p.video.formato ? ROTULO_FORMATO[p.video.formato] : null], [CAMPOS_VIDEO.segundos, p.video.segundos ?? null],
      [CAMPOS_VIDEO.fps, p.video.fps ? String(p.video.fps) : null], [CAMPOS_VIDEO.qualidade, p.video.qualidade ? (p.video.qualidade === "maxima" ? "máxima" : "normal") : null],
      [CAMPOS_VIDEO.aparencia, p.video.aparencia ? ROTULO_APARENCIA[p.video.aparencia] : null], [CAMPOS_VIDEO.luz, p.video.luz ? NOME_LUZ[p.video.luz] : null],
      [CAMPOS_VIDEO.animacao, p.video.animacao ? ROTULO_ANIMACAO[p.video.animacao] : null], [CAMPOS_VIDEO.assinatura, simNao(p.video.assinatura)],
    ])],
    [ABAS.documento, ficha([
      [CAMPOS_DOCUMENTO.titulo, p.documento.titulo], [CAMPOS_DOCUMENTO.destinatario, p.documento.destinatario], [CAMPOS_DOCUMENTO.observacoes, p.documento.observacoes],
      ...SECOES_DOCUMENTO.map((s) => [CAMPOS_DOCUMENTO[s], simNao(p.documento.secoes[s])] as [string, Celula]),
    ])],
  ];
}

/** Gera o .xlsx (bytes). */
export async function escreverPlanilha(p: ProjetoPlanilha): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const [nome, linhas] of linhasDaPlanilha(p)) {
    const ws: import("xlsx").WorkSheet = {};
    let maxC = 0;
    linhas.forEach((linha, r) => {
      linha.forEach((v, cI) => {
        if (v === null || v === "") return;
        const ref = XLSX.utils.encode_cell({ r, c: cI });
        ws[ref] = typeof v === "object" ? { t: "n", v: v.data + SERIAL_1970, z: "dd/mm/yyyy" } : typeof v === "number" ? { t: "n", v } : { t: "s", v };
        maxC = Math.max(maxC, cI);
      });
      maxC = Math.max(maxC, linha.length - 1);
    });
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(linhas.length - 1, 0), c: maxC } });
    ws["!cols"] = Array.from({ length: maxC + 1 }, (_, i) => ({ wch: i === 0 ? 30 : i === 1 ? 40 : 14 }));
    XLSX.utils.book_append_sheet(wb, ws, nome);
  }
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}
