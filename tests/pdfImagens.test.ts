// Imagens de PDF (INC-19): impressão visual para as repetidas, textos da página e título da capa.
import { describe, expect, it } from "vitest";
import { IMPRESSAO_H, IMPRESSAO_W, LIMIAR_REPETIDA, distancia, impressaoDe } from "../src/rendering/impressao";
import { textosPorTamanho, tituloDaCapa } from "../src/app/pdfImagens";

/** 17 × 16 pixels RGBA a partir de uma função de cinza. */
const imagem = (f: (x: number, y: number) => number) => {
  const d = new Uint8ClampedArray(IMPRESSAO_W * IMPRESSAO_H * 4);
  for (let y = 0; y < IMPRESSAO_H; y++)
    for (let x = 0; x < IMPRESSAO_W; x++) {
      const v = Math.max(0, Math.min(255, Math.round(f(x, y)))), i = (y * IMPRESSAO_W + x) * 4;
      d.set([v, v, v, 255], i);
    }
  return d;
};
// pseudoaleatório determinístico
const ruido = (s: number) => (x: number, y: number) => ((Math.sin(x * 12.9898 + y * 78.233 + s) * 43758.5453) % 1 + 1) % 1 * 255;

describe("impressão visual", () => {
  it("a mesma imagem com brilho e contraste mudados conta como repetida", () => {
    const a = impressaoDe(imagem(ruido(1)));
    const b = impressaoDe(imagem((x, y) => ruido(1)(x, y) * 0.8 + 20));
    expect(distancia(a, b)).toBeLessThanOrEqual(LIMIAR_REPETIDA);
  });
  it("imagens diferentes ficam longe (perto de metade dos 256 bits)", () => {
    const d = distancia(impressaoDe(imagem(ruido(1))), impressaoDe(imagem(ruido(2))));
    expect(d).toBeGreaterThan(80);
    expect(d).toBeLessThan(176);
  });
  it("256 bits: degradê para a esquerda é o oposto do degradê para a direita", () => {
    expect(distancia(impressaoDe(imagem((x) => x * 10)), impressaoDe(imagem((x) => 255 - x * 10)))).toBe(256);
  });
});

const t = (str: string, tam: number, x: number, y: number) => ({ str, transform: [tam, 0, 0, tam, x, y] });

describe("textos da página", () => {
  it("agrupa por tamanho (10 % de folga), do maior ao menor, na ordem de leitura", () => {
    // capa do PDF de referência: dois textos de 88 pt em linhas diferentes e a linha de 28 pt
    const itens = [t("PROJETO", 88, 566, 321), t("APRESENTAÇÃO DE", 88, 387, 427), t("AMBIENTAÇÃO RESIDENCIAL", 28, 488, 90), t("-", 28, 865, 90), t("JP&M", 28, 882, 90), t(" ", 12, 0, 0)];
    expect(textosPorTamanho(itens)).toEqual(["APRESENTAÇÃO DE PROJETO", "AMBIENTAÇÃO RESIDENCIAL - JP&M"]);
  });
  it("título da capa: os dois maiores textos, sem caixa-alta gritada", () => {
    expect(tituloDaCapa(["APRESENTAÇÃO DE PROJETO", "AMBIENTAÇÃO RESIDENCIAL - JP&M", "rodapé"])).toBe("Apresentação de projeto — Ambientação residencial - JP&M");
    expect(tituloDaCapa(["Casa Aquiraz"])).toBe("Casa Aquiraz");
    expect(tituloDaCapa([])).toBe("");
  });
});
