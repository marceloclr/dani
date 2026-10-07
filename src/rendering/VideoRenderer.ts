// Geração de vídeo (ADR-04): renderizador dedicado na resolução do vídeo, quadro a quadro,
// determinístico, no fluxo principal, cedendo o controle à interface entre quadros.
import * as THREE from "three";
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat, canEncodeVideo } from "mediabunny";
import { Zip, ZipPassThrough } from "fflate";
import type { Cena } from "./Cena";
import type { Pose } from "./cameras";
import { diaDoQuadro, totalDeQuadros } from "./cameras";

export type Saida = "mp4-avc" | "webm-vp9" | "webm-vp8" | "webm-tempo-real" | "png-zip";

export const NOME_SAIDA: Record<Saida, string> = {
  "mp4-avc": "MP4 (H.264)",
  "webm-vp9": "WebM (VP9)",
  "webm-vp8": "WebM (VP8)",
  "webm-tempo-real": "WebM em tempo real (MediaRecorder)",
  "png-zip": "Quadros PNG em ZIP",
};

export interface Capacidades {
  webcodecs: boolean;
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
  const saidas: Saida[] = [];
  const webcodecs = temWebCodecs();
  if (webcodecs) {
    const testar = async (c: "avc" | "vp9" | "vp8") => {
      try {
        return await canEncodeVideo(c, { width: largura, height: altura, frameRate: fps, quality: QUALITY_HIGH });
      } catch {
        return false;
      }
    };
    const [avc, vp9, vp8] = await Promise.all([testar("avc"), testar("vp9"), testar("vp8")]);
    if (avc) saidas.push("mp4-avc");
    if (vp9) saidas.push("webm-vp9");
    if (vp8) saidas.push("webm-vp8");
  }
  if (!saidas.length && mimeMediaRecorder()) saidas.push("webm-tempo-real");
  saidas.push("png-zip");
  return { webcodecs, saidas };
}

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
  sinal: AbortSignal;
  aoProgredir(p: { quadro: number; total: number; restanteS: number | null }): void;
  /** Recebe o canvas do vídeo, para pré-visualização durante a geração. */
  aoCriarCanvas?(c: HTMLCanvasElement): void;
}

export interface ArquivoGerado {
  blob: Blob;
  nome: string;
  tipo: "video" | "zip";
  descricao: string;
}

export class Cancelado extends Error {
  constructor() {
    super("Geração cancelada.");
  }
}

const ceder = () => new Promise<void>((r) => setTimeout(r, 0));
const pad = (n: number, w: number) => String(n).padStart(w, "0");

export async function gerarVideo(cena: Cena, p: PedidoVideo): Promise<ArquivoGerado> {
  const canvas = document.createElement("canvas");
  canvas.width = p.largura;
  canvas.height = p.altura;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(p.largura, p.altura, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const camera = new THREE.PerspectiveCamera(45, p.largura / p.altura, 0.05, 4000);
  p.aoCriarCanvas?.(canvas);

  const total = totalDeQuadros(p.segundos, p.fps);
  const inicio = performance.now();
  const desenhar = (i: number) => {
    p.aplicarDia(diaDoQuadro(i, total, p.diasDeObra));
    cena.posicionar(camera, p.poseNoTempo(i / p.fps));
    renderer.render(cena.scene, camera);
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
    if (p.saida === "webm-tempo-real") return await comoMediaRecorder(p, canvas, total, desenhar, progredir, conferir);
    return await comoWebCodecs(p, canvas, total, desenhar, progredir, conferir);
  } finally {
    cena.silencioso = false;
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

type Desenhar = (i: number) => void;
type Progredir = (i: number) => void;

async function comoWebCodecs(p: PedidoVideo, canvas: HTMLCanvasElement, total: number, desenhar: Desenhar, progredir: Progredir, conferir: () => void): Promise<ArquivoGerado> {
  const mp4 = p.saida === "mp4-avc";
  const codec = mp4 ? "avc" : p.saida === "webm-vp9" ? "vp9" : "vp8";
  const output = new Output({ format: mp4 ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(), target: new BufferTarget() });
  const fonte = new CanvasSource(canvas, { codec, quality: QUALITY_HIGH });
  output.addVideoTrack(fonte, { frameRate: p.fps });
  await output.start();
  try {
    for (let i = 0; i < total; i++) {
      conferir();
      desenhar(i);
      await fonte.add(i / p.fps, 1 / p.fps); // respeita a contrapressão do codificador
      progredir(i);
      if (i % 2 === 0) await ceder();
    }
    conferir();
    await output.finalize();
  } catch (e) {
    if (output.state !== "finalized" && output.state !== "canceled") await output.cancel().catch(() => {});
    throw e;
  }
  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer || buffer.byteLength === 0) throw new Error("O codificador terminou sem produzir dados.");
  const mime = mp4 ? "video/mp4" : "video/webm";
  return { blob: new Blob([buffer], { type: mime }), nome: `${p.nomeBase}.${mp4 ? "mp4" : "webm"}`, tipo: "video", descricao: NOME_SAIDA[p.saida] };
}

async function comoMediaRecorder(p: PedidoVideo, canvas: HTMLCanvasElement, total: number, desenhar: Desenhar, progredir: Progredir, conferir: () => void): Promise<ArquivoGerado> {
  const mime = mimeMediaRecorder();
  if (!mime) throw new Error("MediaRecorder indisponível.");
  const stream = canvas.captureStream(0);
  const trilha = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const gravador = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });
  const partes: Blob[] = [];
  gravador.ondataavailable = (e) => e.data.size && partes.push(e.data);
  const parado = new Promise<void>((r) => (gravador.onstop = () => r()));
  gravador.start(1000);
  const intervalo = 1000 / p.fps;
  const t0 = performance.now();
  try {
    for (let i = 0; i < total; i++) {
      conferir();
      desenhar(i);
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
  }
  conferir();
  const blob = new Blob(partes, { type: "video/webm" });
  if (blob.size === 0) throw new Error("O MediaRecorder terminou sem produzir dados.");
  return { blob, nome: `${p.nomeBase}.webm`, tipo: "video", descricao: NOME_SAIDA["webm-tempo-real"] };
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
      desenhar(i);
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
