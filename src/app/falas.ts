// Falas da engenheira (ADR-30) e sequência do vídeo (ADR-34): casa a aba Falas da planilha com os arquivos
// recebidos (vídeos de fala e áudios de narração), junta as fotos e as trilhas na ordem escolhida e monta a voz
// do vídeo (cada trecho no seu corte, com lacunas em silêncio nas fotos) e o roteiro de cenas que a acompanha.
import type { ArquivoDeFala } from "./anexos";
import type { LinhaFala } from "../planilha/tipos";
import { APRESENTADORA_PADRAO, type ConfigApresentadora } from "../rendering/composicao";
import { roteiroDasFalas, type Cena, type ItemRoteiro, type Passeio } from "../rendering/montagem";
import type { TrechoDeFala } from "../rendering/apresentadora";
import { FOTO_MAX_S, FOTO_MIN_S, FOTO_PADRAO_S, aplicarOrdem, aplicarTrilhas, idFoto, idVoz, inicioDaTrilha, sequenciaPadrao, type ItemSequencia, type TrilhaSequencia } from "./sequencia";

/** Foto que pode entrar no vídeo (ADR-34). */
export interface FotoParaVideo {
  nome: string;
  blob: Blob;
  /** Avanço da obra (0 a 1) no dia da foto; null = sem data. */
  obra: number | null;
  /** Legenda da moldura: data (DD/MM/AAAA), etapa e descrição. */
  data: string;
  etapa: string;
  descricao: string;
}

export interface TrilhaRecebida {
  nome: string;
  blob: Blob;
  duracaoS: number;
}

/** Trilha resolvida para o vídeo: o arquivo, onde entra e o volume. */
export interface TrilhaDoVideo extends TrilhaSequencia {
  blob: Blob;
  duracaoS: number;
  iniS: number;
}

export interface ExtrasDaSequencia {
  fotos?: FotoParaVideo[];
  /** Ordem salva (ids dos itens), do Conferir ou da aba Sequência. */
  ordem?: string[];
  /** Duração de cada foto (s), pelo id. */
  duracoesFoto?: Record<string, number>;
  trilhas?: TrilhaRecebida[];
  trilhasCfg?: TrilhaSequencia[];
  /** Duração da obra quando não há voz e há fotos ou trilhas (s). */
  semVozS?: number;
}

export interface FalasDoVideo {
  /** Falas e narrações da planilha (ou recebidas) com o arquivo, já com o corte resolvido. */
  trechos: (TrechoDeFala & { linha: LinhaFala })[];
  /** Arquivos citados na planilha que ainda não chegaram. */
  faltando: string[];
  /** Avisos que não impedem o vídeo (corte além do fim, recortes diferentes). */
  avisos: string[];
  cenas: Cena[];
  totalS: number;
  /** Configuração da camada da apresentadora (tamanho e recorte do primeiro vídeo de fala); null sem vídeo de fala. */
  cfg: ConfigApresentadora | null;
  /** Aba Falas vazia: as falas são os arquivos recebidos, na ordem de envio. */
  automaticas: boolean;
  /** Vídeos recebidos que a aba Falas não cita (ficam de fora do vídeo). */
  naoCitados: string[];
  /** Itens do vídeo na ordem (vozes, fotos e, sem voz, a obra) (ADR-34). */
  itens: ItemSequencia[];
  /** Linha do tempo da voz e dos quadros da apresentadora: um trecho por item, lacunas nas fotos (ADR-34). */
  linhaDoTempo: TrechoDeFala[];
  /** Fotos na ordem das cenas de foto (o índice `Cena.foto`). */
  fotos: FotoParaVideo[];
  trilhas: TrilhaDoVideo[];
}

const ehAudio = (a: Pick<ArquivoDeFala, "largura">) => !(a.largura > 0);

/** Aba Falas vazia: cada arquivo recebido vira uma fala, na ordem de envio; os áudios são narrações (só a voz). */
export function falasAutomaticas(recebidos: Map<string, { nome: string; largura?: number }>): LinhaFala[] {
  return [...recebidos.values()].map((a, i) => ({ ordem: i + 1, arquivo: a.nome, assunto: "", cena: a.largura === 0 ? "voz" : "sobre-obra", recorte: "ia" }));
}

