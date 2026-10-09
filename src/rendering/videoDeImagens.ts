// Vídeo de imagens (INC-19): desenha cada quadro num canvas 2D (imagens com movimento e dissolução, capa,
// títulos de ambiente, assinatura e vinheta da marca) e codifica com os mesmos codificadores e a mesma
// mixagem do vídeo da obra. Sem cena 3D: gerar leva segundos.
import { COR_DOURADO, COR_DOURADO_CLARO } from "../app/marca";
import { totalDeQuadros } from "./cameras";
import { CAPA, VOZ_INICIO_S, camadasNoTempo, type ModoTransicoes, type Transicao, planoDoVideo, recorteNoTempo, recorteQueCobre, tituloNoTempo, vooNoTempo, ZOOM_MOVIMENTO, type ImagemDoVideo, type ParteDoVoo, type PlanoDoVideo } from "./imagensNoVideo";
import { TOPO_RESERVADO_REELS, desenharAssinatura, desenharVinheta, opacidadeVinheta, type TextoMarca } from "./marcaVideo";
import { Cancelado, codificar, dimensoesDaSaida, mixagemDoVideo, type ArquivoGerado, type Saida } from "./VideoRenderer";
import type { TrechoDeFala } from "./apresentadora";
import { legendaNoTempo, type GrupoDaLegenda } from "./legendas";

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
  /** Transições entre as imagens (padrão: variadas). */
  transicoes?: ModoTransicoes;
  /** Legendas animadas (INC-21), já no relógio do vídeo. */
  legendas?: GrupoDaLegenda[] | null;
  /** Voo do drone pela casa 3D (INC-20): os tempos e quem prepara o trecho 3D no tamanho do vídeo. */
  voo?: { aberturaS?: number; encerramentoS?: number; criar(largura: number, altura: number): Promise<DesenhoDoVoo & { dispose(): void }> };
  sinal: AbortSignal;
  aoProgredir(p: { quadro: number; total: number; restanteS: number | null }): void;
  aoCriarCanvas?(c: HTMLCanvasElement): void;
}

const caixaAlta = (s: string) => s.toLocaleUpperCase("pt-BR");

/** Quem desenha o voo 3D (INC-20); na prévia, um quadro que o representa. */
export interface DesenhoDoVoo {
  desenhar(ctx: CanvasRenderingContext2D, parte: ParteDoVoo, u: number, duracaoS: number, quadro: number, opacidade: number): void;
}

/** Prévia do voo: a cena 3D pesaria demais na prévia; um quadro grafite diz o que entra ali no vídeo. */
export const VOO_NA_PREVIA: DesenhoDoVoo = {
  desenhar(ctx, parte, u, _d, _q, opacidade) {
    const W = ctx.canvas.width, H = ctx.canvas.height, base = Math.min(W, H);
    ctx.save();
    ctx.globalAlpha = opacidade;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#3a4250");
    g.addColorStop(1, "#1f2328");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#f4f1ec";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `500 ${Math.round(base * 0.05)}px "IBM Plex Sans", "Segoe UI", sans-serif`;
    ctx.fillText("VOO DO DRONE PELA CASA 3D", W / 2, H / 2, W * 0.9);
    ctx.fillStyle = COR_DOURADO_CLARO;
    ctx.font = `400 ${Math.round(base * 0.032)}px "IBM Plex Sans", "Segoe UI", sans-serif`;
    ctx.fillText(parte === "abertura" ? "abertura · aparece no vídeo gerado" : "encerramento · aparece no vídeo gerado", W / 2, H / 2 + base * 0.07, W * 0.9);
    ctx.fillStyle = COR_DOURADO;
    ctx.fillRect(W * 0.2, H / 2 + base * 0.13, W * 0.6 * u, Math.max(2, base * 0.006));
    ctx.restore();
  },
};

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

/**
 * Título de ambiente: faixa grafite translúcida com filete dourado e caixa-alta espaçada, subindo de leve.
 * Com legendas (`noAlto`), sobe para o alto do quadro e deixa o terço de baixo para elas.
 */
