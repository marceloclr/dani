// Vídeo de imagens (INC-19): as imagens recebidas (de um PDF ou soltas), os títulos, a marcação e a ordem,
// a narração e a configuração do vídeo (formato e duração). Os arquivos ficam aqui; a tela se inscreve.
import { LIMIAR_REPETIDA, distancia } from "../rendering/impressao";
import { legendasDoVideo, type GrupoDaLegenda } from "../rendering/legendas";
import { VOO_PADRAO_S, VOZ_INICIO_S, duracaoPelaNarracao, selecionarPelaDuracao, type ImagemDoVideo, type ModoTransicoes } from "../rendering/imagensNoVideo";

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
  /** Trechos de fala (s, no relógio do áudio), para sincronizar as legendas (INC-21); vazio = a voz inteira. */
  falaS: [number, number][];
}

/** Legendas animadas (INC-21): o texto da narração, sincronizado pela voz. */
export interface ConfigLegendas {
  ativas: boolean;
  texto: string;
  /** Correção à mão (s): −1 a +1. */
  atrasoS: number;
}
export const LEGENDAS_PADRAO: ConfigLegendas = { ativas: true, texto: "", atrasoS: 0 };

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
  /** Voo do drone pela casa 3D (INC-20): só vale com um modelo aberto. */
  voo: ConfigVooImagens;
  /** Transições entre as imagens: variadas (padrão) ou só dissolver. */
  transicoes: ModoTransicoes;
  legendas: ConfigLegendas;
}

export interface ConfigVooImagens {
  onde: "nenhum" | "abertura" | "encerramento" | "ambos";
  duracaoS: number;
  /** "volta": por fora; "porta": a volta e a entrada pela porta. */
  percurso: "volta" | "porta";
}
export const VOO_IMAGENS_PADRAO: ConfigVooImagens = { onde: "abertura", duracaoS: VOO_PADRAO_S, percurso: "volta" };

/** Tempos dos voos para o plano (nenhum sem modelo 3D). */
export function opcoesDoVoo(v: ConfigVooImagens | undefined, temModelo: boolean): { aberturaS?: number; encerramentoS?: number } {
  if (!temModelo || !v || v.onde === "nenhum") return {};
  return { ...(v.onde !== "encerramento" ? { aberturaS: v.duracaoS } : {}), ...(v.onde !== "abertura" ? { encerramentoS: v.duracaoS } : {}) };
}

const INICIAL: EstadoImagens = { imagens: [], tituloDoVideo: "", narracao: null, formato: "vertical", personalizado: { largura: 1080, altura: 1350 }, duracao: 30, pdfs: [], voo: VOO_IMAGENS_PADRAO, transicoes: "variadas", legendas: LEGENDAS_PADRAO };
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
/** Vídeo com a fala (o Reels do celular, o vídeo do WhatsApp): a narração é o som dele. */
const ehVideo = (f: File) => /^video\//.test(f.type) || /\.(mp4|mov|m4v|webm)$/i.test(f.name);

/** Impressões visuais das imagens da lista (calculadas uma vez), para recusar repetidas em novos envios. */
const impressoes = new Map<string, Uint32Array>();
async function impressaoDe(i: Pick<ImagemRecebida, "id" | "blob">): Promise<Uint32Array> {
  let imp = impressoes.get(i.id);
  if (!imp) {
    const { impressaoDaImagem } = await import("./pdfImagens");
    imp = await impressaoDaImagem(i.blob);
    impressoes.set(i.id, imp);
  }
  return imp;
}

function nova(blob: Blob, nome: string, largura: number, altura: number, pagina: number | null, titulo: string, capa = false, origem?: string): ImagemRecebida {
  return { id: novoId(), nome, blob, url: URL.createObjectURL(blob), largura, altura, pagina, titulo, marcada: !capa, ...(capa ? { capa } : {}), ...(origem ? { origem } : {}) };
}

/** PDF de onde veio a imagem (as guardadas antes do campo `origem` vêm pelo nome "<pdf> · p. N"). */
export const origemDa = (i: Pick<ImagemRecebida, "origem" | "nome" | "pagina">): string | null => i.origem ?? (i.pagina !== null ? i.nome.split(" · p. ")[0] : null);

