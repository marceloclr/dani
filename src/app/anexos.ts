// Anexos da obra (ADR-14): fotos, planta e o vídeo da apresentadora (ADR-24). Os arquivos (Blobs) ficam aqui; o estado guarda só os dados.
import { dataExif, lerFotosCsv } from "../importers/fotos";
import { lerData } from "../fourd/tempo";
import { chaveApresentadora, chaveFala, chaveFoto, chavePlanta, chaveTrilha, excluirAnexo, gravarAnexo } from "../storage/IndexedDb";
import { APRESENTADORA_PADRAO } from "../rendering/composicao";
import { useProjeto } from "../state/projectStore";
import { recursosDoPdfjs } from "./pdfImagens";
import type { FotoObra, PlantaSobreposta } from "../types";

const fotos = new Map<string, Blob>();
const urls = new Map<string, string>();
let planta: Blob | null = null;
let apresentadora: Blob | null = null;
const ouvintesApresentadora = new Set<() => void>();
let urlPlanta: string | null = null;
/** Vídeos das falas da planilha (ADR-30): arquivo e o que foi lido dele, pelo nome em minúsculas. */
export interface ArquivoDeFala {
  nome: string;
  blob: Blob;
  duracaoS: number;
  largura: number;
  altura: number;
}
let falas = new Map<string, ArquivoDeFala>();
const ouvintesFalas = new Set<() => void>();
/** Trilhas sonoras (ADR-34): arquivo e duração, pelo nome em minúsculas. */
export interface ArquivoDeTrilha {
  nome: string;
  blob: Blob;
  duracaoS: number;
}
let trilhas = new Map<string, ArquivoDeTrilha>();
const ouvintesTrilhas = new Set<() => void>();
const ouvintesPlanta = new Set<() => void>();

