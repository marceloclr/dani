// Vídeo de imagens (INC-19): as imagens recebidas (de um PDF ou soltas), os títulos, a marcação e a ordem,
// a narração e a configuração do vídeo (formato e duração). Os arquivos ficam aqui; a tela se inscreve.
import { duracaoPelaNarracao, selecionarPelaDuracao, type ImagemDoVideo } from "../rendering/imagensNoVideo";

export type FormatoImagens = "horizontal" | "vertical" | "quadrado" | "retrato" | "personalizado";
export const FORMATOS_IMAGENS: Record<Exclude<FormatoImagens, "personalizado">, { largura: number; altura: number; rotulo: string }> = {
  vertical: { largura: 1080, altura: 1920, rotulo: "Vertical 9:16 (1080 × 1920) · Reels, Stories" },
  horizontal: { largura: 1920, altura: 1080, rotulo: "Horizontal 16:9 (1920 × 1080) · YouTube, apresentação" },
  quadrado: { largura: 1080, altura: 1080, rotulo: "Quadrado 1:1 (1080 × 1080) · feed" },
  retrato: { largura: 1080, altura: 1350, rotulo: "Retrato 4:5 (1080 × 1350) · feed do Instagram" },
};
/** Limites do formato personalizado: lados pares, sem passar da área de 1080p (H.264 nível 4.0). */
export const LADO_MIN = 320, LADO_MAX = 1920, AREA_MAX = 1920 * 1088;

/** Lados válidos para o personalizado: pares, entre os limites, e reduzidos na proporção se passarem da área. */
export function ladosValidos(largura: number, altura: number): { largura: number; altura: number } {
  let w = Math.min(LADO_MAX, Math.max(LADO_MIN, Math.round(largura) || LADO_MIN));
  let h = Math.min(LADO_MAX, Math.max(LADO_MIN, Math.round(altura) || LADO_MIN));
  if (w * h > AREA_MAX) {
    const k = Math.sqrt(AREA_MAX / (w * h));
    w *= k;
    h *= k;
  }
  const par = (x: number) => Math.max(LADO_MIN, Math.floor(x / 2) * 2);
  return { largura: par(w), altura: par(h) };
}

export interface ImagemRecebida extends ImagemDoVideo {
  id: string;
  nome: string;
  blob: Blob;
  /** Endereço para a miniatura na tela. */
  url: string;
  /** Página do PDF de onde veio (null = imagem solta). */
  pagina: number | null;
  /** Imagem da capa de um PDF (costuma ser fundo): fica fora da seleção automática. */
  capa?: boolean;
  /** PDF de onde veio (para remover o PDF inteiro); ausente = imagem solta. */
  origem?: string;
}

export interface NarracaoRecebida {
  nome: string;
  blob: Blob;
  duracaoS: number;
}

export interface EstadoImagens {
  imagens: ImagemRecebida[];
  tituloDoVideo: string;
  narracao: NarracaoRecebida | null;
  formato: FormatoImagens;
  /** Lados do formato personalizado. */
  personalizado: { largura: number; altura: number };
  /** Duração escolhida (s) ou "narracao" (a voz define). */
  duracao: number | "narracao";
  /** PDFs lidos (nome), para o cartão. */
  pdfs: string[];
}

const INICIAL: EstadoImagens = { imagens: [], tituloDoVideo: "", narracao: null, formato: "vertical", personalizado: { largura: 1080, altura: 1350 }, duracao: 30, pdfs: [] };
let estado: EstadoImagens = INICIAL;
const ouvintes = new Set<() => void>();
/** Quem guarda o estado (IndexedDB) é avisado de cada mudança. */
let aoGuardar: ((e: EstadoImagens) => void) | null = null;

export const estadoImagens = () => estado;
export function aoMudarImagens(f: () => void): () => void {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}
export function definirGuarda(f: ((e: EstadoImagens) => void) | null): void {
  aoGuardar = f;
}
function mudar(p: Partial<EstadoImagens>, guardar = true): void {
  estado = { ...estado, ...p };
  ouvintes.forEach((f) => f());
  if (guardar) aoGuardar?.(estado);
}

