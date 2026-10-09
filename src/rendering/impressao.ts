// Impressão visual de uma imagem (INC-19): dHash de 256 bits sobre a imagem reduzida a 17 × 16 em cinza.
// Duas imagens iguais (mesmo render recomprimido ou reduzido) ficam a poucos bits; imagens diferentes, perto
// de 128. Puro: recebe os pixels já reduzidos.

export const IMPRESSAO_W = 17, IMPRESSAO_H = 16;
/** Até quantos bits (de 256) duas imagens contam como a mesma. */
export const LIMIAR_REPETIDA = 16;

/** dHash: cada bit diz se o pixel é mais claro que o vizinho da direita. `rgba` tem 17 × 16 pixels. */
export function impressaoDe(rgba: Uint8ClampedArray | Uint8Array): Uint32Array {
  const h = new Uint32Array(8);
  let k = 0;
  const luz = (x: number, y: number) => {
    const i = (y * IMPRESSAO_W + x) * 4;
    return rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
  };
  for (let y = 0; y < IMPRESSAO_H; y++)
    for (let x = 0; x < IMPRESSAO_W - 1; x++, k++) if (luz(x, y) > luz(x + 1, y)) h[k >> 5] |= 1 << (k & 31);
  return h;
}

/** Bits diferentes entre duas impressões (0 a 256). */
export function distancia(a: Uint32Array, b: Uint32Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = (a[i] ^ b[i]) >>> 0;
    while (x) {
      x &= x - 1;
      d++;
    }
  }
  return d;
}
