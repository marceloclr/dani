// Falas da engenheira (ADR-30): casa a aba Falas da planilha com os vídeos recebidos e monta a voz do vídeo
// (as falas em sequência, cada uma no seu corte) e o roteiro de cenas que acompanha cada fala.
import type { ArquivoDeFala } from "./anexos";
import type { LinhaFala } from "../planilha/tipos";
import { APRESENTADORA_PADRAO, type ConfigApresentadora } from "../rendering/composicao";
import { roteiroDasFalas, type Cena } from "../rendering/montagem";
import type { TrechoDeFala } from "../rendering/apresentadora";

export interface FalasDoVideo {
  /** Falas da planilha com o arquivo recebido, na ordem, já com o corte resolvido. */
  trechos: (TrechoDeFala & { linha: LinhaFala })[];
  /** Arquivos citados na planilha que ainda não chegaram. */
  faltando: string[];
  /** Avisos que não impedem o vídeo (corte além do fim, recortes diferentes). */
  avisos: string[];
  cenas: Cena[];
  totalS: number;
  /** Configuração da camada da apresentadora para a sequência (tamanho e recorte da primeira fala). */
  cfg: ConfigApresentadora | null;
  /** Aba Falas vazia: as falas são os vídeos recebidos, na ordem de envio. */
  automaticas: boolean;
  /** Vídeos recebidos que a aba Falas não cita (ficam de fora do vídeo). */
  naoCitados: string[];
}

/** Aba Falas vazia: cada vídeo recebido vira uma fala, na ordem de envio, sobre a obra e com recorte por IA. */
export function falasAutomaticas(recebidos: Map<string, { nome: string }>): LinhaFala[] {
  return [...recebidos.values()].map((a, i) => ({ ordem: i + 1, arquivo: a.nome, assunto: "", cena: "sobre-obra", recorte: "ia" }));
}

/** Puro (o Blob só passa adiante): testado no Node com objetos no lugar dos arquivos. */
export function montarFalas(linhasDaPlanilha: LinhaFala[], recebidos: Map<string, Pick<ArquivoDeFala, "nome" | "blob" | "duracaoS" | "largura" | "altura">>, base: Partial<ConfigApresentadora> = {}, passeioInterno = true): FalasDoVideo {
  const automaticas = !linhasDaPlanilha.length && recebidos.size > 0;
  const linhas = automaticas ? falasAutomaticas(recebidos) : linhasDaPlanilha;
  const citados = new Set(linhas.map((l) => l.arquivo.toLowerCase()));
  const naoCitados = [...recebidos.values()].filter((a) => !citados.has(a.nome.toLowerCase())).map((a) => a.nome);
  const trechos: FalasDoVideo["trechos"] = [];
  const faltando: string[] = [];
  const avisos: string[] = [];
  for (const l of linhas) {
    const a = recebidos.get(l.arquivo.toLowerCase());
    if (!a) {
      faltando.push(l.arquivo);
      continue;
    }
    const ini = Math.min(Math.max(l.inicioS ?? 0, 0), a.duracaoS);
    let fim = l.fimS ?? a.duracaoS;
    if (fim > a.duracaoS + 0.05) avisos.push(`${l.arquivo}: fim_s (${l.fimS} s) passa do fim do vídeo (${a.duracaoS.toFixed(1)} s); usado o fim do vídeo.`);
    fim = Math.min(fim, a.duracaoS);
    if (!(fim - ini > 0.2)) {
      avisos.push(`${l.arquivo}: o corte deixa menos de 0,2 s; a fala ficou de fora.`);
      continue;
    }
    trechos.push({ arquivo: a.blob, inicioS: ini, fimS: fim, linha: l });
  }
  const recortes = new Set(trechos.map((t) => t.linha.recorte));
  if (recortes.size > 1) avisos.push(`As falas usam recortes diferentes; o vídeo usa o da primeira (${trechos[0].linha.recorte === "ia" ? "IA" : "fundo verde"}) em todas.`);
  const { cenas, totalS } = roteiroDasFalas(trechos.map((t) => ({ cena: t.linha.cena, duracaoS: t.fimS - t.inicioS })), { passeioInterno });
  const primeiro = trechos[0] ? recebidos.get(trechos[0].linha.arquivo.toLowerCase())! : null;
  const cfg: ConfigApresentadora | null = primeiro
    ? {
        ...APRESENTADORA_PADRAO,
        ...base,
        arquivo: trechos.length === 1 ? primeiro.nome : `${trechos.length} falas`,
        duracaoS: totalS,
        largura: primeiro.largura,
        altura: primeiro.altura,
        recorte: trechos[0].linha.recorte,
        acompanharFala: true,
      }
    : null;
  return { trechos, faltando, avisos, cenas, totalS, cfg, automaticas, naoCitados };
}