/** Dimensões do vídeo pelo formato escolhido. */
export function dimensoesDoFormato(e: Pick<EstadoImagens, "formato" | "personalizado"> = estado): { largura: number; altura: number } {
  return e.formato === "personalizado" ? ladosValidos(e.personalizado.largura, e.personalizado.altura) : FORMATOS_IMAGENS[e.formato];
}

const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : `i-${Date.now()}-${Math.random().toString(36).slice(2)}`).slice(0, 13);
const TIPOS_IMAGEM = ["image/jpeg", "image/png", "image/webp"];
const ehPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
const ehImagem = (f: File) => TIPOS_IMAGEM.includes(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name);
const ehAudio = (f: File) => /^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac)$/i.test(f.name);

function nova(blob: Blob, nome: string, largura: number, altura: number, pagina: number | null, titulo: string, capa = false, origem?: string): ImagemRecebida {
  return { id: novoId(), nome, blob, url: URL.createObjectURL(blob), largura, altura, pagina, titulo, marcada: !capa, ...(capa ? { capa } : {}), ...(origem ? { origem } : {}) };
}

/** PDF de onde veio a imagem (as guardadas antes do campo `origem` vêm pelo nome "<pdf> · p. N"). */
export const origemDa = (i: Pick<ImagemRecebida, "origem" | "nome" | "pagina">): string | null => i.origem ?? (i.pagina !== null ? i.nome.split(" · p. ")[0] : null);

/** Restaura imagens guardadas (sem gravar de novo). */
export function restaurarImagens(e: Omit<EstadoImagens, "imagens"> & { imagens: Omit<ImagemRecebida, "url">[] }): void {
  estado.imagens.forEach((i) => URL.revokeObjectURL(i.url));
  mudar({ ...e, imagens: e.imagens.map((i) => ({ ...i, url: URL.createObjectURL(i.blob) })) }, false);
}

/**
 * Recebe PDFs e imagens soltas, na ordem em que vieram. Do PDF saem os renders (sem logos nem repetidas), com o
 * maior texto de cada página como título e o texto da capa como título do vídeo; a imagem da capa entra
 * desmarcada (costuma ser fundo). Depois, marca as que cabem na duração.
 */
export async function adicionarArquivos(arquivos: File[], aoProgredir?: (texto: string) => void): Promise<{ adicionadas: number; avisos: string[] }> {
  const avisos: string[] = [];
  const novas: ImagemRecebida[] = [];
  const pdfs = [...estado.pdfs];
  let titulo = estado.tituloDoVideo;
  for (const f of arquivos) {
    if (ehPdf(f)) {
      try {
        const { extrairImagensDoPdf } = await import("./pdfImagens");
        const r = await extrairImagensDoPdf(new Uint8Array(await f.arrayBuffer()), (p, t) => aoProgredir?.(`${f.name}: página ${p} de ${t}`));
        if (!r.imagens.length) avisos.push(`"${f.name}" não tem imagens grandes (renders) para o vídeo.`);
        if (r.descartadas.repetidas) avisos.push(`"${f.name}": ${r.descartadas.repetidas} imagem(ns) repetida(s) ficaram de fora.`);
        if (!titulo && r.tituloDoDocumento) titulo = r.tituloDoDocumento;
        const capaComTexto = !!r.tituloDoDocumento;
        r.imagens.forEach((im, k) =>
          novas.push(nova(im.blob, `${f.name} · p. ${im.pagina}${r.imagens.filter((x) => x.pagina === im.pagina).length > 1 ? ` (${k + 1})` : ""}`, im.largura, im.altura, im.pagina, im.tituloSugerido, capaComTexto && im.pagina === 1, f.name)),
        );
        if (!pdfs.includes(f.name)) pdfs.push(f.name);
      } catch (e) {
        avisos.push(`"${f.name}" não abriu (${(e as Error)?.message ?? e}).`);
      }
    } else if (ehImagem(f)) {
      try {
        const b = await createImageBitmap(f);
        novas.push(nova(f, f.name, b.width, b.height, null, ""));
        b.close();
      } catch {
        avisos.push(`"${f.name}" não abriu como imagem.`);
      }
    } else avisos.push(`"${f.name}" não é PDF nem imagem (use PDF, JPEG, PNG ou WebP).`);
  }
  const imagens = [...estado.imagens, ...novas];
  mudar({ imagens, pdfs, tituloDoVideo: titulo });
  if (novas.length) selecionarAutomaticamente();
  return { adicionadas: novas.length, avisos };
}

