// Vídeo de imagens (INC-19): desenha cada quadro num canvas 2D (imagens com movimento e dissolução, capa,
// títulos de ambiente, assinatura e vinheta da marca) e codifica com os mesmos codificadores e a mesma
// mixagem do vídeo da obra. Sem cena 3D: gerar leva segundos.
import { COR_DOURADO, COR_DOURADO_CLARO } from "../app/marca";
import { totalDeQuadros } from "./cameras";
import { CAPA, VOZ_INICIO_S, camadasNoTempo, planoDoVideo, recorteNoTempo, recorteQueCobre, tituloNoTempo, ZOOM_MOVIMENTO, type ImagemDoVideo, type PlanoDoVideo } from "./imagensNoVideo";
import { TOPO_RESERVADO_REELS, desenharAssinatura, desenharVinheta, opacidadeVinheta, type TextoMarca } from "./marcaVideo";
import { Cancelado, codificar, mixagemDoVideo, type ArquivoGerado, type Saida } from "./VideoRenderer";
import type { TrechoDeFala } from "./apresentadora";

export interface PedidoImagens {
  saida: Saida;
  largura: number;
  altura: number;
  fps: number;
  segundos: number;
  nomeBase: string;
  /** Imagens na ordem, com título e marcação, e o arquivo de cada uma. */
  imagens: (ImagemDoVideo & { blob: Blob })[];
  /** Título do vídeo, sobre a primeira imagem (vazio = sem capa). */
  tituloDoVideo?: string;
  /** Narração: entra depois da vinheta (VOZ_INICIO_S), com a duração já conhecida. */
  narracao?: { blob: Blob; duracaoS: number } | null;
  trilhas?: { blob: Blob; iniS: number; volume: number }[];
  assinatura?: TextoMarca;
  vinheta?: TextoMarca;
  sinal: AbortSignal;
  aoProgredir(p: { quadro: number; total: number; restanteS: number | null }): void;
  aoCriarCanvas?(c: HTMLCanvasElement): void;
}

const caixaAlta = (s: string) => s.toLocaleUpperCase("pt-BR");

/**
 * Imagens decodificadas só quando entram no vídeo e soltas quando saem (90 renders de 2000 px não cabem
 * na memória de uma vez), já reduzidas ao tamanho que o quadro precisa.
 */
function bancoDeImagens(imgs: PedidoImagens["imagens"], quadroW: number, quadroH: number) {
  const abertas = new Map<number, Promise<ImageBitmap>>();
  const abrir = (i: number) => {
    let p = abertas.get(i);
    if (!p) {
      const im = imgs[i];
      // o recorte que cobre o quadro, já ampliado pelo zoom do movimento, não precisa de mais pixels que isto
      const r = recorteQueCobre(im.largura, im.altura, quadroW, quadroH);
      const escala = Math.min(1, (quadroW / r.w) * ZOOM_MOVIMENTO * 1.05);
      p = createImageBitmap(im.blob, escala < 1 ? { resizeWidth: Math.round(im.largura * escala), resizeQuality: "high" } : {});
      abertas.set(i, p);
    }
    return p;
  };
  return {
    async usar(indices: number[]) {
      for (const [i, p] of abertas) if (!indices.includes(i)) { abertas.delete(i); void p.then((b) => b.close()).catch(() => {}); }
      return Promise.all(indices.map(async (i) => { const bmp = await abrir(i); return { i, bmp, k: bmp.width / imgs[i].largura }; }));
    },
    fechar() {
      for (const p of abertas.values()) void p.then((b) => b.close()).catch(() => {});
      abertas.clear();
    },
  };
}

/** Título de ambiente: faixa grafite translúcida com filete dourado e caixa-alta espaçada, subindo de leve. */
function desenharTitulo(ctx: CanvasRenderingContext2D, W: number, H: number, texto: string, opacidade: number, u: number): void {
  const base = Math.min(W, H), vertical = H > W;
  const f = Math.round(base * (vertical ? 0.05 : 0.042)), pad = Math.round(f * 0.7);
  ctx.save();
  ctx.globalAlpha = opacidade;
  ctx.font = `500 ${f}px "IBM Plex Sans", "Segoe UI", sans-serif`;
  ctx.letterSpacing = `${f * 0.16}px`;
  const t = caixaAlta(texto);
  const w = Math.min(ctx.measureText(t).width, W * 0.8);
  const bw = w + pad * 2, bh = f + pad * 1.6;
  // vertical: no terço de baixo, centralizado, acima da legenda do Reels; horizontal: embaixo, à esquerda
  const x = vertical ? (W - bw) / 2 : Math.round(base * 0.06);
  const y = (vertical ? H * 0.7 : H - base * 0.08 - bh) - u * base * 0.01;
  ctx.fillStyle = "rgba(28, 28, 28, 0.62)";
  ctx.beginPath();
  ctx.roundRect(x, y, bw, bh, pad * 0.35);
  ctx.fill();
  ctx.fillStyle = COR_DOURADO;
  ctx.fillRect(x, y + bh - Math.max(2, base * 0.003), bw, Math.max(2, base * 0.003));
  ctx.fillStyle = "#f4f1ec";
  ctx.textBaseline = "middle";
  ctx.fillText(t, x + pad, y + bh / 2, w);
  ctx.restore();
}

