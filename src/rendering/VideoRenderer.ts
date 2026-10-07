// Geração de vídeo (ADR-04): renderizador dedicado na resolução do vídeo, quadro a quadro,
// determinístico, no fluxo principal, cedendo o controle à interface entre quadros.
import * as THREE from "three";
import { AudioBufferSource, BufferSource, BufferTarget, CanvasSource, Conversion, EncodedPacketSink, EncodedVideoPacketSource, Input, MP4, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat, canEncodeAudio, canEncodeVideo } from "mediabunny";
import { Zip, ZipPassThrough } from "fflate";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import type { Cena } from "./Cena";
import type { Pose } from "./cameras";
import type { QuadroCamera } from "./drone";
import { diaDoQuadro, totalDeQuadros } from "./cameras";
import { desenharAssinatura, desenharVinheta, opacidadeVinheta, sobrepor, type Sobreposicao, type TextoMarca } from "./marcaVideo";
import { abrirQuadros, audioDaFala, criarCamadaApresentadora, pedacosDeAudio, type CamadaApresentadora, type QuadrosDaFala } from "./apresentadora";
import { cantoDaAssinatura, type ConfigApresentadora } from "./composicao";

export type Saida = "mp4-whatsapp" | "mp4-alta" | "webm-vp9" | "webm-vp8" | "webm-tempo-real" | "gif" | "png-zip";

export const NOME_SAIDA: Record<Saida, string> = {
  "mp4-whatsapp": "MP4 para WhatsApp e celulares (720p)",
  "mp4-alta": "MP4 alta qualidade (1080p)",
  "webm-vp9": "WebM (VP9)",
  "webm-vp8": "WebM (VP8)",
  "webm-tempo-real": "WebM em tempo real (MediaRecorder)",
  "gif": "GIF animado (leve)",
  "png-zip": "Quadros PNG em ZIP",
};

/** Para que serve cada saída (ADR-16). */
export const DESCRICAO_SAIDA: Record<Saida, string> = {
  "mp4-whatsapp": "H.264 Baseline, 720p, sem áudio: o formato que WhatsApp, Instagram, celulares e TVs aceitam sem conversão. Gerado por um codificador próprio, igual em qualquer navegador.",
  "mp4-alta": "H.264 perfil Main em 1080p, pelo codificador do navegador: para YouTube, apresentações e computador. O WhatsApp pode recusar ou reduzir.",
  "webm-vp9": "Ótima qualidade e arquivo pequeno; abre em navegadores e no VLC. Não é aceito pelo WhatsApp.",
  "webm-vp8": "Como o VP9, mais compatível com programas antigos.",
  "webm-tempo-real": "Gravado em tempo real quando o navegador não tem WebCodecs; a fluidez depende do computador.",
  "gif": "Animação de 480 px a 10 quadros por segundo, sem som: abre em qualquer lugar, inclusive e-mail e apresentações.",
  "png-zip": "Uma imagem por quadro, para montar o vídeo em outro programa (o LEIAME traz o comando do ffmpeg).",
};

/** Resolução e fps efetivos de cada saída (720p para o WhatsApp; 480 px e 10 fps para o GIF). */
export function dimensoesDaSaida(saida: Saida, largura: number, altura: number, fps: number): { largura: number; altura: number; fps: number } {
  const maior = Math.max(largura, altura), menor = Math.min(largura, altura);
  // 720p: lado menor até 720 e maior até 1280 (WhatsApp); GIF: lado maior até 480
  const k = saida === "mp4-whatsapp" ? Math.min(1, 720 / menor, 1280 / maior) : saida === "gif" ? Math.min(1, 480 / maior) : 1;
  const par = (n: number) => Math.max(2, Math.round((n * k) / 2) * 2);
  return { largura: par(largura), altura: par(altura), fps: saida === "gif" ? 10 : fps };
}

export interface Capacidades {
  webcodecs: boolean;
  /** O navegador codifica H.264 nativamente (MP4 em alta). */
  h264Nativo: boolean;
  saidas: Saida[];
}

