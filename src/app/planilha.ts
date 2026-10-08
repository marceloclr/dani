// Planilha única no app (ADR-29): abrir aplica cada aba ao estado; exportar faz o caminho inverso, para levar
// à planilha o que foi ajustado na área de Gestão.
import { carregarParametrico } from "./carregamento";
import { arquivosDeFala, arquivosDeTrilha } from "./anexos";
import { falasAutomaticas } from "./falas";
import { idFoto, idVoz, VOLUME_PADRAO, type TrilhaSequencia } from "./sequencia";
import { criarProjeto, nomeSeguro } from "./projetos";
import { lerPlanilha } from "../planilha/ler";
import { escreverPlanilha } from "../planilha/escrever";
import { DOCUMENTO_PADRAO, OBRA_VAZIA, type LinhaSequencia, type LinhaTrilha, type ProblemaPlanilha, type ProjetoPlanilha, type VideoPlanilha } from "../planilha/tipos";
import type { Problema } from "../importers/cronograma";
import { useProjeto, type ConfigVideo, type Estado } from "../state/projectStore";
import { CLIENTE } from "./marca";
import { baixar, carimboArquivo } from "../utils/baixar";

const DURACOES: ConfigVideo["segundos"][] = [15, 30, 60, 90, 120];

/** Problema da planilha no formato da aba Avisos: "Aba, linha n: mensagem". */
export const comoProblema = (p: ProblemaPlanilha): Problema => ({
  nivel: p.nivel,
  mensagem: `${p.aba ? `${p.aba}${p.linha ? `, linha ${p.linha}` : ""}: ` : ""}${p.mensagem}`,
  ...(p.linha ? { linha: p.linha } : {}),
});

/** Aba Vídeo → configuração do vídeo (só o que veio preenchido). */
function videoDaPlanilha(v: VideoPlanilha): Partial<ConfigVideo> {
  const out: Partial<ConfigVideo> = {};
  if (v.formato) out.formato = v.formato;
  if (v.fps) out.fps = v.fps;
  if (v.qualidade) out.qualidade = v.qualidade;
  if (v.luz) out.luz = v.luz;
  if (v.assinatura !== undefined) out.assinatura = v.assinatura;
  if (v.passeio) out.passeio = v.passeio;
  // por enquanto a duração usa as opções do painel Vídeo (a mais próxima); vazio = acompanha a fala
  if (typeof v.segundos === "number") out.segundos = DURACOES.reduce((a, b) => (Math.abs(b - v.segundos!) < Math.abs(a - v.segundos!) ? b : a));
  return out;
}

const ehImagem = (arquivo: string) => /\.(jpe?g|png|webp)$/i.test(arquivo);

/** Abas Sequência e Trilhas → ordem, duração das fotos e trilhas do vídeo (ADR-34). */
export function sequenciaDaPlanilha(seq: LinhaSequencia[], trilhas: LinhaTrilha[]): Pick<ConfigVideo, "sequencia" | "duracoesFoto" | "trilhas"> {
  const out: Pick<ConfigVideo, "sequencia" | "duracoesFoto" | "trilhas"> = {};
  if (seq.length) {
    out.sequencia = seq.map((l) => (l.tipo === "foto" ? idFoto(l.arquivo) : idVoz(l.arquivo)));
    const d = Object.fromEntries(seq.filter((l) => l.tipo === "foto" && l.duracaoS).map((l) => [idFoto(l.arquivo), l.duracaoS!]));
    if (Object.keys(d).length) out.duracoesFoto = d;
  }
  if (trilhas.length) {
    const fotosDaSeq = new Set(seq.filter((l) => l.tipo === "foto").map((l) => l.arquivo.toLowerCase()));
    out.trilhas = trilhas.map((t): TrilhaSequencia => ({
      nome: t.arquivo,
      entra: t.entra === "inicio" || t.entra === "final" ? t.entra : fotosDaSeq.has(t.entra.toLowerCase()) || ehImagem(t.entra) ? idFoto(t.entra) : idVoz(t.entra),
      volume: t.volume ?? VOLUME_PADRAO,
    }));
  }
  return out;
}

/** Os vínculos da planilha valem para o IFC citado nela: reaplicados quando ele é carregado. */
export function reaplicarVinculos(): void {
  const s = useProjeto.getState();
  const v = s.planilha?.vinculos;
  if (v?.length && s.cronograma) useProjeto.setState({ excecoes: v });
}

/**
 * Abre a planilha da obra. Devolve false se o arquivo não é a planilha única (para quem chamou tentar ler
 * como cronograma avulso). Erros de uma aba não impedem as outras.
 */
export async function abrirPlanilha(nome: string, bytes: Uint8Array): Promise<boolean> {
  const { projeto, problemas } = await lerPlanilha(bytes);
  if (!projeto) return false;
  aplicarPlanilha(projeto, nome, problemas);
  return true;
}