function desenharTitulo(ctx: CanvasRenderingContext2D, W: number, H: number, texto: string, opacidade: number, u: number, noAlto = false): void {
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
  // no alto: no vertical, abaixo da faixa do Reels e da assinatura; no horizontal, em cima à esquerda (a assinatura fica à direita)
  const x = vertical ? (W - bw) / 2 : Math.round(base * 0.06);
  const y = (noAlto ? (vertical ? H * 0.2 : base * 0.06) : vertical ? H * 0.7 : H - base * 0.08 - bh) - u * base * 0.01;
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

/**
 * Legenda animada (INC-21): o grupo de palavras centralizado no terço de baixo (62 % da altura no vertical), em
 * branco com sombra; cada palavra entra no seu tempo com um pop curto. A destacada é 1,5 vez maior e em negrito.
 * O lugar de cada palavra vale para o grupo inteiro: as que entram não empurram as que já estão.
 */
function desenharLegenda(ctx: CanvasRenderingContext2D, W: number, H: number, grupo: GrupoDaLegenda, entradas: number[]): void {
  const base = Math.min(W, H), vertical = H > W;
  const f = Math.round(base * (vertical ? 0.062 : 0.05));
  const fonte = (destaque: boolean) => `${destaque ? 700 : 500} ${destaque ? Math.round(f * 1.5) : f}px "IBM Plex Sans", "Segoe UI", sans-serif`;
  ctx.save();
  ctx.letterSpacing = "0px";
  ctx.font = fonte(false);
  const espaco = ctx.measureText(" ").width;
  const medidas = grupo.palavras.map((p) => {
    ctx.font = fonte(p.destaque);
    return ctx.measureText(p.texto).width;
  });
  // até duas linhas, quebrando onde passar de 86 % da largura
  const larguraMax = W * 0.86;
  const linhas: number[][] = [[]];
  let usada = 0;
  medidas.forEach((w, k) => {
    const atual = linhas[linhas.length - 1];
    if (atual.length && usada + espaco + w > larguraMax && linhas.length < 2) {
      linhas.push([k]);
      usada = w;
    } else {
      atual.push(k);
      usada += (atual.length > 1 ? espaco : 0) + w;
    }
  });
  const alturaDa = (l: number[]) => Math.max(...l.map((k) => (grupo.palavras[k].destaque ? f * 1.5 : f))) * 1.12;
  const total = linhas.reduce((s, l) => s + alturaDa(l), 0);
  let y = (vertical ? H * 0.62 : H * 0.8) - total / 2;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.lineJoin = "round";
  for (const l of linhas) {
    const lh = alturaDa(l);
    const larg = l.reduce((s, k, j) => s + medidas[k] + (j ? espaco : 0), 0);
    // a linha toda numa base só, com a escala de cada palavra puxada para a base dela
    let x = (W - Math.min(larg, larguraMax)) / 2;
    const baseLinha = y + lh * 0.8;
    for (const k of l) {
      const p = grupo.palavras[k], e = entradas[k], w = medidas[k];
      if (e > 0) {
        const s = 0.85 + 0.15 * (1 - (1 - e) * (1 - e));
        ctx.save();
        ctx.globalAlpha = Math.min(1, e * 1.4);
        ctx.translate(x + w / 2, baseLinha);
        ctx.scale(s, s);
        ctx.font = fonte(p.destaque);
        ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
        ctx.shadowBlur = base * 0.014;
        ctx.shadowOffsetY = base * 0.004;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
        ctx.lineWidth = Math.max(1, f * 0.07);
        ctx.strokeText(p.texto, -w / 2, 0);
        ctx.shadowColor = "transparent";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(p.texto, -w / 2, 0);
        ctx.restore();
      }
      x += w + espaco;
    }
    y += lh;
  }
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

/** Suavização das transições (começa e termina devagar). */
const suave = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

let telaVarrer: HTMLCanvasElement | null = null;

/**
 * Desenha a imagem que entra, pela transição dela (`e`: andamento suavizado; `bruto`: sem suavizar):
 * dissolver e aproximar pela opacidade; empurrar pelo deslocamento; varrer por uma faixa suave na diagonal;
 * círculo abrindo do centro, com um filete dourado na borda.
 */
function desenharEntrada(ctx: CanvasRenderingContext2D, W: number, H: number, tr: Transicao, sentido: 1 | -1, e: number, bruto: number, desenhar: (alvo: CanvasRenderingContext2D, x?: number, y?: number, w?: number, h?: number) => void): void {
  ctx.save();
  if (tr === "dissolver") {
    ctx.globalAlpha = bruto;
    desenhar(ctx);
  } else if (tr === "aproximar") {
    const s = 1 + 0.12 * (1 - e);
    ctx.globalAlpha = bruto;
    desenhar(ctx, (W - W * s) / 2, (H - H * s) / 2, W * s, H * s);
  } else if (tr === "empurrar") {
    desenhar(ctx, sentido * W * (1 - e));
  } else if (tr === "varrer") {
    // a nova imagem num canvas à parte, apagada fora da faixa que avança (borda de 25 % do lado maior)
    telaVarrer ??= document.createElement("canvas");
    if (telaVarrer.width !== W || telaVarrer.height !== H) {
      telaVarrer.width = W;
      telaVarrer.height = H;
    }
    const t = telaVarrer.getContext("2d")!;
    t.globalCompositeOperation = "source-over";
    t.clearRect(0, 0, W, H);
    desenhar(t);
    // borda inclinada (x anda `inc` por unidade de y) que atravessa o quadro; a faixa suave tem `b` de largura
    const b = Math.max(W, H) * 0.25, inc = 0.35, extra = H * inc * 0.5;
    const curso = W + b + 2 * extra;
    const f = sentido === 1 ? W + b / 2 + extra - e * curso : -b / 2 - extra + e * curso;
    const n = Math.hypot(1, inc), nx = 1 / n, ny = -inc / n;
    const g = t.createLinearGradient(f - (nx * b) / 2, H / 2 - (ny * b) / 2, f + (nx * b) / 2, H / 2 + (ny * b) / 2);
    // a nova imagem fica do lado de onde a faixa veio
    g.addColorStop(0, sentido === 1 ? "rgba(0,0,0,0)" : "rgba(0,0,0,1)");
    g.addColorStop(1, sentido === 1 ? "rgba(0,0,0,1)" : "rgba(0,0,0,0)");    t.globalCompositeOperation = "destination-in";
    t.fillStyle = g;
    t.fillRect(0, 0, W, H);
    t.globalCompositeOperation = "source-over";
    ctx.drawImage(telaVarrer, 0, 0);
  } else {
    // círculo: abre do centro até cobrir os cantos
    const raio = e * Math.hypot(W, H) * 0.52;
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, Math.max(raio, 0.5), 0, Math.PI * 2);
    ctx.save();
    ctx.clip();
    desenhar(ctx);
    ctx.restore();
    if (bruto < 1) {
      ctx.globalAlpha = 1 - bruto;
      ctx.strokeStyle = COR_DOURADO;
      ctx.lineWidth = Math.max(2, Math.min(W, H) * 0.006);
      ctx.stroke();
    }
  }
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
  extras: { capa?: string; assinatura?: HTMLCanvasElement | null; vinheta?: HTMLCanvasElement | null; voo?: DesenhoDoVoo | null; quadro?: number; legendas?: GrupoDaLegenda[] | null },
): Promise<void> {
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#1c1c1c";
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // voo de abertura por baixo das imagens (a primeira dissolve sobre ele)
  const voo = extras.voo ? vooNoTempo(plano, t) : null;
  const durVoo = (parte: ParteDoVoo) => plano.voos.find((v) => v.parte === parte)!;
  if (voo && !voo.porCima) extras.voo!.desenhar(ctx, voo.parte, voo.u, durVoo(voo.parte).fim - durVoo(voo.parte).ini, extras.quadro ?? 0, 1);
  const camadas = camadasNoTempo(plano, t);
  const bmps = new Map((await imagens(camadas.map((c) => c.item.indice))).map((x) => [x.i, x]));
  // a imagem que entra (em transição) define também como a de baixo se move (empurrar)
  const entrando = camadas.find((c, i) => i > 0 && c.entrada < 1) ?? (camadas.length === 1 && camadas[0].entrada < 1 ? camadas[0] : null);
  const e = entrando ? suave(entrando.entrada) : 1;
  for (const c of camadas) {
    const aberta = bmps.get(c.item.indice);
    if (!aberta) continue;
    // o movimento é calculado em pixels da imagem original; a imagem aberta pode estar reduzida (k)
    const { bmp, k } = aberta;
    const r = recorteNoTempo(c.item.movimento, c.u);
    const desenhar = (alvo: CanvasRenderingContext2D, x = 0, y = 0, w = W, h = H) => alvo.drawImage(bmp, r.x * k, r.y * k, r.w * k, r.h * k, x, y, w, h);
    if (c !== entrando) {
      // a de baixo; no empurrar, sai para o lado enquanto a nova entra
      const dx = entrando?.item.transicao === "empurrar" && camadas.length > 1 ? -entrando.item.sentido * W * e : 0;
      ctx.globalAlpha = 1;
      desenhar(ctx, dx);
      continue;
    }
    desenharEntrada(ctx, W, H, c.item.transicao, c.item.sentido, e, c.entrada, desenhar);
  }
  ctx.globalAlpha = 1;
  // voo de encerramento por cima da última imagem
  if (voo && voo.porCima) extras.voo!.desenhar(ctx, voo.parte, voo.u, durVoo(voo.parte).fim - durVoo(voo.parte).ini, extras.quadro ?? 0, voo.opacidade);
  const capa = extras.capa?.trim();
  if (capa) {
    const o = opacidadeCapa(t);
    if (o > 0) desenharCapa(ctx, W, H, capa, o);
  }
  const tit = tituloNoTempo(plano, t, capa ? CAPA.ini + CAPA.dur + 0.2 : VOZ_INICIO_S + 0.4);
  const comLegendas = !!extras.legendas?.length;
  if (tit && tit.opacidade > 0) desenharTitulo(ctx, W, H, tit.texto, tit.opacidade, tit.u, comLegendas);
  // legendas por cima das imagens e dos títulos, por baixo da vinheta
  const leg = comLegendas ? legendaNoTempo(extras.legendas!, t) : null;
  if (leg) desenharLegenda(ctx, W, H, leg.grupo, leg.entradas);
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

export async function gerarVideoDeImagens(pedido: PedidoImagens): Promise<ArquivoGerado> {
  // a saída pode pedir outro tamanho e fps (MP4 para WhatsApp: até 720p)
  const d = dimensoesDaSaida(pedido.saida, pedido.largura, pedido.altura, pedido.fps);
  const p = { ...pedido, largura: d.largura, altura: d.altura, fps: d.fps };
  const W = p.largura, H = p.altura;
  const plano = planoDoVideo(p.imagens, p.segundos, W, H, p.voo ?? {}, p.transicoes ?? "variadas");
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
  const trecho3d = p.voo && plano.voos.length ? await p.voo.criar(W, H) : null;
  const extras = {
    voo: trecho3d,
    quadro: 0,
    capa: p.tituloDoVideo,
    legendas: p.legendas ?? null,
    assinatura: p.assinatura ? desenharAssinatura(W, H, p.assinatura) : null,
    vinheta: p.vinheta && p.segundos >= 6 ? desenharVinheta(W, H, p.vinheta) : null,
  };
  p.aoCriarCanvas?.(canvas);
  const inicio = performance.now();
  const desenhar = async (i: number) => {
    extras.quadro = i;
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
    trecho3d?.dispose();
  }
}