const temWebCodecs = () => typeof VideoEncoder !== "undefined" && typeof VideoFrame !== "undefined";

function mimeMediaRecorder(): string | null {
  if (typeof MediaRecorder === "undefined" || !("captureStream" in HTMLCanvasElement.prototype)) return null;
  for (const m of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) if (MediaRecorder.isTypeSupported(m)) return m;
  return null;
}

/** Saídas que este navegador consegue produzir de fato com a resolução e o fps escolhidos. */
export async function capacidades(largura: number, altura: number, fps: number): Promise<Capacidades> {
  const saidas: Saida[] = ["mp4-whatsapp"]; // codificador próprio: sempre disponível
  const webcodecs = temWebCodecs();
  let h264Nativo = false;
  if (webcodecs) {
    const testar = async (c: "avc" | "vp9" | "vp8", extra: { fullCodecString?: string } = {}) => {
      try {
        return await canEncodeVideo(c, { width: largura, height: altura, frameRate: fps, quality: QUALITY_HIGH, ...extra });
      } catch {
        return false;
      }
    };
    const [avc, vp9, vp8] = await Promise.all([testar("avc", { fullCodecString: AVC_MAIN }), testar("vp9"), testar("vp8")]);
    h264Nativo = avc;
    if (avc) saidas.push("mp4-alta");
    if (vp9) saidas.push("webm-vp9");
    if (vp8) saidas.push("webm-vp8");
  }
  if (!saidas.some((x) => x.startsWith("webm")) && mimeMediaRecorder()) saidas.push("webm-tempo-real");
  saidas.push("gif", "png-zip");
  return { webcodecs, h264Nativo, saidas };
}

/** H.264 perfil Main, nível 4.0 (até 1080p a 30 fps). */
const AVC_MAIN = "avc1.4d0028";

export interface PedidoVideo {
  saida: Saida;
  largura: number;
  altura: number;
  fps: number;
  segundos: number;
  diasDeObra: number;
  nomeBase: string;
  /** Aplica à cena o estado da obra no instante `dia` (fracionário). */
  aplicarDia(dia: number): void;
  /** Pose da câmera no segundo `t` do vídeo. */
  poseNoTempo(t: number): Pose;
  /** Câmera livre (drone, ADR-23): substitui a pose quando informada. */
  quadroLivre?(t: number): QuadroCamera;
  /** Dia da obra no quadro i de n; sem ele, a obra vai do primeiro ao último dia no vídeo inteiro. */
  diaNoQuadro?(i: number, n: number): number;
  /** Qualidade máxima (ADR-24): renderiza a 1,5× e reduz, com sombra e oclusão mais finas. */
  maxima?: boolean;
  /** Assinatura da marca no canto do vídeo (ADR-24); ausente = sem assinatura. */
  assinatura?: TextoMarca;
  /** Vinheta de abertura e encerramento com a marca (ADR-24); ausente = sem vinheta. */
  vinheta?: TextoMarca;
  /** Apresentadora em primeiro plano, com o áudio da fala (ADR-24). */
  apresentadora?: { arquivo: Blob; cfg: ConfigApresentadora };
  sinal: AbortSignal;
  aoProgredir(p: { quadro: number; total: number; restanteS: number | null }): void;
  /** Recebe o canvas do vídeo, para pré-visualização durante a geração. */
  aoCriarCanvas?(c: HTMLCanvasElement): void;
}

export interface ArquivoGerado {
  blob: Blob;
  nome: string;
  tipo: "video" | "zip" | "gif";
  descricao: string;
  /** O arquivo leva o áudio da fala. */
  comAudio?: boolean;
}

export class Cancelado extends Error {
  constructor() {
    super("Geração cancelada.");
  }
}

const ceder = () => new Promise<void>((r) => setTimeout(r, 0));
const pad = (n: number, w: number) => String(n).padStart(w, "0");

