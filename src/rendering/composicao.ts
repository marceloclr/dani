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

// ------------------------------------------------------------------ limpeza da máscara da IA

/** Parte do quadro (0–1) abaixo da qual o recorte é ruído (pessoa ausente ou longe demais): a pessoa some. */
export const COBERTURA_MINIMA = 0.02;
/** Acima disto, a IA marcou quase o quadro todo como pessoa: falhou, e a pessoa some. */
export const COBERTURA_MAXIMA = 0.7;
/** Uma mancha separada só fica se tiver ao menos esta fração da maior (mão ou braço destacados do corpo). */
export const FRACAO_PARTE = 0.3;
/** A pessoa que fala para a câmera encosta na base do quadro: a mancha precisa chegar a esta altura (de cima). */
export const BASE_DO_QUADRO = 0.92;
/**
 * Confiança média mínima da IA na mancha da pessoa (ADR-33): com a pessoa fora ou pequena, a maior mancha na base
 * pode ser o fundo (uma escada, um móvel), que a IA marca com pouca certeza e entrava semitransparente no vídeo.
 */
export const CONFIANCA_MINIMA = 0.75;
/** Quanto (fração da largura) o centro da pessoa pode andar de um quadro para o outro; mais que isso é outra mancha. */
export const SALTO_MAXIMO = 0.2;

/**
 * Limpa a máscara de confiança da IA (ADR-31), quadro a quadro: fica só a pessoa (a maior mancha contínua e as
 * partes grandes), com a borda suave original; o resultado é suavizado no tempo e some aos poucos quando o
 * recorte não é confiável. Puro: testado no Node.
 */
export class LimpezaDeMascara {
  private anterior: Float32Array | null = null;
  private presenca = 0;
  /** Centro horizontal (0–1) da última mancha aceita como a pessoa, enquanto ela está presente. */
  private centro: number | null = null;
  constructor(readonly largura: number, readonly altura: number, private readonly memoria = 0.35, private readonly passoPresenca = 0.2) {}

