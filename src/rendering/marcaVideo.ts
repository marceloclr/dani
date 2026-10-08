// Marca no vídeo (ADR-24): assinatura no canto e vinheta de abertura e encerramento, na identidade da
// Daniella Pompeu (grafite e dourado, monograma, caixa-alta espaçada). Desenhadas num canvas 2D e
// sobrepostas à cena num passo ortográfico, em qualquer formato de saída.
import * as THREE from "three";
import { COR_DOURADO, COR_DOURADO_CLARO, COR_GRAFITE, MONOGRAMA_DP, MONOGRAMA_TRACO } from "../app/marca";
import { aleatorio } from "./texturas";

export interface TextoMarca {
  /** Nome em destaque (caixa-alta). */
  nome: string;
  /** Slogan oficial, em dourado. */
  slogan: string;
  /** Linha secundária, menor (o slogan do produto). */
  secundario?: string;
}

/** Duração da vinheta (s): opaca até 1,2 s e some até 2 s; no fim, o inverso. */
export const VINHETA_S = { cheia: 1.2, total: 2 };

/**
 * Opacidade da vinheta no segundo `t` de um vídeo de `duracao` segundos: 1 no começo, apaga entre
 * 1,2 s e 2 s, 0 no meio, acende nos 2 s finais. Vídeos curtos (< 6 s) ficam sem vinheta.
 */
export function opacidadeVinheta(t: number, duracao: number): number {
  if (duracao < 6) return 0;
  const { cheia, total } = VINHETA_S;
  const suave = (x: number) => x * x * (3 - 2 * x);
  const lim = (x: number) => Math.min(1, Math.max(0, x));
  const inicio = 1 - suave(lim((t - cheia) / (total - cheia)));
  const fim = suave(lim((t - (duracao - total)) / (total - cheia)));
  return Math.max(inicio, fim);
}

const caixaAlta = (s: string) => s.toLocaleUpperCase("pt-BR");

/** Desenha o monograma com o canto superior esquerdo em (x, y) e lado `lado`. */
function monograma(ctx: CanvasRenderingContext2D, x: number, y: number, lado: number, cor: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(lado / 100, lado / 100);
  ctx.strokeStyle = cor;
  ctx.lineWidth = MONOGRAMA_TRACO;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke(new Path2D(MONOGRAMA_DP));
  ctx.restore();
}