export function aplicarPlanilha(p: ProjetoPlanilha, nome: string, problemas: ProblemaPlanilha[]): void {
  const st = useProjeto.getState();
  const avisos = [...problemas];
  // modelo: sem IFC na planilha, a casa vem da aba Modelo; com IFC, ele precisa ser carregado (se ainda não foi)
  let novoParametrico = false;
  if (!p.obra.arquivoIfc && p.modelo && (st.tipoModelo !== "PARAMETRICO" || JSON.stringify(st.parametros) !== JSON.stringify(p.modelo))) novoParametrico = carregarParametrico(p.modelo);
  // IFC citado e ainda não carregado: o cartão Projeto IFC do assistente mostra o que falta
  const s = useProjeto.getState();
  const video = { ...videoDaPlanilha(p.video), ...sequenciaDaPlanilha(p.sequencia, p.trilhas) };
  if (p.obra.rumoFrente !== null) video.sol = { ...s.video.sol, norteGraus: p.obra.rumoFrente };
  if (p.cronograma) s.definirCronograma(p.cronograma, nome, "Planilha da obra", avisos.map(comoProblema), false);
  else s.definirProblemasImportacao(avisos.map(comoProblema));
  useProjeto.setState({
    planilha: { arquivo: nome, obra: p.obra, falas: p.falas, fotos: p.fotos, documento: p.documento, vinculos: p.vinculos, modelo: p.modelo },
    ...(p.video.aparencia ? { aparencia3d: p.video.aparencia } : {}),
    ...(p.video.animacao ? { modoAnimacao: p.video.animacao } : {}),
    ...(s.nomeProjeto === null && p.obra.nome ? { nomeProjeto: p.obra.nome } : {}),
  });
  useProjeto.getState().definirVideo(video);
  reaplicarVinculos();
  if (avisos.length) useProjeto.getState().definirPainel("validacao");
  // casa gerada pela planilha: vira um projeto salvo, como ao abrir um IFC
  if (novoParametrico && !useProjeto.getState().projetoId) void criarProjeto(p.obra.nome || "Obra da planilha");
}

/** Sem o IFC citado à mão: a casa sai das medidas da aba Modelo e o projeto é salvo (as falas e fotos já enviadas ficam). */
export async function usarCasaDaPlanilha(): Promise<boolean> {
  const pl = useProjeto.getState().planilha;
  if (!pl?.modelo || !carregarParametrico(pl.modelo)) return false;
  if (!useProjeto.getState().projetoId) await criarProjeto(pl.obra.nome || "Obra da planilha");
  return true;
}

/** Ordem e trilhas do vídeo → abas Sequência e Trilhas (ADR-34); sem ordem salva, a aba fica vazia (ordem padrão). */
function sequenciaDoEstado(s: Estado): Pick<ProjetoPlanilha, "sequencia" | "trilhas"> {
  // os ids guardam o nome em minúsculas: o nome original vem dos arquivos recebidos e da planilha
  const nomes = new Map<string, string>();
  for (const f of arquivosDeFala().values()) nomes.set(idVoz(f.nome), f.nome);
  for (const l of s.planilha?.falas ?? []) if (!nomes.has(idVoz(l.arquivo))) nomes.set(idVoz(l.arquivo), l.arquivo);
  for (const f of s.fotos) nomes.set(idFoto(f.arquivo), f.arquivo);
  const nomeDe = (id: string) => nomes.get(id) ?? id.replace(/^(voz|foto):/, "");
  const sequencia: LinhaSequencia[] = (s.video.sequencia ?? []).filter((id) => id !== "obra").map((id, i) => {
    const foto = id.startsWith("foto:");
    const l: LinhaSequencia = { ordem: i + 1, tipo: foto ? "foto" : arquivosDeFala().get(id.slice(4))?.largura === 0 ? "narracao" : "fala", arquivo: nomeDe(id) };
    const d = s.video.duracoesFoto?.[id];
    if (foto && d) l.duracaoS = d;
    return l;
  });
  const cfg = s.video.trilhas ?? [...arquivosDeTrilha().values()].map((t) => ({ nome: t.nome, entra: "inicio", volume: VOLUME_PADRAO }));
  const trilhas: LinhaTrilha[] = cfg.map((t) => ({ arquivo: t.nome, entra: t.entra === "inicio" || t.entra === "final" ? t.entra : nomeDe(t.entra), volume: t.volume }));
  return { sequencia, trilhas };
}

/** Estado atual → planilha (o caminho de volta). */
export function planilhaDoEstado(s: Estado = useProjeto.getState()): ProjetoPlanilha {
  const pl = s.planilha;
  const obra = pl?.obra ?? { ...OBRA_VAZIA, nome: s.nomeProjeto ?? "", responsavel: CLIENTE.nome };
  return {
    obra: {
      ...obra,
      municipio: s.cronograma?.municipio ?? obra.municipio,
      arquivoIfc: s.tipoModelo === "IFC" ? s.arquivoModelo : s.tipoModelo === "PARAMETRICO" ? null : obra.arquivoIfc,
      rumoFrente: s.video.sol?.norteGraus ?? obra.rumoFrente,
    },
    modelo: s.tipoModelo === "PARAMETRICO" ? s.parametros : pl?.modelo ?? null,
    cronograma: s.cronograma,
    vinculos: s.excecoes,
    // aba Falas vazia: os vídeos recebidos, na ordem de envio, viram as linhas da aba
    falas: pl?.falas.length ? pl.falas : falasAutomaticas(arquivosDeFala()),
    // fotos já enviadas valem mais que as só citadas na planilha
    fotos: s.fotos.length ? s.fotos.map((f) => ({ arquivo: f.arquivo, dia: f.dia, local: f.local, descricao: f.descricao, etapa: f.etapa })) : pl?.fotos ?? [],
    ...sequenciaDoEstado(s),
    video: {
      formato: s.video.formato, segundos: s.video.segundos, fps: s.video.fps, qualidade: s.video.qualidade ?? "normal", aparencia: s.aparencia3d,
      luz: s.video.luz ?? "dia", animacao: s.modoAnimacao, assinatura: s.video.assinatura !== false, passeio: s.video.passeio ?? "externo",
    },
    documento: pl?.documento ?? DOCUMENTO_PADRAO,
  };
}

export async function exportarPlanilha(): Promise<void> {
  const s = useProjeto.getState();
  const bytes = await escreverPlanilha(planilhaDoEstado(s));
  baixar(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${nomeSeguro(s.planilha?.obra.nome || s.nomeProjeto || "obra")}-planilha-${carimboArquivo()}.xlsx`);
}