export async function gerarVideo(cena: Cena, pedido: PedidoVideo): Promise<ArquivoGerado> {
  await cena.preparar(); // texturas fotográficas prontas antes do primeiro quadro
  const d = dimensoesDaSaida(pedido.saida, pedido.largura, pedido.altura, pedido.fps);
  const p = { ...pedido, largura: d.largura, altura: d.altura, fps: d.fps };
  const canvas = document.createElement("canvas");
  canvas.width = p.largura;
  canvas.height = p.altura;
  // qualidade máxima: desenha num canvas 1,5× maior e reduz para o do vídeo (supersampling, ADR-24)
  const escala = p.maxima ? 1.5 : 1;
  const tela = escala > 1 ? document.createElement("canvas") : canvas;
  const lr = Math.round(p.largura * escala), ar = Math.round(p.altura * escala);
  tela.width = lr;
  tela.height = ar;
  const reducao = escala > 1 ? canvas.getContext("2d")! : null;
  if (reducao) reducao.imageSmoothingQuality = "high";
  const renderer = new THREE.WebGLRenderer({ canvas: tela, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(lr, ar, false);
  cena.sombraMaxima(!!p.maxima);
  const desenhista = cena.criarDesenhista(renderer, lr, ar, { maxima: p.maxima }); // mesma aparência da viewport (ADR-21)
  const camera = new THREE.PerspectiveCamera(45, p.largura / p.altura, 0.05, 4000);
  const total = totalDeQuadros(p.segundos, p.fps);
  // apresentadora: quadros da fala na ordem do vídeo, recorte e áudio
  let fala: QuadrosDaFala | null = null;
  let camada: CamadaApresentadora | null = null;
  let audio: AudioBuffer | null = null;
  if (p.apresentadora) {
    fala = await abrirQuadros(p.apresentadora.arquivo, Array.from({ length: total }, (_, i) => i / p.fps));
    camada = await criarCamadaApresentadora(lr, ar, p.apresentadora.cfg, fala.largura, fala.altura);
    if (p.saida !== "gif" && p.saida !== "png-zip") audio = await audioDaFala(p.apresentadora.arquivo);
  }
  const canto = cantoDaAssinatura(p.apresentadora ? p.apresentadora.cfg.posicao : null);
  const marca = p.assinatura ? sobrepor(desenharAssinatura(lr, ar, p.assinatura), lr, ar, canto === "esquerda" ? "canto" : "canto-direito") : null;
  const vinheta = p.vinheta ? sobrepor(desenharVinheta(lr, ar, p.vinheta), lr, ar, "cheia") : null;
  /** Sobreposições por cima da cena, na ordem: assinatura e vinheta. */
  const sobre = (s: Pick<Sobreposicao, "cena" | "camera">) => {
    renderer.autoClear = false;
    renderer.render(s.cena, s.camera);
    renderer.autoClear = true;
  };
  p.aoCriarCanvas?.(canvas);

  const inicio = performance.now();
  const desenhar = async (i: number) => {
    p.aplicarDia(p.diaNoQuadro ? p.diaNoQuadro(i, total) : diaDoQuadro(i, total, p.diasDeObra));
    if (p.quadroLivre) {
      cena.posicionarLivre(camera, p.quadroLivre(i / p.fps));
    } else cena.posicionar(camera, p.poseNoTempo(i / p.fps));
    desenhista.desenhar(camera, i);
    if (fala && camada) {
      await camada.atualizar(await fala.proximo(i / p.fps));
      sobre(camada);
    }
    if (marca) sobre(marca);
    if (vinheta) {
      const o = opacidadeVinheta(i / p.fps, total / p.fps);
      vinheta.definirOpacidade(o);
      if (o > 0) sobre(vinheta);
    }
    reducao?.drawImage(tela, 0, 0, p.largura, p.altura);
  };
  const progredir = (i: number) => {
    const feito = i + 1;
    const decorrido = (performance.now() - inicio) / 1000;
    p.aoProgredir({ quadro: feito, total, restanteS: feito > 3 ? (decorrido / feito) * (total - feito) : null });
  };
  const conferir = () => {
    if (p.sinal.aborted) throw new Cancelado();
  };

  cena.silencioso = true;
  try {
    if (p.saida === "png-zip") return await comoZip(p, canvas, total, desenhar, progredir, conferir);
    if (p.saida === "mp4-whatsapp") return await comoMp4Compativel(p, canvas, total, desenhar, progredir, conferir, audio);
    if (p.saida === "gif") return await comoGif(p, canvas, total, desenhar, progredir, conferir);
    if (p.saida === "webm-tempo-real") return await comoMediaRecorder(p, canvas, total, desenhar, progredir, conferir, audio);
    return await comoWebCodecs(p, canvas, total, desenhar, progredir, conferir, audio);
  } finally {
    cena.silencioso = false;
    cena.sombraMaxima(false);
    if (p.quadroLivre) cena.atualizarPortas(null);
    desenhista.dispose();
    marca?.dispose();
    vinheta?.dispose();
    camada?.dispose();
    fala?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

type Desenhar = (i: number) => Promise<void>;
type Progredir = (i: number) => void;

let aacRegistrado = false;
/** AAC: o do navegador ou, sem ele (Chromium no Linux), o codificador em WebAssembly do mediabunny. */
async function garantirAac(): Promise<void> {
  if (aacRegistrado || (await canEncodeAudio("aac").catch(() => false))) return;
  const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
  registerAacEncoder();
  aacRegistrado = true;
}

/** Trilha de áudio da fala intercalada com os quadros: `ate(t)` grava o áudio até o segundo t. */
function trilhaDeAudio(audio: AudioBuffer, segundos: number, codec: "aac" | "opus") {
  const fonte = new AudioBufferSource({ codec, quality: QUALITY_HIGH });
  const pedacos = pedacosDeAudio(audio, segundos);
  let prox = pedacos.next();
  return {
    fonte,
    async ate(t: number) {
      while (!prox.done && prox.value.t <= t) {
        await fonte.add(prox.value.pedaco);
        prox = pedacos.next();
      }
    },
  };
}

async function comoWebCodecs(p: PedidoVideo, canvas: HTMLCanvasElement, total: number, desenhar: Desenhar, progredir: Progredir, conferir: () => void, audio: AudioBuffer | null): Promise<ArquivoGerado> {
  const mp4 = p.saida === "mp4-alta";
  const codec = mp4 ? "avc" : p.saida === "webm-vp9" ? "vp9" : "vp8";
  const output = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(), target: new BufferTarget() });
  const fonte = new CanvasSource(canvas, { codec, quality: QUALITY_HIGH, ...(mp4 ? { fullCodecString: AVC_MAIN } : {}) });
  output.addVideoTrack(fonte, { frameRate: p.fps });
  if (audio && mp4) await garantirAac();
  const trilha = audio ? trilhaDeAudio(audio, total / p.fps, mp4 ? "aac" : "opus") : null;
  if (trilha) output.addAudioTrack(trilha.fonte);
  await output.start();
  try {
    for (let i = 0; i < total; i++) {
      conferir();
      await desenhar(i);
      await fonte.add(i / p.fps, 1 / p.fps); // respeita a contrapressão do codificador
      await trilha?.ate((i + 1) / p.fps);
      progredir(i);
      if (i % 2 === 0) await ceder();
    }
    conferir();
    await trilha?.ate(Infinity);
    await output.finalize();
  } catch (e) {
    if (output.state !== "finalized" && output.state !== "canceled") await output.cancel().catch(() => {});
    throw e;
  }
  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer || buffer.byteLength === 0) throw new Error("O codificador terminou sem produzir dados.");
  const mime = mp4 ? "video/mp4" : "video/webm";
  return { blob: new Blob([buffer], { type: mime }), nome: `${p.nomeBase}.${mp4 ? "mp4" : "webm"}`, tipo: "video", descricao: NOME_SAIDA[p.saida], comAudio: !!trilha };
}

async function comoMediaRecorder(p: PedidoVideo, canvas: HTMLCanvasElement, total: number, desenhar: Desenhar, progredir: Progredir, conferir: () => void, audio: AudioBuffer | null): Promise<ArquivoGerado> {
  const mime = mimeMediaRecorder();
  if (!mime) throw new Error("MediaRecorder indisponível.");
  const stream = canvas.captureStream(0);
  const trilha = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  // áudio em tempo real: a fala toca num destino de gravação, junto com os quadros
  let som: { ctx: AudioContext; fonte: AudioBufferSourceNode } | null = null;
  if (audio && typeof AudioContext !== "undefined") {
    const ctx = new AudioContext();
    const destino = ctx.createMediaStreamDestination();
    const fonte = ctx.createBufferSource();
    fonte.buffer = audio;
    fonte.connect(destino);
    destino.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    await ctx.resume().catch(() => {});
    som = { ctx, fonte };
  }
  const gravador = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
  const partes: Blob[] = [];
  gravador.ondataavailable = (e) => e.data.size && partes.push(e.data);
  const parado = new Promise<void>((r) => (gravador.onstop = () => r()));
  gravador.start(1000);
  som?.fonte.start(0, 0, total / p.fps);
  const intervalo = 1000 / p.fps;
  const t0 = performance.now();
  try {
    for (let i = 0; i < total; i++) {
      conferir();
      await desenhar(i);
      trilha.requestFrame();
      progredir(i);
      // tempo real: o MediaRecorder carimba os quadros pelo relógio
      const espera = t0 + (i + 1) * intervalo - performance.now();
      await new Promise((r) => setTimeout(r, Math.max(espera, 0)));
    }
  } finally {
    gravador.stop();
    await parado;
    stream.getTracks().forEach((t) => t.stop());
    if (som) {
      try {
        som.fonte.stop();
      } catch {
        /* já terminou */
      }
      await som.ctx.close().catch(() => {});
    }
  }
  conferir();
  const blob = new Blob(partes, { type: "video/webm" });
  if (blob.size === 0) throw new Error("O MediaRecorder terminou sem produzir dados.");
  return { blob, nome: `${p.nomeBase}.webm`, tipo: "video", descricao: NOME_SAIDA["webm-tempo-real"], comAudio: !!som };
}

async function comoZip(p: PedidoVideo, canvas: HTMLCanvasElement, total: number, desenhar: Desenhar, progredir: Progredir, conferir: () => void): Promise<ArquivoGerado> {
  const partes: Uint8Array[] = [];
  let erro: Error | null = null;
  let concluir: () => void = () => {};
  const fim = new Promise<void>((resolve) => (concluir = resolve));
  const zip = new Zip((e, dado, final) => {
    if (e) erro = e;
    else partes.push(dado);
    if (final || e) concluir();
  });
  const largura = String(total).length;
  try {
    for (let i = 0; i < total; i++) {
      conferir();
      await desenhar(i);
      const png = await new Promise<Blob>((r, rej) => canvas.toBlob((b) => (b ? r(b) : rej(new Error("toBlob falhou"))), "image/png"));
      const arq = new ZipPassThrough(`quadros/quadro-${pad(i + 1, largura)}.png`); // PNG já é comprimido
      zip.add(arq);
      arq.push(new Uint8Array(await png.arrayBuffer()), true);
      progredir(i);
    }
    const leiame = new ZipPassThrough("LEIAME.txt");
    zip.add(leiame);
    leiame.push(
      new TextEncoder().encode(
        `Construction 4D Studio: ${total} quadros PNG, ${p.largura} × ${p.altura}, ${p.fps} fps, ${p.segundos} s.\n` +
          `Para montar o vídeo com o ffmpeg:\nffmpeg -framerate ${p.fps} -i quadros/quadro-%0${largura}d.png -c:v libx264 -pix_fmt yuv420p ${p.nomeBase}.mp4\n`,
      ),
      true,
    );
    zip.end();
  } catch (e) {
    zip.terminate();
    throw e;
  }
  await fim;
  if (erro) throw erro;
  conferir();
  return { blob: new Blob(partes as BlobPart[], { type: "application/zip" }), nome: `${p.nomeBase}-quadros.zip`, tipo: "zip", descricao: NOME_SAIDA["png-zip"] };
}

/** Lê os pixels do quadro (RGBA, de cima para baixo) por um canvas 2D. */
function lerPixels(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Uint8ClampedArray {
  ctx.drawImage(canvas, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
}

let codificadorCarregado: Promise<void> | null = null;
/** Carrega o codificador H.264 (script clássico em public/vendor, sem CDN). */
function carregarCodificadorH264(): Promise<void> {
  codificadorCarregado ??= new Promise<void>((ok, falha) => {
    if (window.HME) return ok();
    const s = document.createElement("script");
    s.src = new URL("vendor/h264-mp4-encoder.web.js", document.baseURI).href;
    s.onload = () => (window.HME ? ok() : falha(new Error("codificador H.264 não definiu HME")));
    s.onerror = () => falha(new Error("não foi possível carregar o codificador H.264"));
    document.head.appendChild(s);
  }).catch((e) => {
    codificadorCarregado = null;
    throw e;
  });
  return codificadorCarregado;
}

/** MP4 H.264 Baseline em WebAssembly (minih264 + libmp4v2): aceito por WhatsApp e celulares (ADR-16). */
async function comoMp4Compativel(p: PedidoVideo, canvas: HTMLCanvasElement, total: number, desenhar: Desenhar, progredir: Progredir, conferir: () => void, audio: AudioBuffer | null): Promise<ArquivoGerado> {
  await carregarCodificadorH264();
  const enc = await window.HME!.createH264MP4Encoder();
  const leitura = document.createElement("canvas");
  leitura.width = p.largura;
  leitura.height = p.altura;
  const ctx = leitura.getContext("2d", { willReadFrequently: true })!;
  let finalizado = false;
  try {
    enc.width = p.largura;
    enc.height = p.altura;
    enc.frameRate = p.fps;
    enc.kbps = Math.round(((p.largura * p.altura) / (1280 * 720)) * 4000); // ~4 Mbit/s em 720p
    enc.speed = 4;
    enc.groupOfPictures = p.fps * 2;
    enc.initialize();
    for (let i = 0; i < total; i++) {
      conferir();
      await desenhar(i);
      enc.addFrameRgba(lerPixels(canvas, ctx));
      progredir(i);
      if (i % 2 === 0) await ceder();
    }
    conferir();
    enc.finalize();
    finalizado = true;
    const dados = enc.FS.readFile(enc.outputFilename);
    enc.FS.unlink(enc.outputFilename);
    if (!dados.length) throw new Error("O codificador H.264 terminou sem produzir dados.");
    const comSom = audio ? await remontarComAudio(dados, audio, total / p.fps, p.fps) : null;
    const final = comSom ?? (await indiceNoInicio(dados));
    return { blob: new Blob([final as BlobPart], { type: "video/mp4" }), nome: `${p.nomeBase}-whatsapp.mp4`, tipo: "video", descricao: NOME_SAIDA["mp4-whatsapp"], comAudio: !!comSom };
  } finally {
    // descartar sem finalizar aborta o WebAssembly: no cancelamento, finaliza antes (e ignora falhas aqui,
    // para não trocar o "cancelado" por outro erro)
    try {
      if (!finalizado) {
        enc.finalize();
        enc.FS.unlink(enc.outputFilename);
      }
    } catch {
      /* nada a fazer */
    }
    try {
      enc.delete();
    } catch {
      /* nada a fazer */
    }
  }
}

/**
 * Reescreve o MP4 com o índice (moov) antes dos dados (fast start), sem recodificar:
 * celulares e mensageiros começam a tocar sem ler o arquivo inteiro. Se não der, devolve o original.
 */
async function indiceNoInicio(mp4: Uint8Array): Promise<Uint8Array> {
  try {
    const input = new Input({ formats: [MP4], source: new BufferSource(mp4) });
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
    const conversao = await Conversion.init({ input, output });
    if (!conversao.isValid) return mp4;
    await conversao.execute();
    const b = (output.target as BufferTarget).buffer;
    return b && b.byteLength ? new Uint8Array(b) : mp4;
  } catch {
    return mp4;
  }
}

/**
 * Acrescenta a fala (AAC) ao MP4 do codificador próprio, que sai sem som: os pacotes H.264 são copiados
 * sem recodificar, o áudio é intercalado e o índice vai para o início (fast start). Sem WebCodecs
 * para o áudio, devolve null (o vídeo sai sem som e a tela avisa).
 */
async function remontarComAudio(mp4: Uint8Array, audio: AudioBuffer, segundos: number, fps: number): Promise<Uint8Array | null> {
  if (typeof AudioEncoder === "undefined") return null;
  await garantirAac();
  const input = new Input({ formats: [MP4], source: new BufferSource(mp4) });
  try {
    const vt = await input.getPrimaryVideoTrack();
    if (!vt) return null;
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
    const video = new EncodedVideoPacketSource("avc");
    output.addVideoTrack(video, { frameRate: fps });
    const trilha = trilhaDeAudio(audio, segundos, "aac");
    output.addAudioTrack(trilha.fonte);
    await output.start();
    const config = await vt.getDecoderConfig();
    let primeiro = true;
    for await (const pacote of new EncodedPacketSink(vt).packets()) {
      await video.add(pacote, primeiro && config ? { decoderConfig: config } : undefined);
      primeiro = false;
      await trilha.ate(pacote.timestamp + 1 / fps);
    }
    await trilha.ate(Infinity);
    await output.finalize();
    const b = (output.target as BufferTarget).buffer;
    return b && b.byteLength ? new Uint8Array(b) : null;
  } finally {
    input.dispose();
  }
}

/** GIF animado com paleta por quadro (gifenc). */
async function comoGif(p: PedidoVideo, canvas: HTMLCanvasElement, total: number, desenhar: Desenhar, progredir: Progredir, conferir: () => void): Promise<ArquivoGerado> {
  const gif = GIFEncoder();
  const leitura = document.createElement("canvas");
  leitura.width = p.largura;
  leitura.height = p.altura;
  const ctx = leitura.getContext("2d", { willReadFrequently: true })!;
  const atraso = Math.round(1000 / p.fps);
  for (let i = 0; i < total; i++) {
    conferir();
    desenhar(i);
    const rgba = lerPixels(canvas, ctx);
    const paleta = quantize(rgba, 256);
    gif.writeFrame(applyPalette(rgba, paleta), p.largura, p.altura, { palette: paleta, delay: atraso, ...(i === 0 ? { repeat: 0 } : {}) });
    progredir(i);
    if (i % 2 === 0) await ceder();
  }
  conferir();
  gif.finish();
  return { blob: new Blob([gif.bytes() as BlobPart], { type: "image/gif" }), nome: `${p.nomeBase}.gif`, tipo: "gif", descricao: NOME_SAIDA.gif };
}

/** Estimativa grosseira do ZIP de PNGs: ~0,35 byte por pixel por quadro nesta cena. */
export const estimarZipMB = (largura: number, altura: number, quadros: number) => (largura * altura * 0.35 * quadros) / 1_048_576;

/** Dispositivo provavelmente fraco para gerar vídeo (§34). */
export function dispositivoLimitado(): string | null {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const motivos: string[] = [];
  if (nav.hardwareConcurrency && nav.hardwareConcurrency <= 2) motivos.push(`${nav.hardwareConcurrency} núcleos de processador`);
  if (nav.deviceMemory && nav.deviceMemory <= 2) motivos.push(`${nav.deviceMemory} GB de memória`);
  if (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) motivos.push("celular ou tablet");
  return motivos.length ? motivos.join(", ") : null;
}