export function removerImagem(id: string): void {
  const im = estado.imagens.find((i) => i.id === id);
  if (im) URL.revokeObjectURL(im.url);
  mudar({ imagens: estado.imagens.filter((i) => i.id !== id) });
}

/** Remove o PDF enviado por engano: as imagens que vieram dele saem do vídeo. */
export function removerPdf(nome: string): void {
  const fora = estado.imagens.filter((i) => origemDa(i) === nome);
  fora.forEach((i) => URL.revokeObjectURL(i.url));
  const pdfs = estado.pdfs.filter((p) => p !== nome);
  mudar({ imagens: estado.imagens.filter((i) => origemDa(i) !== nome), pdfs, tituloDoVideo: pdfs.length || estado.imagens.some((i) => !origemDa(i)) ? estado.tituloDoVideo : "" });
}

/** Remove as imagens enviadas soltas (fora de um PDF). */
export function removerSoltas(): void {
  estado.imagens.filter((i) => !origemDa(i)).forEach((i) => URL.revokeObjectURL(i.url));
  mudar({ imagens: estado.imagens.filter((i) => origemDa(i)) });
}

export function removerTodas(): void {
  estado.imagens.forEach((i) => URL.revokeObjectURL(i.url));
  mudar({ imagens: [], pdfs: [], tituloDoVideo: "" });
}

export function definirTitulo(id: string, titulo: string): void {
  mudar({ imagens: estado.imagens.map((i) => (i.id === id ? { ...i, titulo } : i)) });
}

export function alternarMarcada(id: string): void {
  mudar({ imagens: estado.imagens.map((i) => (i.id === id ? { ...i, marcada: !i.marcada } : i)) });
}

export function marcarTodas(marcada: boolean): void {
  mudar({ imagens: estado.imagens.map((i) => ({ ...i, marcada })) });
}

/** Move a imagem `delta` posições (−1 sobe, +1 desce). */
export function moverImagem(id: string, delta: number): void {
  const l = [...estado.imagens];
  const i = l.findIndex((x) => x.id === id), j = i + delta;
  if (i < 0 || j < 0 || j >= l.length) return;
  [l[i], l[j]] = [l[j], l[i]];
  mudar({ imagens: l });
}

/** Duração em segundos (a da narração, quando escolhida e presente). */
export function duracaoEfetiva(e: Pick<EstadoImagens, "duracao" | "narracao"> = estado): number {
  if (e.duracao === "narracao") return e.narracao ? duracaoPelaNarracao(e.narracao.duracaoS) : 30;
  return e.duracao;
}

/** Marca as imagens que cabem na duração, espalhadas entre os ambientes (a capa do PDF fica de fora). */
export function selecionarAutomaticamente(): void {
  const candidatas = estado.imagens.filter((i) => !i.capa);
  const marcadas = selecionarPelaDuracao(candidatas, duracaoEfetiva());
  const porId = new Map(candidatas.map((i, k) => [i.id, marcadas[k]]));
  mudar({ imagens: estado.imagens.map((i) => ({ ...i, marcada: porId.get(i.id) ?? false })) });
}

export function definirConfig(p: Partial<Pick<EstadoImagens, "tituloDoVideo" | "formato" | "personalizado" | "duracao">>): void {
  mudar(p);
}

/** Recebe a narração (um áudio): lê a duração e passa a duração do vídeo para "pela narração". */
export async function adicionarNarracao(f: File): Promise<string[]> {
  if (!ehAudio(f)) return [`"${f.name}" não é um áudio (use MP3, M4A, WAV ou OGG).`];
  const { audioDaFala } = await import("../rendering/apresentadora");
  const b = await audioDaFala(f);
  if (!b || !(b.duration > 0)) return [`"${f.name}" não abriu neste navegador (use MP3, M4A, WAV ou OGG).`];
  mudar({ narracao: { nome: f.name, blob: f, duracaoS: b.duration }, duracao: "narracao" });
  return [];
}

export function removerNarracao(): void {
  mudar({ narracao: null, duracao: estado.duracao === "narracao" ? 30 : estado.duracao });
}