/** Restaura imagens guardadas (sem gravar de novo). */
export function restaurarImagens(e: Omit<EstadoImagens, "imagens" | "voo" | "transicoes" | "legendas"> & { voo?: ConfigVooImagens; transicoes?: ModoTransicoes; legendas?: Partial<ConfigLegendas>; imagens: Omit<ImagemRecebida, "url">[] }): void {
  estado.imagens.forEach((i) => URL.revokeObjectURL(i.url));
  mudar({ ...e, transicoes: e.transicoes ?? "variadas", legendas: { ...LEGENDAS_PADRAO, ...(e.legendas ?? {}) }, voo: { ...VOO_IMAGENS_PADRAO, ...(e.voo ?? {}) }, imagens: e.imagens.map((i) => ({ ...i, url: URL.createObjectURL(i.blob) })) }, false);
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
  // repetidas entre envios (o mesmo PDF duas vezes, a mesma foto de novo): ficam de fora
  const conhecidas = await Promise.all(estado.imagens.map((i) => impressaoDe(i).catch(() => null)));
  const aceitas: ImagemRecebida[] = [];
  let repetidas = 0;
  for (const n of novas) {
    const imp = await impressaoDe(n).catch(() => null);
    if (imp && [...conhecidas, ...aceitas.map((a) => impressoes.get(a.id) ?? null)].some((x) => x && distancia(x, imp) <= LIMIAR_REPETIDA)) {
      repetidas++;
      URL.revokeObjectURL(n.url);
      impressoes.delete(n.id);
      continue;
    }
    aceitas.push(n);
  }
  if (repetidas) avisos.push(repetidas === novas.length ? "Estas imagens já estavam na lista: nada foi acrescentado." : `${repetidas} imagem(ns) já estava(m) na lista e ficou(aram) de fora.`);
  const imagens = [...estado.imagens, ...aceitas];
  // um PDF que só trouxe repetidas não entra na lista de PDFs de novo
  mudar({ imagens, pdfs: pdfs.filter((p) => p !== "" && (estado.pdfs.includes(p) || imagens.some((i) => origemDa(i) === p))), tituloDoVideo: titulo });
  if (aceitas.length) selecionarAutomaticamente();
  return { adicionadas: aceitas.length, avisos };
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

/** Recomeçar: o vídeo de imagens volta ao estado inicial (sem gravar: quem apaga o guardado é a guarda). */
export function zerarImagens(): void {
  estado.imagens.forEach((i) => URL.revokeObjectURL(i.url));
  impressoes.clear();
  mudar(INICIAL, false);
}

export function removerTodas(): void {
  estado.imagens.forEach((i) => URL.revokeObjectURL(i.url));
  mudar({ imagens: [], pdfs: [], tituloDoVideo: "" });
}

export function definirTitulo(id: string, titulo: string): void {
  mudar({ imagens: estado.imagens.map((i) => (i.id === id ? { ...i, titulo } : i)) });
}

/** Índices das duas imagens do par de antes e depois de que `k` faz parte (ou só `k`). */
function doPar(l: Pick<ImagemRecebida, "antes">[], k: number): number[] {
  if (l[k]?.antes && k + 1 < l.length) return [k, k + 1];
  if (k > 0 && l[k - 1]?.antes) return [k - 1, k];
  return [k];
}

/** Marca ou desmarca a imagem; no par de antes e depois, as duas juntas. */
export function alternarMarcada(id: string): void {
  const k = estado.imagens.findIndex((i) => i.id === id);
  if (k < 0) return;
  const marcada = !estado.imagens[k].marcada, par = doPar(estado.imagens, k);
  mudar({ imagens: estado.imagens.map((i, j) => (par.includes(j) ? { ...i, marcada } : i)) });
}

/**
 * Antes e depois (INC-21): faz desta imagem o antes da seguinte (ou desfaz). A seguinte não pode ser o antes
 * de outra, e esta não pode ser o depois da anterior; as duas ficam marcadas.
 */
export function alternarAntes(id: string): void {
  const l = estado.imagens, k = l.findIndex((i) => i.id === id);
  if (k < 0 || k + 1 >= l.length) return;
  if (l[k].antes) return mudar({ imagens: l.map((i, j) => (j === k ? { ...i, antes: false } : i)) });
  mudar({
    imagens: l.map((i, j) => {
      if (j === k) return { ...i, antes: true, marcada: true };
      if (j === k + 1) return { ...i, antes: false, marcada: true };
      if (j === k - 1 && i.antes) return { ...i, antes: false };
      return i;
    }),
  });
}

/** Todas (menos a capa do PDF, que se marca à mão) ou nenhuma. */
export function marcarTodas(marcada: boolean): void {
  mudar({ imagens: estado.imagens.map((i) => ({ ...i, marcada: marcada && !i.capa })) });
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

/**
 * Legendas do vídeo (INC-21), no relógio do vídeo: só com a duração pela narração (a voz começa depois da
 * vinheta), as legendas ligadas e algum texto. Sem isso, nenhuma.
 */
export function legendasDoEstado(e: Pick<EstadoImagens, "duracao" | "narracao" | "legendas"> = estado): GrupoDaLegenda[] {
  if (e.duracao !== "narracao" || !e.narracao || !e.legendas.ativas || !e.legendas.texto.trim()) return [];
  return legendasDoVideo(e.legendas.texto, e.narracao.falaS, e.narracao.duracaoS, VOZ_INICIO_S, e.legendas.atrasoS);
}

/** Marca as imagens que cabem na duração, espalhadas entre os ambientes (a capa do PDF fica de fora). */
export function selecionarAutomaticamente(): void {
  const candidatas = estado.imagens.filter((i) => !i.capa);
  const marcadas = selecionarPelaDuracao(candidatas, duracaoEfetiva());
  const porId = new Map(candidatas.map((i, k) => [i.id, marcadas[k]]));
  const l = estado.imagens.map((i) => ({ ...i, marcada: porId.get(i.id) ?? false }));
  // o par de antes e depois entra inteiro quando uma das duas foi escolhida
  l.forEach((i, k) => {
    if (i.antes && k + 1 < l.length && (i.marcada || l[k + 1].marcada)) i.marcada = l[k + 1].marcada = true;
  });
  mudar({ imagens: l });
}

export function definirConfig(p: Partial<Pick<EstadoImagens, "tituloDoVideo" | "formato" | "personalizado" | "duracao" | "voo" | "transicoes" | "legendas">>): void {
  mudar(p);
}

/** Trechos de fala do áudio (a média dos canais), para as legendas. */
function falaDoAudio(b: AudioBuffer, trechosDeFala: (a: Float32Array, taxa: number) => [number, number][]): [number, number][] {
  const mono = new Float32Array(b.length);
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i++) mono[i] += d[i] / b.numberOfChannels;
  }
  return trechosDeFala(mono, b.sampleRate);
}