/** Puro (o Blob só passa adiante): testado no Node com objetos no lugar dos arquivos. */
export function montarFalas(
  linhasDaPlanilha: LinhaFala[],
  recebidos: Map<string, Pick<ArquivoDeFala, "nome" | "blob" | "duracaoS" | "largura" | "altura">>,
  base: Partial<ConfigApresentadora> = {},
  passeio: Passeio = "externo",
  extras: ExtrasDaSequencia = {},
): FalasDoVideo {
  const automaticas = !linhasDaPlanilha.length && recebidos.size > 0;
  // narrações que a aba Falas não cita entram depois das falas (ADR-34); vídeos não citados ficam de fora
  const citadosNaAba = new Set(linhasDaPlanilha.map((l) => l.arquivo.toLowerCase()));
  const narracoesSoltas = automaticas ? [] : [...recebidos.values()].filter((a) => ehAudio(a) && !citadosNaAba.has(a.nome.toLowerCase()));
  const linhas = automaticas
    ? falasAutomaticas(recebidos)
    : [...linhasDaPlanilha, ...narracoesSoltas.map((a, i): LinhaFala => ({ ordem: linhasDaPlanilha.length + i + 1, arquivo: a.nome, assunto: "", cena: "voz", recorte: "ia" }))];
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
    if (fim > a.duracaoS + 0.05) avisos.push(`${l.arquivo}: fim_s (${l.fimS} s) passa do fim do arquivo (${a.duracaoS.toFixed(1)} s); usado o fim do arquivo.`);
    fim = Math.min(fim, a.duracaoS);
    if (!(fim - ini > 0.2)) {
      avisos.push(`${l.arquivo}: o corte deixa menos de 0,2 s; a fala ficou de fora.`);
      continue;
    }
    // áudio (narração): só a voz, sem a pessoa, qualquer que seja a cena pedida
    const audio = ehAudio(a);
    trechos.push({ arquivo: a.blob, inicioS: ini, fimS: fim, linha: audio && l.cena !== "voz" ? { ...l, cena: "voz" } : l, ...(audio ? { semVideo: true } : {}) });
  }
  const comVideo = trechos.filter((t) => !t.semVideo);
  const recortes = new Set(comVideo.map((t) => t.linha.recorte));
  if (recortes.size > 1) avisos.push(`As falas usam recortes diferentes; o vídeo usa o da primeira (${comVideo[0].linha.recorte === "ia" ? "IA" : "fundo verde"}) em todas.`);

  // ------------------------------------------------ sequência (ADR-34): vozes, fotos e, sem voz, a obra
  const vozes: ItemSequencia[] = trechos.map((t) => ({ id: idVoz(t.linha.arquivo), tipo: t.semVideo ? "narracao" : "fala", nome: t.linha.arquivo, duracaoS: t.fimS - t.inicioS }));
  const fotos = extras.fotos ?? [];
  const itensFoto: ItemSequencia[] = fotos.map((f) => {
    const id = idFoto(f.nome);
    const d = extras.duracoesFoto?.[id];
    return { id, tipo: "foto", nome: f.nome, duracaoS: d ? Math.min(FOTO_MAX_S, Math.max(FOTO_MIN_S, d)) : FOTO_PADRAO_S, obra: f.obra };
  });
  const trilhasRecebidas = extras.trilhas ?? [];
  // sem voz, mas com fotos ou trilhas: a obra se monta em silêncio (a trilha cobre) pelo tempo da aba Vídeo
  if (!vozes.length && (itensFoto.length || trilhasRecebidas.length)) vozes.push({ id: "obra", tipo: "obra", nome: "Obra", duracaoS: extras.semVozS ?? 20 });
  const itens = aplicarOrdem(sequenciaPadrao(vozes, itensFoto), extras.ordem);

  const porId = new Map(trechos.map((t) => [idVoz(t.linha.arquivo), t]));
  const fotoPorId = new Map(fotos.map((f) => [idFoto(f.nome), f]));
  const fotosNaOrdem: FotoParaVideo[] = [];
  const roteiro: ItemRoteiro[] = [];
  const linhaDoTempo: TrechoDeFala[] = [];
  for (const it of itens) {
    if (it.tipo === "foto") {
      roteiro.push({ cena: "foto", duracaoS: it.duracaoS, foto: fotosNaOrdem.length, obra: it.obra ?? null });
      fotosNaOrdem.push(fotoPorId.get(it.id)!);
      linhaDoTempo.push({ arquivo: null, inicioS: 0, fimS: it.duracaoS, semVideo: true });
    } else if (it.tipo === "obra") {
      roteiro.push({ cena: "voz", duracaoS: it.duracaoS });
      linhaDoTempo.push({ arquivo: null, inicioS: 0, fimS: it.duracaoS, semVideo: true });
    } else {
      const t = porId.get(it.id)!;
      roteiro.push({ cena: t.linha.cena, duracaoS: t.fimS - t.inicioS });
      linhaDoTempo.push({ arquivo: t.arquivo, inicioS: t.inicioS, fimS: t.fimS, ...(t.semVideo ? { semVideo: true } : {}) });
    }
  }
  const { cenas, totalS } = roteiroDasFalas(roteiro, { passeio });
  const cfgTrilhas = aplicarTrilhas(trilhasRecebidas.map((t) => t.nome), itens, extras.trilhasCfg);
  const trilhas: TrilhaDoVideo[] = cfgTrilhas.map((c) => {
    const r = trilhasRecebidas.find((t) => t.nome === c.nome)!;
    return { ...c, blob: r.blob, duracaoS: r.duracaoS, iniS: inicioDaTrilha(c.entra, itens) };
  });

  const primeiro = comVideo[0] ? recebidos.get(comVideo[0].linha.arquivo.toLowerCase())! : null;
  const cfg: ConfigApresentadora | null = primeiro
    ? {
        ...APRESENTADORA_PADRAO,
        ...base,
        arquivo: comVideo.length === 1 ? primeiro.nome : `${comVideo.length} falas`,
        duracaoS: totalS,
        largura: primeiro.largura,
        altura: primeiro.altura,
        recorte: comVideo[0].linha.recorte,
        acompanharFala: true,
      }
    : null;
  return { trechos, faltando, avisos, cenas, totalS, cfg, automaticas, naoCitados, itens, linhaDoTempo, fotos: fotosNaOrdem, trilhas };
}