const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : `f-${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 13);
const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];

export const blobDaFoto = (id: string) => fotos.get(id) ?? null;
export const blobDaPlanta = () => planta;
export const blobDaApresentadora = () => apresentadora;
/** Falas recebidas (o mapa é trocado a cada mudança: serve ao useSyncExternalStore). */
export const arquivosDeFala = () => falas;
export function aoMudarFalas(f: () => void): () => void {
  ouvintesFalas.add(f);
  return () => ouvintesFalas.delete(f);
}
function trocarFalas(m: Map<string, ArquivoDeFala>): void {
  falas = m;
  ouvintesFalas.forEach((f) => f());
}
/** Trilhas recebidas (o mapa é trocado a cada mudança: serve ao useSyncExternalStore). */
export const arquivosDeTrilha = () => trilhas;
export function aoMudarTrilhas(f: () => void): () => void {
  ouvintesTrilhas.add(f);
  return () => ouvintesTrilhas.delete(f);
}
function trocarTrilhas(m: Map<string, ArquivoDeTrilha>): void {
  trilhas = m;
  ouvintesTrilhas.forEach((f) => f());
}

/**
 * Devolve trilhas guardadas antes de uma troca de modelo (o IFC aberto sem planilha limpa os anexos; no vídeo de
 * imagens, as trilhas continuam, INC-20) e as grava no projeto aberto.
 */
export async function restaurarTrilhas(m: Map<string, ArquivoDeTrilha>): Promise<void> {
  if (!m.size) return;
  trocarTrilhas(new Map([...trilhas, ...m]));
  const pid = useProjeto.getState().projetoId;
  if (pid) for (const t of m.values()) await gravarAnexo(pid, chaveTrilha(pid, t.nome), t.blob);
}

/** O painel do vídeo se inscreve para saber quando o arquivo da apresentadora chega ou sai. */
export function aoMudarApresentadora(f: () => void): () => void {
  ouvintesApresentadora.add(f);
  return () => ouvintesApresentadora.delete(f);
}

function definirApresentadora(b: Blob | null): void {
  apresentadora = b;
  ouvintesApresentadora.forEach((f) => f());
}

export function urlDaFoto(id: string): string | null {
  const b = fotos.get(id);
  if (!b) return null;
  let u = urls.get(id);
  if (!u) {
    u = URL.createObjectURL(b);
    urls.set(id, u);
  }
  return u;
}

export function urlDaPlantaAtual(): string | null {
  if (!planta) return null;
  urlPlanta ??= URL.createObjectURL(planta);
  return urlPlanta;
}

/** A cena se inscreve para trocar a textura quando a imagem da planta muda. */
export function aoMudarImagemPlanta(f: () => void): () => void {
  ouvintesPlanta.add(f);
  return () => ouvintesPlanta.delete(f);
}

/** Esquece todos os anexos (novo projeto ou ao abrir outro). */
export function limparAnexos(): void {
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls.clear();
  fotos.clear();
  definirImagemPlanta(null);
  definirApresentadora(null);
  trocarFalas(new Map());
  trocarTrilhas(new Map());
}

function definirImagemPlanta(b: Blob | null): void {
  if (urlPlanta) URL.revokeObjectURL(urlPlanta);
  urlPlanta = null;
  planta = b;
  ouvintesPlanta.forEach((f) => f());
}

/** Restaura anexos lidos do IndexedDB ou de um .4dstudio. */
export function restaurarAnexos(fotosDoProjeto: Map<string, Blob>, imagemPlanta: Blob | null, videoApresentadora: Blob | null = null, videosDeFala: Map<string, Blob> = new Map(), audiosDeTrilha: Map<string, Blob> = new Map()): void {
  limparAnexos();
  fotosDoProjeto.forEach((b, id) => fotos.set(id, b));
  definirImagemPlanta(imagemPlanta);
  definirApresentadora(videoApresentadora);
  // duração e tamanho são lidos de novo (rápido: só o cabeçalho do arquivo)
  if (videosDeFala.size) void lerFalas([...videosDeFala].map(([nome, b]) => new File([b], nome, { type: b.type }))).then((r) => trocarFalas(new Map([...falas, ...r.lidas])));
  if (audiosDeTrilha.size) void lerTrilhas([...audiosDeTrilha].map(([nome, b]) => new File([b], nome, { type: b.type }))).then((r) => trocarTrilhas(new Map([...trilhas, ...r.lidas])));
}

/** Grava todos os anexos atuais no projeto (ao criar ou duplicar). */
export async function gravarTodosAnexos(projetoId: string): Promise<void> {
  for (const [id, b] of fotos) await gravarAnexo(projetoId, chaveFoto(projetoId, id), b);
  if (planta) await gravarAnexo(projetoId, chavePlanta(projetoId), planta);
  if (apresentadora) await gravarAnexo(projetoId, chaveApresentadora(projetoId), apresentadora);
  for (const f of falas.values()) await gravarAnexo(projetoId, chaveFala(projetoId, f.nome), f.blob);
  for (const t of trilhas.values()) await gravarAnexo(projetoId, chaveTrilha(projetoId, t.nome), t.blob);
}

const projetoAberto = () => useProjeto.getState().projetoId;

/**
 * Adiciona fotos. Um fotos.csv entre os arquivos preenche data, local, descrição e etapa pelo nome;
 * sem ele, a data vem do EXIF ou, na falta, da data do arquivo.
 */
export async function adicionarFotos(arquivos: File[]): Promise<{ adicionadas: number; avisos: string[] }> {
  const st = useProjeto.getState();
  const avisos: string[] = [];
  const csv = arquivos.find((f) => /\.csv$/i.test(f.name));
  // sem fotos.csv, os dados vêm da aba Fotos da planilha da obra (ADR-29)
  const daPlanilha = st.planilha?.fotos.length ? { linhas: new Map(st.planilha.fotos.map((f) => [f.arquivo.toLowerCase(), f])), problemas: [] as string[] } : null;
  const manifesto = csv ? lerFotosCsv(new Uint8Array(await csv.arrayBuffer())) : daPlanilha;
  if (manifesto) avisos.push(...manifesto.problemas);
  const etapas = new Set(st.cronograma?.tarefas.map((t) => t.id) ?? []);
  const novas: FotoObra[] = [];
  for (const f of arquivos) {
    if (f === csv) continue;
    if (!TIPOS_FOTO.includes(f.type)) {
      avisos.push(`${f.name}: formato não aceito (use JPEG, PNG ou WebP).`);
      continue;
    }
    const bytes = new Uint8Array(await f.arrayBuffer());
    const m = manifesto?.linhas.get(f.name.toLowerCase());
    const doArquivo = lerData(new Date(f.lastModified || Date.now()).toLocaleDateString("sv-SE"))!;
    const dia = m?.dia ?? dataExif(bytes) ?? doArquivo;
    const etapa = m?.etapa && etapas.has(m.etapa) ? m.etapa : null;
    if (m?.etapa && !etapa) avisos.push(`${f.name}: a etapa "${m.etapa}" não existe no cronograma.`);
    const id = novoId();
    fotos.set(id, new Blob([bytes], { type: f.type }));
    novas.push({ id, arquivo: f.name, tipo: f.type, dia, local: m?.local ?? "", descricao: m?.descricao ?? "", etapa });
  }
  if (csv && manifesto) {
    const enviados = new Set(arquivos.map((f) => f.name.toLowerCase()));
    for (const [nome, l] of manifesto.linhas) if (!enviados.has(nome)) avisos.push(`fotos.csv cita "${l.arquivo}", que não foi enviado.`);
  }
  st.adicionarFotos(novas);
  const pid = projetoAberto();
  if (pid) for (const n of novas) await gravarAnexo(pid, chaveFoto(pid, n.id), fotos.get(n.id)!);
  return { adicionadas: novas.length, avisos };
}

export async function removerFoto(id: string): Promise<void> {
  useProjeto.getState().removerFoto(id);
  const u = urls.get(id);
  if (u) URL.revokeObjectURL(u);
  urls.delete(id);
  fotos.delete(id);
  const pid = projetoAberto();
  if (pid) await excluirAnexo(chaveFoto(pid, id));
}

/** Converte a primeira página de um PDF em PNG (pdf.js, worker servido pelo app). */
async function pdfParaPng(dados: Uint8Array): Promise<Blob> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const tarefa = pdfjs.getDocument({ data: dados, ...recursosDoPdfjs() });
  const doc = await tarefa.promise;
  const pagina = await doc.getPage(1);
  const base = pagina.getViewport({ scale: 1 });
  const escala = Math.min(2400 / Math.max(base.width, base.height), 4);
  const vp = pagina.getViewport({ scale: escala });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  await pagina.render({ canvas, viewport: vp }).promise;
  await tarefa.destroy();
  return await new Promise<Blob>((r, rej) => canvas.toBlob((b) => (b ? r(b) : rej(new Error("toBlob falhou"))), "image/png"));
}

async function dimensoes(b: Blob): Promise<{ w: number; h: number }> {
  const img = await createImageBitmap(b);
  const d = { w: img.width, h: img.height };
  img.close();
  return d;
}

/** Carrega a planta (PNG, JPG ou PDF) e a posiciona sob a casa. */
export async function carregarPlanta(f: File, caixaCasa: { x0: number; x1: number; z0: number; z1: number } | null): Promise<void> {
  const st = useProjeto.getState();
  try {
    let imagem: Blob;
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) imagem = await pdfParaPng(new Uint8Array(await f.arrayBuffer()));
    else if (["image/png", "image/jpeg"].includes(f.type)) imagem = f;
    else throw new Error("formato");
    const { w, h } = await dimensoes(imagem);
    const c = caixaCasa ?? { x0: -5, x1: 5, z0: -5, z1: 5 };
    const p: PlantaSobreposta = {
      arquivo: f.name,
      tipo: imagem.type || "image/png",
      larguraM: Math.round((c.x1 - c.x0) * 1.2 * 100) / 100,
      x: (c.x0 + c.x1) / 2,
      z: (c.z0 + c.z1) / 2,
      rotacaoGraus: 0,
      opacidade: 0.85,
      visivel: true,
      proporcao: h / w,
    };
    definirImagemPlanta(imagem);
    st.definirPlanta(p);
    const pid = projetoAberto();
    if (pid) await gravarAnexo(pid, chavePlanta(pid), imagem);
  } catch (e) {
    st.mostrarErro(
      String(e).includes("formato")
        ? { mensagem: "Formato de planta não aceito.", orientacao: "Use PNG, JPG ou PDF." }
        : { mensagem: "Não foi possível abrir a planta.", orientacao: "Confira se o arquivo está íntegro.", detalhes: String((e as Error)?.stack ?? e) },
    );
  }
}

export async function removerPlanta(): Promise<void> {
  useProjeto.getState().definirPlanta(null);
  definirImagemPlanta(null);
  const pid = projetoAberto();
  if (pid) await excluirAnexo(chavePlanta(pid));
}

/** Vídeos aceitos para a apresentadora: os do celular (MP4, MOV) e WebM. */
const TIPOS_VIDEO = /^video\/(mp4|quicktime|webm|x-m4v)$/;

/**
 * Recebe o vídeo da apresentadora (ADR-24): lê duração e tamanho, guarda o arquivo no navegador e a
 * configuração no projeto. Mantém o recorte, a posição e o tamanho já escolhidos.
 */
export async function carregarApresentadora(f: File): Promise<void> {
  const st = useProjeto.getState();
  try {
    if (f.type && !TIPOS_VIDEO.test(f.type) && !/\.(mp4|mov|m4v|webm)$/i.test(f.name)) throw new TypeError("formato");
    const { lerInfoDaFala } = await import("../rendering/apresentadora");
    const info = await lerInfoDaFala(f);
    if (!(info.duracaoS > 0) || !info.largura) throw new Error("vídeo sem duração ou sem imagem");
    definirApresentadora(f);
    const atual = st.video.apresentadora;
    st.definirVideo({ apresentadora: { ...APRESENTADORA_PADRAO, ...(atual ?? {}), arquivo: f.name, ...info } });
    const pid = projetoAberto();
    if (pid) await gravarAnexo(pid, chaveApresentadora(pid), f);
  } catch (e) {
    st.mostrarErro(
      e instanceof TypeError
        ? { mensagem: "Formato de vídeo não aceito.", orientacao: "Use MP4 ou MOV (do celular) ou WebM." }
        : { mensagem: "Não foi possível abrir o vídeo da apresentadora.", orientacao: "Confira se o arquivo toca no computador. Vídeos HEVC (H.265) do iPhone podem não abrir em todos os navegadores: exporte em H.264 (\"Mais compatível\").", detalhes: String((e as Error)?.stack ?? e) },
    );
  }
}

export async function removerApresentadora(): Promise<void> {
  useProjeto.getState().definirVideo({ apresentadora: null });
  definirApresentadora(null);
  const pid = projetoAberto();
  if (pid) await excluirAnexo(chaveApresentadora(pid));
}

/** Áudios de narração e de trilha (ADR-34). */
const ehAudio = (f: File) => /^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i.test(f.name);
const ehVideo = (f: File) => !ehAudio(f) && (!f.type || TIPOS_VIDEO.test(f.type) || /\.(mp4|mov|m4v|webm)$/i.test(f.name));

/** Duração de um áudio, decodificado pelo próprio navegador; null se não abrir. */
async function duracaoDoAudio(f: Blob): Promise<number | null> {
  const { audioDaFala } = await import("../rendering/apresentadora");
  const b = await audioDaFala(f);
  return b && b.duration > 0 ? b.duration : null;
}

async function lerFalas(arquivos: File[]): Promise<{ lidas: Map<string, ArquivoDeFala>; avisos: string[] }> {
  const { lerInfoDaFala } = await import("../rendering/apresentadora");
  const lidas = new Map<string, ArquivoDeFala>();
  const avisos: string[] = [];
  for (const f of arquivos) {
    // áudio = narração (ADR-34): só a voz, sem imagem (largura 0)
    if (ehAudio(f)) {
      const d = await duracaoDoAudio(f);
      if (d) lidas.set(f.name.toLowerCase(), { nome: f.name, blob: f, duracaoS: d, largura: 0, altura: 0 });
      else avisos.push(`"${f.name}" não abriu neste navegador (use MP3, M4A, WAV ou OGG).`);
      continue;
    }
    if (!ehVideo(f)) {
      avisos.push(`"${f.name}" não é um vídeo nem um áudio (use MP4, MOV, WebM, MP3, M4A, WAV ou OGG).`);
      continue;
    }
    try {
      const info = await lerInfoDaFala(f);
      if (!(info.duracaoS > 0) || !info.largura) throw new Error("sem duração ou sem imagem");
      lidas.set(f.name.toLowerCase(), { nome: f.name, blob: f, ...info });
    } catch {
      avisos.push(`"${f.name}" não abriu neste navegador. Vídeos HEVC (H.265) do iPhone: exporte em H.264 ("Mais compatível").`);
    }
  }
  return { lidas, avisos };
}

/** Recebe os vídeos das falas (ADR-30): guarda no navegador, pelo nome, para casar com a aba Falas. */
export async function adicionarFalas(arquivos: File[]): Promise<{ adicionadas: number; avisos: string[] }> {
  const { lidas, avisos } = await lerFalas(arquivos);
  trocarFalas(new Map([...falas, ...lidas]));
  const pid = projetoAberto();
  if (pid) for (const f of lidas.values()) await gravarAnexo(pid, chaveFala(pid, f.nome), f.blob);
  return { adicionadas: lidas.size, avisos };
}

export async function removerFala(nome: string): Promise<void> {
  const m = new Map(falas);
  m.delete(nome.toLowerCase());
  trocarFalas(m);
  const pid = projetoAberto();
  if (pid) await excluirAnexo(chaveFala(pid, nome));
}

async function lerTrilhas(arquivos: File[]): Promise<{ lidas: Map<string, ArquivoDeTrilha>; avisos: string[] }> {
  const lidas = new Map<string, ArquivoDeTrilha>();
  const avisos: string[] = [];
  for (const f of arquivos) {
    if (!ehAudio(f)) {
      avisos.push(`"${f.name}" não é um áudio (use MP3, M4A, WAV ou OGG).`);
      continue;
    }
    const d = await duracaoDoAudio(f);
    if (d) lidas.set(f.name.toLowerCase(), { nome: f.name, blob: f, duracaoS: d });
    else avisos.push(`"${f.name}" não abriu neste navegador (use MP3, M4A, WAV ou OGG).`);
  }
  return { lidas, avisos };
}

/** Recebe as trilhas sonoras (ADR-34): guarda no navegador, pelo nome. */
export async function adicionarTrilhas(arquivos: File[]): Promise<{ adicionadas: number; avisos: string[] }> {
  const { lidas, avisos } = await lerTrilhas(arquivos);
  trocarTrilhas(new Map([...trilhas, ...lidas]));
  const pid = projetoAberto();
  if (pid) for (const t of lidas.values()) await gravarAnexo(pid, chaveTrilha(pid, t.nome), t.blob);
  return { adicionadas: lidas.size, avisos };
}

export async function removerTrilha(nome: string): Promise<void> {
  const m = new Map(trilhas);
  m.delete(nome.toLowerCase());
  trocarTrilhas(m);
  const pid = projetoAberto();
  if (pid) await excluirAnexo(chaveTrilha(pid, nome));
}