/**
 * Recebe a narração (um áudio, ou um vídeo com a fala: usa o som dele): lê a duração e os trechos de fala e
 * passa a duração do vídeo para "pela narração".
 */
export async function adicionarNarracao(f: File): Promise<string[]> {
  if (!ehAudio(f) && !ehVideo(f)) return [`"${f.name}" não é um áudio nem um vídeo (use MP3, M4A, WAV, OGG ou MP4).`];
  const [{ audioDaFala }, { trechosDeFala }] = await Promise.all([import("../rendering/apresentadora"), import("../rendering/legendas")]);
  const b = await audioDaFala(f);
  if (!b || !(b.duration > 0)) return [ehVideo(f) ? `"${f.name}" não tem som que este navegador consiga ler.` : `"${f.name}" não abriu neste navegador (use MP3, M4A, WAV ou OGG).`];
  mudar({ narracao: { nome: f.name, blob: f, duracaoS: b.duration, falaS: falaDoAudio(b, trechosDeFala) }, duracao: "narracao" });
  return [];
}

/** Narração guardada antes das legendas (sem os trechos de fala): calcula-os agora, sem trocar o arquivo. */
export async function completarFalaDaNarracao(): Promise<void> {
  const n = estado.narracao;
  if (!n || n.falaS.length) return;
  const [{ audioDaFala }, { trechosDeFala }] = await Promise.all([import("../rendering/apresentadora"), import("../rendering/legendas")]);
  const b = await audioDaFala(n.blob);
  if (!b || estado.narracao !== n) return;
  const falaS = falaDoAudio(b, trechosDeFala);
  if (falaS.length) mudar({ narracao: { ...n, falaS } });
}

export function removerNarracao(): void {
  mudar({ narracao: null, duracao: estado.duracao === "narracao" ? 30 : estado.duracao });
}