  /** `conf`: confiança 0–1 por pixel, de cima para baixo. Devolve a máscara 0–1 e a cobertura medida. */
  limpar(conf: ArrayLike<number>): { mascara: Float32Array; cobertura: number; presenca: number } {
    const w = this.largura, h = this.altura, n = w * h;
    // 1) manchas contínuas (vizinhança de 4) na máscara binária
    const rotulo = new Int32Array(n).fill(-1);
    const tamanhos: number[] = [];
    const somaConf: number[] = [];
    const somaX: number[] = [];
    const caixas: [number, number, number, number][] = []; // x0, y0, x1, y1 de cada mancha
    const pilha = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      if (rotulo[i] !== -1 || conf[i] < 0.5) continue;
      const id = tamanhos.length;
      let topo = 0, tam = 0, sc = 0, sx = 0;
      const cx: [number, number, number, number] = [w, h, -1, -1];
      pilha[topo++] = i;
      rotulo[i] = id;
      while (topo) {
        const p = pilha[--topo];
        tam++;
        const x = p % w, y = (p - x) / w;
        sc += conf[p];
        sx += x;
        if (x < cx[0]) cx[0] = x;
        if (y < cx[1]) cx[1] = y;
        if (x > cx[2]) cx[2] = x;
        if (y > cx[3]) cx[3] = y;
        const viz = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
        for (const q of viz) if (q >= 0 && rotulo[q] === -1 && conf[q] >= 0.5) (rotulo[q] = id), (pilha[topo++] = q);
      }
      tamanhos.push(tam);
      somaConf.push(sc);
      somaX.push(sx);
      caixas.push(cx);
    }
    // 2) a pessoa é a maior mancha que encosta na base do quadro (objeto solto no meio não é ela); as partes
    //    grandes (≥ 30 %) ficam se estiverem junto dela; a borda suave (confiança < 0,5) só ao redor do que fica
    let principal = -1;
    for (let k = 0; k < tamanhos.length; k++) if (caixas[k][3] >= h * BASE_DO_QUADRO - 1 && (principal < 0 || tamanhos[k] > tamanhos[principal])) principal = k;
    const maior = principal >= 0 ? tamanhos[principal] : 0;
    const cobertura = maior / n;
    const fica = new Uint8Array(n);
    if (principal >= 0) {
      const [px0, py0, px1, py1] = caixas[principal];
      const mx = (px1 - px0) * 0.25, my = (py1 - py0) * 0.25;
      const junto = (k: number) => caixas[k][2] >= px0 - mx && caixas[k][0] <= px1 + mx && caixas[k][3] >= py0 - my && caixas[k][1] <= py1 + my;
      const ok = tamanhos.map((t, k) => k === principal || (t >= maior * FRACAO_PARTE && junto(k)));
      for (let i = 0; i < n; i++) if (rotulo[i] >= 0 && ok[rotulo[i]]) fica[i] = 1;
    }
    const perto = new Uint8Array(n);
    const R = 2;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!fica[y * w + x]) continue;
        for (let dy = -R; dy <= R; dy++)
          for (let dx = -R; dx <= R; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx >= 0 && xx < w && yy >= 0 && yy < h) perto[yy * w + xx] = 1;
          }
      }
    // 3) presença: some e volta aos poucos (sem piscar) quando o recorte deixa de ser confiável
    // a mancha precisa ter a certeza de uma pessoa e não pular de lugar enquanto ela está em cena (ADR-33)
    const confMedia = principal >= 0 ? somaConf[principal] / tamanhos[principal] : 0;
    const centro = principal >= 0 ? (somaX[principal] / tamanhos[principal] + 0.5) / w : null;
    const salto = centro !== null && this.centro !== null && this.presenca > 0 && Math.abs(centro - this.centro) > SALTO_MAXIMO;
    const confiavel = cobertura >= COBERTURA_MINIMA && cobertura <= COBERTURA_MAXIMA && confMedia >= CONFIANCA_MINIMA && !salto;
    if (confiavel) this.centro = centro;
    else if (this.presenca <= this.passoPresenca) this.centro = null; // saiu de cena: pode voltar em outro lugar
    // o primeiro quadro já entra com a presença certa (prévia de um quadro só, começo do vídeo)
    this.presenca = !this.anterior ? (confiavel ? 1 : 0) : Math.min(1, Math.max(0, this.presenca + (confiavel ? this.passoPresenca : -this.passoPresenca)));
    // 4) suavização no tempo (menos tremor na borda)
    const saida = new Float32Array(n);
    const ant = this.anterior;
    for (let i = 0; i < n; i++) {
      const v = perto[i] ? conf[i] : 0;
      saida[i] = ant ? v * (1 - this.memoria) + ant[i] * this.memoria : v;
    }
    this.anterior = saida;
    const mascara = new Float32Array(n);
    for (let i = 0; i < n; i++) mascara[i] = saida[i] * this.presenca;
    return { mascara, cobertura, presenca: this.presenca };
  }
}

// ------------------------------------------------------------------ volume da fala

/** Volume médio da voz (dBFS, RMS dos trechos com fala) e pico máximo, no padrão das redes (ADR-31). */
export const ALVO_RMS_DB = -18;
export const PICO_MAXIMO_DB = -1;
const db = (x: number) => 20 * Math.log10(Math.max(x, 1e-9));

/**
 * Ganho que leva a voz ao volume das redes: RMS dos trechos com fala (janelas de 50 ms acima de −50 dBFS) em
 * `ALVO_RMS_DB`, sem o pico passar de `PICO_MAXIMO_DB`. Fórmula: ganho = mín(10^((alvo − rms)/20), 10^((pico máx − pico)/20)).
 */
export function ganhoDeNormalizacao(canais: Float32Array[], taxa: number): { ganho: number; rmsDb: number; picoDb: number } {
  const janela = Math.max(1, Math.round(taxa * 0.05));
  let pico = 0, somaAtiva = 0, nAtiva = 0;
  const n = canais[0]?.length ?? 0;
  for (let ini = 0; ini < n; ini += janela) {
    let s = 0, k = 0;
    for (const c of canais)
      for (let i = ini; i < Math.min(n, ini + janela); i++) {
        const v = c[i];
        s += v * v;
        k++;
        if (Math.abs(v) > pico) pico = Math.abs(v);
      }
    if (k && db(Math.sqrt(s / k)) > -50) (somaAtiva += s), (nAtiva += k);
  }
  if (!nAtiva) return { ganho: 1, rmsDb: -Infinity, picoDb: db(pico) };
  const rmsDb = db(Math.sqrt(somaAtiva / nAtiva)), picoDb = db(pico);
  const ganho = Math.min(10 ** ((ALVO_RMS_DB - rmsDb) / 20), 10 ** ((PICO_MAXIMO_DB - picoDb) / 20));
  return { ganho: Math.min(8, Math.max(0.1, ganho)), rmsDb, picoDb };
}
