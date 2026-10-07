// Tipos mínimos das bibliotecas sem declarações próprias.
declare module "gifenc" {
  export type Paleta = number[][];
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxCores: number, opcoes?: { format?: "rgb565" | "rgb444" | "rgba4444" }): Paleta;
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, paleta: Paleta, formato?: "rgb565" | "rgb444" | "rgba4444"): Uint8Array;
  export function GIFEncoder(): {
    writeFrame(indice: Uint8Array, largura: number, altura: number, opcoes?: { palette?: Paleta; delay?: number; repeat?: number }): void;
    finish(): void;
    bytes(): Uint8Array;
  };
}

/** Codificador H.264 em WebAssembly (h264-mp4-encoder), carregado de public/vendor como script clássico. */
interface CodificadorH264 {
  outputFilename: string;
  width: number;
  height: number;
  frameRate: number;
  kbps: number;
  speed: number;
  quantizationParameter: number;
  groupOfPictures: number;
  initialize(): void;
  addFrameRgba(rgba: Uint8Array | Uint8ClampedArray): void;
  finalize(): void;
  delete(): void;
  FS: { readFile(caminho: string): Uint8Array; unlink(caminho: string): void };
}
interface Window {
  HME?: { createH264MP4Encoder(): Promise<CodificadorH264> };
}
