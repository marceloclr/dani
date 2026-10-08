// Foto da obra no vídeo (ADR-34): a foto emoldurada sobre a obra no dia dela, como numa apresentação
// de arquitetura — véu escuro sobre a cena, passe-partout cor de papel com filete dourado, sombra suave,
// legenda com data, etapa e descrição, zoom lento na foto e entrada e saída suaves. Tokens do Papel e Tinta.

/** Cores da moldura. */
export const COR_VEU = "rgba(28, 26, 23, 0.55)", COR_PAPEL = "#f5f0e6", COR_FILETE = "#b88848", COR_TINTA = "#2c2a26", COR_TENUE = "#7a7266";
/** Margem do papel (fração do lado menor do vídeo), zoom máximo da foto e tempos de entrada e saída (s). */
export const MARGEM_PAPEL = 0.035, ZOOM_FOTO = 0.06, ENTRADA_S = 0.35, SAIDA_S = 0.3, SUBIDA = 0.03;

export interface Retangulo {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutMoldura {
  papel: Retangulo;
  janela: Retangulo;
  /** Faixa da legenda, dentro do papel, abaixo da foto. */
  legenda: Retangulo;
}

/**
 * Onde ficam o papel, a janela da foto e a legenda (puro: testado no Node). A janela é 4:3 (ou 3:4 com foto
 * em retrato); no vídeo vertical o papel ocupa 84 % da largura, no horizontal 70 % da altura.
 */
export function layoutDaMoldura(largura: number, altura: number, fotoW: number, fotoH: number): LayoutMoldura {
  const retrato = fotoH > fotoW;
  const proporcao = retrato ? 3 / 4 : 4 / 3; // largura ÷ altura da janela
  const m = Math.round(Math.min(largura, altura) * MARGEM_PAPEL);
  const legendaH = Math.round(Math.min(largura, altura) * 0.13);
  let papelW: number, papelH: number;
  if (altura > largura) {
    papelW = Math.round(largura * 0.84);
    papelH = Math.round((papelW - 2 * m) / proporcao + 2 * m + legendaH);
  } else {
    papelH = Math.round(altura * 0.7);
    papelW = Math.round((papelH - 2 * m - legendaH) * proporcao + 2 * m);
  }
  // nunca maior que a tela (foto em retrato no vídeo horizontal, por exemplo)
  const k = Math.min(1, (largura * 0.92) / papelW, (altura * 0.86) / papelH);
  papelW = Math.round(papelW * k);
  papelH = Math.round(papelH * k);
  const mk = Math.round(m * k), lk = Math.round(legendaH * k);
  const papel = { x: Math.round((largura - papelW) / 2), y: Math.round((altura - papelH) / 2), w: papelW, h: papelH };
  const janela = { x: papel.x + mk, y: papel.y + mk, w: papelW - 2 * mk, h: papelH - 2 * mk - lk };
  const legenda = { x: janela.x, y: janela.y + janela.h, w: janela.w, h: lk + mk };
  return { papel, janela, legenda };
}

/** Opacidade e deslocamento de entrada/saída da moldura no segundo `t` de uma cena de `duracaoS`. */
export function animacaoDaMoldura(t: number, duracaoS: number): { opacidade: number; subida: number } {
  const suave = (x: number) => {
    const c = Math.min(Math.max(x, 0), 1);
    return c * c * (3 - 2 * c);
  };
  const entra = suave(t / ENTRADA_S), sai = 1 - suave((t - (duracaoS - SAIDA_S)) / SAIDA_S);
  return { opacidade: Math.min(entra, sai), subida: (1 - entra) * SUBIDA };
}

export interface LegendaFoto {
  data: string;
  etapa: string;
  descricao: string;
}

/** Quebra o texto em até `linhas` linhas de `max` px (a última com reticências, se precisar). */
function quebrar(ctx: CanvasRenderingContext2D, texto: string, max: number, linhas: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let atual = "";
  for (let k = 0; k < palavras.length; k++) {
    const tenta = atual ? `${atual} ${palavras[k]}` : palavras[k];
    if (ctx.measureText(tenta).width <= max || !atual) atual = tenta;
    else {
      out.push(atual);
      atual = palavras[k];
      if (out.length === linhas - 1) {
        out.push(caber(ctx, palavras.slice(k).join(" "), max));
        return out;
      }
    }
  }
  if (atual) out.push(caber(ctx, atual, max));
  return out;
}

/** Corta o texto com reticências para caber em `max` px. */
function caber(ctx: CanvasRenderingContext2D, texto: string, max: number): string {
  if (ctx.measureText(texto).width <= max) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

/**
 * Desenha a moldura com a foto no canvas (do tamanho do vídeo), já com o véu: `t` é o segundo dentro da cena.
 * A foto entra em "cover" na janela, com o zoom lento de 1 a 1 + `ZOOM_FOTO` ao longo da cena.
 */
export function desenharFotoEmoldurada(ctx: CanvasRenderingContext2D, foto: CanvasImageSource & { width: number; height: number }, legenda: LegendaFoto, t: number, duracaoS: number): void {
  const { width: L, height: A } = ctx.canvas;
  ctx.clearRect(0, 0, L, A);
  const { opacidade, subida } = animacaoDaMoldura(t, duracaoS);
  if (opacidade <= 0) return;
  ctx.save();
  ctx.globalAlpha = opacidade;
  ctx.fillStyle = COR_VEU;
  ctx.fillRect(0, 0, L, A);
  const lay = layoutDaMoldura(L, A, foto.width, foto.height);
  const dy = Math.round(subida * A);
  const { papel, janela, legenda: faixa } = lay;
  // papel com sombra suave
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = Math.round(Math.min(L, A) * 0.022);
  ctx.shadowOffsetY = Math.round(Math.min(L, A) * 0.008);
  ctx.fillStyle = COR_PAPEL;
  ctx.fillRect(papel.x, papel.y + dy, papel.w, papel.h);
  ctx.restore();
  // foto em "cover" com zoom lento, recortada na janela
  const z = 1 + ZOOM_FOTO * Math.min(Math.max(t / Math.max(duracaoS, 0.01), 0), 1);
  const e = Math.max(janela.w / foto.width, janela.h / foto.height) * z;
  const fw = foto.width * e, fh = foto.height * e;
  ctx.save();
  ctx.beginPath();
  ctx.rect(janela.x, janela.y + dy, janela.w, janela.h);
  ctx.clip();
  ctx.drawImage(foto, janela.x + (janela.w - fw) / 2, janela.y + dy + (janela.h - fh) / 2, fw, fh);
  ctx.restore();
  // filete dourado em volta da foto
  const filete = Math.max(1.5, Math.min(L, A) * 0.0014);
  ctx.strokeStyle = COR_FILETE;
  ctx.lineWidth = filete;
  ctx.strokeRect(janela.x - filete / 2, janela.y + dy - filete / 2, janela.w + filete, janela.h + filete);
  // legenda: data · etapa (caixa-alta espaçada) e a descrição em até duas linhas
  const f1 = Math.round(faixa.h * 0.15), f2 = Math.round(faixa.h * 0.19);
  const x = faixa.x, y1 = faixa.y + dy + faixa.h * 0.26, y2 = faixa.y + dy + faixa.h * 0.52, entre = f2 * 1.25;
  ctx.textBaseline = "middle";
  ctx.fillStyle = COR_TENUE;
  ctx.font = `600 ${f1}px "IBM Plex Sans", "Segoe UI", sans-serif`;
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${Math.round(f1 * 0.12)}px`;
  ctx.fillText(caber(ctx, [legenda.data, legenda.etapa].filter(Boolean).join(" · ").toLocaleUpperCase("pt-BR"), faixa.w), x, y1);
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = "0px";
  if (legenda.descricao) {
    ctx.fillStyle = COR_TINTA;
    ctx.font = `500 ${f2}px "IBM Plex Sans", "Segoe UI", sans-serif`;
    quebrar(ctx, legenda.descricao, faixa.w, 2).forEach((l, k) => ctx.fillText(l, x, y2 + k * entre));
  }
  ctx.restore();
}

/** Abre as fotos do vídeo respeitando a orientação do EXIF. */
export async function abrirFotos(blobs: Blob[]): Promise<ImageBitmap[]> {
  return Promise.all(blobs.map((b) => createImageBitmap(b, { imageOrientation: "from-image" })));
}
