// Texturas procedurais para a aparência realista (ADR-21): desenhadas no navegador, sem baixar imagens.
// Determinísticas (semente fixa por tipo), para o vídeo sair igual a cada geração.

export type TipoTextura =
  | "tijolo"
  | "reboco"
  | "pintura"
  | "concreto"
  | "telha-ceramica"
  | "telha-metalica"
  | "madeira"
  | "porcelanato"
  | "terra"
  | "grama"
  | "folhagem"
  | "liso";

/** Gerador pseudoaleatório simples (mulberry32). */
export function aleatorio(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tamanho real, em metros, que uma repetição da textura cobre. */
export const ESCALA_M: Record<TipoTextura, [number, number]> = {
  tijolo: [1.2, 0.6],
  reboco: [2, 2],
  pintura: [2, 2],
  concreto: [2, 2],
  "telha-ceramica": [1.2, 1.2],
  "telha-metalica": [1.0, 1.0],
  madeira: [0.8, 0.8],
  porcelanato: [1.2, 1.2],
  terra: [3, 3],
  grama: [2, 2],
  folhagem: [1.5, 1.5],
  liso: [1, 1],
};

const SEMENTE: Record<TipoTextura, number> = {
  tijolo: 11, reboco: 23, pintura: 29, concreto: 37, "telha-ceramica": 41, "telha-metalica": 43,
  madeira: 53, porcelanato: 59, terra: 61, grama: 67, folhagem: 71, liso: 73,
};

const hex = (r: number, g: number, b: number) => `rgb(${r | 0},${g | 0},${b | 0})`;

/** Granulado: pontos claros e escuros espalhados, para tirar a cara de cor chapada. */
function granulado(ctx: CanvasRenderingContext2D, n: number, w: number, h: number, rnd: () => number, intensidade: number) {
  for (let i = 0; i < n; i++) {
    const v = rnd() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${rnd() * intensidade})`;
    ctx.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2);
  }
}

/**
 * Desenha a textura num canvas. `cor` (0–1) tinge os tipos neutros (pintura e liso), para manter a
 * cor do IFC quando ele não diz o material.
 */
export function desenharTextura(tipo: TipoTextura, tamanho = 512, cor: [number, number, number] = [0.85, 0.85, 0.85]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = tamanho;
  const ctx = c.getContext("2d")!;
  const s = tamanho;
  const rnd = aleatorio(SEMENTE[tipo]);
  switch (tipo) {
    case "tijolo": {
      // 6 fiadas de blocos cerâmicos de 0,20 × 0,10 m (escala 1,2 × 0,6 m), juntas de argamassa
      ctx.fillStyle = "#bdb3a6";
      ctx.fillRect(0, 0, s, s);
      const fiadas = 6, porFiada = 6, alt = s / fiadas, larg = s / porFiada, junta = Math.max(2, s / 128);
      for (let f = 0; f < fiadas; f++) {
        const desloc = (f % 2) * (larg / 2);
        for (let k = -1; k <= porFiada; k++) {
          const v = 0.85 + rnd() * 0.25;
          ctx.fillStyle = hex(178 * v, 92 * v, 52 * v);
          ctx.fillRect(k * larg + desloc + junta / 2, f * alt + junta / 2, larg - junta, alt - junta);
        }
      }
      granulado(ctx, s * 6, s, s, rnd, 0.18);
      break;
    }
    case "reboco":
    case "concreto": {
      const base = tipo === "reboco" ? [206, 199, 186] : [150, 150, 146];
      ctx.fillStyle = hex(base[0], base[1], base[2]);
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 260; i++) {
        const v = (rnd() - 0.5) * (tipo === "reboco" ? 16 : 26);
        ctx.fillStyle = `rgba(${base[0] + v},${base[1] + v},${base[2] + v},0.35)`;
        ctx.beginPath();
        ctx.arc(rnd() * s, rnd() * s, 4 + rnd() * 30, 0, Math.PI * 2);
        ctx.fill();
      }
      granulado(ctx, s * 10, s, s, rnd, tipo === "reboco" ? 0.12 : 0.2);
      if (tipo === "concreto") for (let i = 0; i < 40; i++) {
        ctx.fillStyle = "rgba(60,60,58,0.35)";
        ctx.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 2); // poros
      }
      break;
    }
    case "pintura":
    case "liso": {
      ctx.fillStyle = hex(cor[0] * 255, cor[1] * 255, cor[2] * 255);
      ctx.fillRect(0, 0, s, s);
      granulado(ctx, s * 4, s, s, rnd, tipo === "pintura" ? 0.05 : 0.04);
      break;
    }
    case "telha-ceramica": {
      // telhas romanas: fileiras com sombra na base de cada peça
      ctx.fillStyle = "#7a3a22";
      ctx.fillRect(0, 0, s, s);
      const linhas = 8, colunas = 6, a = s / linhas, l = s / colunas;
      for (let r = 0; r < linhas; r++) for (let k = 0; k < colunas; k++) {
        const v = 0.85 + rnd() * 0.25;
        const g = ctx.createLinearGradient(k * l, 0, (k + 1) * l, 0);
        g.addColorStop(0, hex(120 * v, 52 * v, 30 * v));
        g.addColorStop(0.5, hex(178 * v, 82 * v, 48 * v));
        g.addColorStop(1, hex(120 * v, 52 * v, 30 * v));
        ctx.fillStyle = g;
        ctx.fillRect(k * l + 1, r * a, l - 2, a - 3);
        ctx.fillStyle = "rgba(40,15,8,0.45)";
        ctx.fillRect(k * l, r * a + a - 4, l, 4);
      }
      granulado(ctx, s * 4, s, s, rnd, 0.15);
      break;
    }
    case "telha-metalica": {
      for (let x = 0; x < s; x++) {
        const v = 150 + 40 * Math.sin((x / s) * Math.PI * 2 * 8);
        ctx.fillStyle = hex(v * 0.62, v * 0.7, v * 0.78);
        ctx.fillRect(x, 0, 1, s);
      }
      break;
    }
    case "madeira": {
      ctx.fillStyle = "#8a5a32";
      ctx.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 2) {
        const v = 0.8 + 0.25 * Math.sin(y * 0.08 + Math.sin(y * 0.013) * 6) + rnd() * 0.08;
        ctx.fillStyle = hex(140 * v, 92 * v, 52 * v);
        ctx.fillRect(0, y, s, 2);
      }
      break;
    }
    case "porcelanato": {
      // peças de 0,60 × 0,60 m (escala 1,2 m): 2 × 2 por repetição, rejunte fino
      const n = 2, p = s / n, rej = Math.max(2, s / 170);
      ctx.fillStyle = "#b8b2a6";
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const v = 0.96 + rnd() * 0.05;
        ctx.fillStyle = hex(222 * v, 214 * v, 198 * v);
        ctx.fillRect(i * p + rej / 2, j * p + rej / 2, p - rej, p - rej);
      }
      granulado(ctx, s * 3, s, s, rnd, 0.06);
      break;
    }
    case "terra": {
      ctx.fillStyle = "#7b5d40";
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 500; i++) {
        const v = (rnd() - 0.5) * 40;
        ctx.fillStyle = `rgba(${123 + v},${93 + v},${64 + v},0.4)`;
        ctx.beginPath();
        ctx.arc(rnd() * s, rnd() * s, 2 + rnd() * 14, 0, Math.PI * 2);
        ctx.fill();
      }
      granulado(ctx, s * 12, s, s, rnd, 0.25);
      break;
    }
    case "grama":
    case "folhagem": {
      const base = tipo === "grama" ? [88, 128, 62] : [64, 104, 52];
      ctx.fillStyle = hex(base[0], base[1], base[2]);
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < s * 6; i++) {
        const v = (rnd() - 0.5) * 70;
        ctx.strokeStyle = `rgba(${base[0] + v},${base[1] + v * 1.2},${base[2] + v * 0.6},0.55)`;
        ctx.lineWidth = 1 + rnd();
        const x = rnd() * s, y = rnd() * s;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rnd() - 0.5) * 6, y - 4 - rnd() * 8);
        ctx.stroke();
      }
      break;
    }
  }
  return c;
}
