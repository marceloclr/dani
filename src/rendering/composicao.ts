// Composição da apresentadora (ADR-24): onde ela fica no quadro, chave de croma e duração pela fala.
// Puro, sem DOM: as mesmas contas do shader, testadas no Node.

export type PosicaoApresentadora = "esquerda" | "centro" | "direita";
export type Recorte = "ia" | "verde";

export interface ConfigApresentadora {
  /** Nome do arquivo enviado (o arquivo fica no IndexedDB, fora do .4dstudio). */
  arquivo: string;
  /** Duração da fala (s) e tamanho do quadro, lidos ao enviar. */
  duracaoS: number;
  largura: number;
  altura: number;
  recorte: Recorte;
  /** Cor do fundo verde (sRGB 0–255), escolhida no primeiro quadro. */
  chave: [number, number, number];
  /** Distância de cor (0–1) abaixo da qual o pixel some. */
  tolerancia: number;
  /** Faixa (0–1) de transição entre transparente e opaco: borda suave. */
  suavidade: number;
  posicao: PosicaoApresentadora;
  /** Altura da pessoa em fração da altura do vídeo (0,4 a 1). */
  alturaFracao: number;
  /** A duração do vídeo acompanha a fala. */
  acompanharFala: boolean;
}

export const APRESENTADORA_PADRAO: Omit<ConfigApresentadora, "arquivo" | "duracaoS" | "largura" | "altura"> = {
  recorte: "ia",
  chave: [0, 177, 64],
  tolerancia: 0.16,
  suavidade: 0.1,
  posicao: "direita",
  alturaFracao: 0.72,
  acompanharFala: true,
};

export interface Retangulo {
  /** Canto inferior esquerdo, em pixels, com y para cima (câmera ortográfica do vídeo). */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Retângulo da apresentadora no quadro: ancorada embaixo, com a altura pedida e a proporção do vídeo
 * dela; afastada da borda lateral 4 % do lado menor. Se ficar larga demais (vídeo dela horizontal num
 * quadro vertical), é reduzida para caber.
 */
export function layoutApresentadora(largura: number, altura: number, videoW: number, videoH: number, posicao: PosicaoApresentadora, alturaFracao: number): Retangulo {
  const margem = Math.round(Math.min(largura, altura) * 0.04);
  let h = altura * Math.min(1, Math.max(0.3, alturaFracao));
  let w = (h * videoW) / Math.max(videoH, 1);
  const maxW = largura - 2 * margem;
  if (w > maxW) {
    h *= maxW / w;
    w = maxW;
  }
  const x = posicao === "esquerda" ? margem : posicao === "direita" ? largura - margem - w : (largura - w) / 2;
  return { x: Math.round(x), y: 0, w: Math.round(w), h: Math.round(h) };
}

/** A assinatura vai para o canto oposto ao da apresentadora (no centro, fica à esquerda). */
export function cantoDaAssinatura(posicao: PosicaoApresentadora | null): "esquerda" | "direita" {
  return posicao === "esquerda" ? "direita" : "esquerda";
}

/** Cor sRGB (0–255) para croma (Cb, Cr) de 0 a 1, como no shader. */
export function croma(r: number, g: number, b: number): [number, number] {
  const R = r / 255, G = g / 255, B = b / 255;
  return [0.5 - 0.168736 * R - 0.331264 * G + 0.5 * B, 0.5 + 0.5 * R - 0.418688 * G - 0.081312 * B];
}

/**
 * Opacidade de um pixel pela chave de croma: compara só a cor (Cb, Cr), não o brilho, então a sombra
 * no pano verde também some. 0 dentro da tolerância, 1 além de tolerância + suavidade, rampa suave no meio.
 */
export function alfaCroma(px: [number, number, number], chave: [number, number, number], tolerancia: number, suavidade: number): number {
  const [cb, cr] = croma(...px), [kb, kr] = croma(...chave);
  const d = Math.hypot(cb - kb, cr - kr);
  const t = Math.min(1, Math.max(0, (d - tolerancia) / Math.max(suavidade, 1e-4)));
  return t * t * (3 - 2 * t);
}

/** Tira o verde que vaza na pele e no cabelo: o verde não passa da média de vermelho e azul. */
export function semDerrame(px: [number, number, number]): [number, number, number] {
  const [r, g, b] = px;
  return [r, Math.min(g, (r + b) / 2 + 8), b];
}

export const DURACOES_PADRAO = [15, 30, 60, 90, 120] as const;

/**
 * Duração do vídeo com a fala: a da fala, arredondada para cima ao décimo de segundo, entre 6 s e
 * 5 min. Sem acompanhar a fala, vale a duração escolhida.
 */
export function duracaoDoVideo(escolhida: number, fala: ConfigApresentadora | null | undefined): number {
  if (!fala || !fala.acompanharFala || !(fala.duracaoS > 0)) return escolhida;
  return Math.min(300, Math.max(6, Math.ceil(fala.duracaoS * 10) / 10));
}