/** Textura de ardósia grafite (determinística), como o fundo do post do logo. */
function ardosia(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = COR_GRAFITE;
  ctx.fillRect(0, 0, w, h);
  const rnd = aleatorio(97);
  for (let i = 0; i < 900; i++) {
    const v = rnd() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${0.006 + rnd() * 0.014})`;
    ctx.beginPath();
    ctx.ellipse(rnd() * w, rnd() * h, 6 + rnd() * w * 0.06, 2 + rnd() * h * 0.02, rnd() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // veios finos da pedra
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.025 + rnd() * 0.03})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    let px = rnd() * w, py = rnd() * h;
    ctx.moveTo(px, py);
    for (let k = 0; k < 6; k++) ctx.lineTo((px += (rnd() - 0.4) * w * 0.12), (py += (rnd() - 0.5) * h * 0.06));
    ctx.stroke();
  }
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Assinatura do canto inferior esquerdo: faixa grafite com o monograma e o nome. */
export function desenharAssinatura(largura: number, altura: number, t: TextoMarca): HTMLCanvasElement {
  const base = Math.min(largura, altura);
  const f1 = Math.round(base * 0.03), f2 = Math.round(base * 0.019), f3 = Math.round(base * 0.017), pad = Math.round(base * 0.018);
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const fonte1 = `600 ${f1}px "IBM Plex Sans", "Segoe UI", sans-serif`;
  const fonte2 = `500 ${f2}px "IBM Plex Sans", "Segoe UI", sans-serif`;
  const fonte3 = `italic 400 ${f3}px "IBM Plex Serif", Georgia, serif`;
  const medir = (texto: string, fonte: string, esp: number) => {
    ctx.font = fonte;
    ctx.letterSpacing = `${esp}px`;
    return ctx.measureText(texto).width;
  };
  const esp1 = f1 * 0.16, esp2 = f2 * 0.22;
  const ladoMono = f1 + f2 + pad * 0.6 + (t.secundario ? f3 + pad * 0.4 : 0);
  const maxTexto = largura - 6 * pad - ladoMono;
  const w = Math.min(Math.max(medir(caixaAlta(t.nome), fonte1, esp1), medir(caixaAlta(t.slogan), fonte2, esp2), t.secundario ? medir(t.secundario, fonte3, 0) : 0), maxTexto);
  c.width = Math.ceil(pad * 3 + ladoMono + w);
  c.height = Math.ceil(ladoMono + pad * 2);
  ctx.fillStyle = "rgba(28, 28, 28, 0.78)";
  ctx.beginPath();
  ctx.roundRect(0, 0, c.width, c.height, pad * 0.6);
  ctx.fill();
  ctx.fillStyle = COR_DOURADO;
  ctx.fillRect(0, c.height - Math.max(2, base * 0.003), c.width, Math.max(2, base * 0.003)); // filete dourado
  monograma(ctx, pad, pad, ladoMono, COR_DOURADO_CLARO);
  const x = pad * 2 + ladoMono;
  ctx.textBaseline = "top";
  ctx.fillStyle = "#ffffff";
  ctx.font = fonte1;
  ctx.letterSpacing = `${esp1}px`;
  ctx.fillText(caixaAlta(t.nome), x, pad, w);
  ctx.fillStyle = COR_DOURADO_CLARO;
  ctx.font = fonte2;
  ctx.letterSpacing = `${esp2}px`;
  ctx.fillText(caixaAlta(t.slogan), x, pad + f1 + pad * 0.6, w);
  if (t.secundario) {
    ctx.fillStyle = "rgba(233, 226, 214, 0.78)";
    ctx.font = fonte3;
    ctx.letterSpacing = "0px";
    ctx.fillText(t.secundario, x, pad + f1 + f2 + pad, w);
  }
  return c;
}

/** Vinheta de tela cheia: ardósia, monograma grande, nome e slogan centralizados (como o post do logo). */
export function desenharVinheta(largura: number, altura: number, t: TextoMarca): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = largura;
  c.height = altura;
  const ctx = c.getContext("2d")!;
  ardosia(ctx, largura, altura);
  const base = Math.min(largura, altura);
  const lado = base * 0.26;
  const cy = altura * 0.44;
  monograma(ctx, largura / 2 - lado * 0.5, cy - lado * 0.9, lado, COR_DOURADO);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const f1 = Math.round(base * 0.062), f2 = Math.round(base * 0.026), f3 = Math.round(base * 0.022);
  ctx.fillStyle = "#f4f1ec";
  ctx.font = `500 ${f1}px "IBM Plex Sans", "Segoe UI", sans-serif`;
  ctx.letterSpacing = `${f1 * 0.14}px`;
  ctx.fillText(caixaAlta(t.nome), largura / 2, cy + lado * 0.06, largura * 0.9);
  ctx.fillStyle = COR_DOURADO_CLARO;
  ctx.font = `400 ${f2}px "IBM Plex Sans", "Segoe UI", sans-serif`;
  ctx.letterSpacing = `${f2 * 0.3}px`;
  ctx.fillText(caixaAlta(t.slogan), largura / 2, cy + lado * 0.06 + f1 * 1.35, largura * 0.9);
  if (t.secundario) {
    ctx.fillStyle = "rgba(233, 226, 214, 0.6)";
    ctx.font = `italic 400 ${f3}px "IBM Plex Serif", Georgia, serif`;
    ctx.letterSpacing = "0px";
    ctx.fillText(t.secundario, largura / 2, altura - f3 * 3.2, largura * 0.9);
  }
  return c;
}

/** Sobreposição ortográfica de um canvas na tela do vídeo (canto inferior esquerdo ou direito, ou tela cheia). */
export interface Sobreposicao {
  cena: THREE.Scene;
  camera: THREE.OrthographicCamera;
  definirOpacidade(o: number): void;
  dispose(): void;
}

/** Faixa de cima que o Instagram cobre no Reels (nome do perfil e botões): a assinatura fica logo abaixo. */
export const TOPO_RESERVADO_REELS = 0.12;

export function sobrepor(c: HTMLCanvasElement, largura: number, altura: number, onde: "canto" | "canto-direito" | "topo" | "topo-direito" | "cheia", margem = 0): Sobreposicao {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthTest: false });
  const plano = new THREE.Mesh(new THREE.PlaneGeometry(c.width, c.height), mat);
  if (onde !== "cheia") {
    const m = margem || Math.round(Math.min(largura, altura) * 0.03);
    const x = onde === "canto" || onde === "topo" ? m + c.width / 2 : largura - m - c.width / 2;
    // no topo (vídeo vertical, ADR-31): fora da área da pessoa e da legenda do Reels, abaixo do cabeçalho do app
    const y = onde === "topo" || onde === "topo-direito" ? altura - Math.round(altura * TOPO_RESERVADO_REELS) - c.height / 2 : m + c.height / 2;
    plano.position.set(x, y, 0);
  } else plano.position.set(largura / 2, altura / 2, 0);
  const cena = new THREE.Scene();
  cena.add(plano);
  const camera = new THREE.OrthographicCamera(0, largura, altura, 0, -1, 1);
  return {
    cena,
    camera,
    definirOpacidade: (o) => {
      mat.opacity = o;
      plano.visible = o > 0.001;
    },
    dispose: () => {
      tex.dispose();
      mat.dispose();
      plano.geometry.dispose();
    },
  };
}