/** Capa: título do vídeo centralizado sobre a primeira imagem, com véu escuro. */
function desenharCapa(ctx: CanvasRenderingContext2D, W: number, H: number, texto: string, opacidade: number): void {
  const base = Math.min(W, H);
  ctx.save();
  ctx.globalAlpha = opacidade;
  ctx.fillStyle = "rgba(20, 20, 20, 0.45)";
  ctx.fillRect(0, 0, W, H);
  const linhas = texto.split(/\n|\s+[–—-]\s+/).map((l) => caixaAlta(l.trim())).filter(Boolean).slice(0, 3);
  const f1 = Math.round(base * 0.06), f2 = Math.round(base * 0.032);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const y0 = H / 2 - ((linhas.length - 1) * f1 * 0.75);
  linhas.forEach((l, k) => {
    const principal = k === 0;
    ctx.font = principal ? `500 ${f1}px "IBM Plex Sans", "Segoe UI", sans-serif` : `400 ${f2}px "IBM Plex Sans", "Segoe UI", sans-serif`;
    ctx.letterSpacing = `${(principal ? f1 : f2) * (principal ? 0.12 : 0.28)}px`;
    ctx.fillStyle = principal ? "#f4f1ec" : COR_DOURADO_CLARO;
    ctx.fillText(l, W / 2, y0 + k * f1 * 1.5, W * 0.88);
  });
  ctx.fillStyle = COR_DOURADO;
  ctx.fillRect(W / 2 - base * 0.06, y0 + f1 * 0.8, base * 0.12, Math.max(2, base * 0.003));
  ctx.restore();
}

/** Opacidade da capa no segundo `t` (entra e sai em 0,5 s). */
const opacidadeCapa = (t: number) => {
  const dt = t - CAPA.ini;
  if (dt < 0 || dt > CAPA.dur) return 0;
  return Math.min(1, dt / 0.5, (CAPA.dur - dt) / 0.5);
};

/** Desenha o quadro do segundo `t`. Exportado para a prévia do Conferir. */
export async function desenharQuadroDeImagens(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  plano: PlanoDoVideo,
  t: number,
  imagens: (indices: number[]) => Promise<{ i: number; bmp: ImageBitmap; k: number }[]>,
  extras: { capa?: string; assinatura?: HTMLCanvasElement | null; vinheta?: HTMLCanvasElement | null },
): Promise<void> {
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#1c1c1c";
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const camadas = camadasNoTempo(plano, t);
  const bmps = new Map((await imagens(camadas.map((c) => c.item.indice))).map((x) => [x.i, x]));
  for (const c of camadas) {
    const aberta = bmps.get(c.item.indice);
    if (!aberta) continue;
    // o movimento é calculado em pixels da imagem original; a imagem aberta pode estar reduzida (k)
    const { bmp, k } = aberta;
    const r = recorteNoTempo(c.item.movimento, c.u);
    ctx.globalAlpha = c.opacidade;
    ctx.drawImage(bmp, r.x * k, r.y * k, r.w * k, r.h * k, 0, 0, W, H);
  }
  ctx.globalAlpha = 1;
  const capa = extras.capa?.trim();
  if (capa) {
    const o = opacidadeCapa(t);
    if (o > 0) desenharCapa(ctx, W, H, capa, o);
  }
  const tit = tituloNoTempo(plano, t, capa ? CAPA.ini + CAPA.dur + 0.2 : VOZ_INICIO_S + 0.4);
  if (tit && tit.opacidade > 0) desenharTitulo(ctx, W, H, tit.texto, tit.opacidade, tit.u);
  if (extras.assinatura) {
    // vertical: logo abaixo da faixa que o Instagram cobre; horizontal: canto de cima, à direita
    const a = extras.assinatura, m = Math.round(Math.min(W, H) * 0.03);
    const y = H > W ? Math.round(H * TOPO_RESERVADO_REELS) : m;
    ctx.drawImage(a, H > W ? m : W - m - a.width, y);
  }
  if (extras.vinheta) {
    const o = opacidadeVinheta(t, plano.duracaoS);
    if (o > 0) {
      ctx.globalAlpha = o;
      ctx.drawImage(extras.vinheta, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }
}

const ceder = () => new Promise<void>((r) => setTimeout(r, 0));

export async function gerarVideoDeImagens(p: PedidoImagens): Promise<ArquivoGerado> {
  const W = p.largura, H = p.altura;
  const plano = planoDoVideo(p.imagens, p.segundos, W, H);
  if (!plano.itens.length) throw new Error(plano.aviso ?? "Nenhuma imagem marcada.");
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  const total = totalDeQuadros(p.segundos, p.fps);
  const banco = bancoDeImagens(p.imagens, W, H);
  // a voz começa depois da vinheta: um trecho mudo antes da narração
  const voz: TrechoDeFala[] | null = p.narracao
    ? [
        { arquivo: null, inicioS: 0, fimS: VOZ_INICIO_S, semVideo: true },
        { arquivo: p.narracao.blob, inicioS: 0, fimS: p.narracao.duracaoS, semVideo: true },
      ]
    : null;
  const audio = await mixagemDoVideo(p.saida, total / p.fps, voz, p.trilhas);
  const extras = {
    capa: p.tituloDoVideo,
    assinatura: p.assinatura ? desenharAssinatura(W, H, p.assinatura) : null,
    vinheta: p.vinheta && p.segundos >= 6 ? desenharVinheta(W, H, p.vinheta) : null,
  };
  p.aoCriarCanvas?.(canvas);
  const inicio = performance.now();
  const desenhar = async (i: number) => {
    await desenharQuadroDeImagens(ctx, W, H, plano, i / p.fps, (ix) => banco.usar(ix), extras);
    if (i % 4 === 0) await ceder();
  };
  const progredir = (i: number) => {
    const feito = i + 1, decorrido = (performance.now() - inicio) / 1000;
    p.aoProgredir({ quadro: feito, total, restanteS: feito > 3 ? (decorrido / feito) * (total - feito) : null });
  };
  const conferir = () => {
    if (p.sinal.aborted) throw new Cancelado();
  };
  try {
    return await codificar(p, canvas, total, desenhar, progredir, conferir, audio);
  } finally {
    banco.fechar();
  }
}
