// Imagens de um PDF de apresentação (INC-19): o pdf.js abre o arquivo no navegador, e cada página entrega as
// imagens que desenha (renders), já decodificadas. Ficam de fora as pequenas na página (logos, ícones) e as
// repetidas; o maior texto de cada página vira o título sugerido, e o texto da capa, o título do vídeo.
import { IMPRESSAO_H, IMPRESSAO_W, LIMIAR_REPETIDA, distancia, impressaoDe } from "../rendering/impressao";

export interface ImagemExtraida {
  blob: Blob;
  largura: number;
  altura: number;
  /** Página do PDF (1 = capa). */
  pagina: number;
  /** Maior texto da página, quando ela tem texto (sugestão de título do ambiente). */
  tituloSugerido: string;
}

export interface ImagensDoPdf {
  imagens: ImagemExtraida[];
  /** Texto da capa (página 1): título sugerido do vídeo. */
  tituloDoDocumento: string;
  paginas: number;
  descartadas: { pequenas: number; repetidas: number };
}

/** Imagem menor que isto na página (fração da área) ou em pixels (lado menor) não é render. */
export const AREA_MINIMA_NA_PAGINA = 0.04, LADO_MINIMO_PX = 300;
/** Lado maior das imagens guardadas (px) e qualidade do JPEG. */
export const LADO_MAXIMO_PX = 2560, QUALIDADE_JPEG = 0.92;

/** Fontes, decodificadores e perfis de cor do pdf.js, servidos pelo próprio app (sem CDN, ADR-07). */
export const recursosDoPdfjs = () => {
  const base = (p: string) => new URL(`pdfjs/${p}/`, document.baseURI).href;
  return { standardFontDataUrl: base("standard_fonts"), wasmUrl: base("wasm"), iccUrl: base("iccs") };
};

type Matriz = [number, number, number, number, number, number];
const multiplicar = (m: Matriz, n: Matriz): Matriz => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

interface ItemTexto {
  str: string;
  transform: number[];
}

/** Textos agrupados pelo tamanho da fonte, do maior para o menor, na ordem de leitura. */
export function textosPorTamanho(itens: ItemTexto[]): string[] {
  const com = itens.filter((i) => i.str.trim()).map((i) => ({ s: i.str.trim(), tam: Math.round(Math.hypot(i.transform[0], i.transform[1])), x: i.transform[4], y: -i.transform[5] }));
  const tamanhos = [...new Set(com.map((c) => c.tam))].sort((a, b) => b - a);
  // tamanhos a até 10 % um do outro são o mesmo nível
  const niveis: number[][] = [];
  for (const t of tamanhos) {
    const n = niveis.find((g) => Math.abs(g[0] - t) <= g[0] * 0.1);
    if (n) n.push(t);
    else niveis.push([t]);
  }
  return niveis.map((g) =>
    com.filter((c) => g.includes(c.tam)).sort((a, b) => a.y - b.y || a.x - b.x).map((c) => c.s).join(" ").replace(/\s+/g, " ").replace(/\s+-\s*/g, " - ").trim(),
  );
}

/** Título do documento pela capa: o maior texto e, abaixo dele, o segundo (ex.: "Apresentação de projeto — Ambientação residencial - JP&M"). */
export function tituloDaCapa(textos: string[]): string {
  const cap = (s: string) => (s === s.toLocaleUpperCase("pt-BR") ? s.charAt(0) + s.slice(1).toLocaleLowerCase("pt-BR") : s);
  return textos.slice(0, 2).map(cap).join(" — ").replace(/jp&m/gi, "JP&M");
}

/** Pixels de um objeto de imagem do pdf.js num canvas (ImageBitmap ou RGBA/RGB/cinza). */
function paraCanvas(obj: { width: number; height: number; bitmap?: ImageBitmap; data?: Uint8ClampedArray; kind?: number }): HTMLCanvasElement | null {
  const c = document.createElement("canvas");
  c.width = obj.width;
  c.height = obj.height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff"; // máscara de transparência sobre papel branco
  ctx.fillRect(0, 0, c.width, c.height);
  if (obj.bitmap) {
    ctx.drawImage(obj.bitmap, 0, 0);
    return c;
  }
  if (!obj.data) return null;
  const n = obj.width * obj.height, rgba = new Uint8ClampedArray(n * 4), d = obj.data;
  if (obj.kind === 3) rgba.set(d.subarray(0, n * 4));
  else if (obj.kind === 2) for (let i = 0; i < n; i++) (rgba[i * 4] = d[i * 3]), (rgba[i * 4 + 1] = d[i * 3 + 1]), (rgba[i * 4 + 2] = d[i * 3 + 2]), (rgba[i * 4 + 3] = 255);
  else return null; // 1 bit por pixel: máscaras e desenhos, não renders
  const tmp = document.createElement("canvas");
  tmp.width = obj.width;
  tmp.height = obj.height;
  tmp.getContext("2d")!.putImageData(new ImageData(rgba, obj.width, obj.height), 0, 0);
  ctx.drawImage(tmp, 0, 0);
  return c;
}

function impressaoDoCanvas(c: HTMLCanvasElement): Uint32Array {
  const p = document.createElement("canvas");
  p.width = IMPRESSAO_W;
  p.height = IMPRESSAO_H;
  const ctx = p.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(c, 0, 0, IMPRESSAO_W, IMPRESSAO_H);
  return impressaoDe(ctx.getImageData(0, 0, IMPRESSAO_W, IMPRESSAO_H).data);
}

async function comoJpeg(c: HTMLCanvasElement): Promise<{ blob: Blob; largura: number; altura: number }> {
  let fonte = c;
  const lado = Math.max(c.width, c.height);
  if (lado > LADO_MAXIMO_PX) {
    const k = LADO_MAXIMO_PX / lado;
    fonte = document.createElement("canvas");
    fonte.width = Math.round(c.width * k);
    fonte.height = Math.round(c.height * k);
    const ctx = fonte.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(c, 0, 0, fonte.width, fonte.height);
  }
  const blob = await new Promise<Blob>((ok, falha) => fonte.toBlob((b) => (b ? ok(b) : falha(new Error("toBlob falhou"))), "image/jpeg", QUALIDADE_JPEG));
  return { blob, largura: fonte.width, altura: fonte.height };
}

/** Extrai as imagens do PDF, página a página, na ordem em que aparecem. */
export async function extrairImagensDoPdf(dados: Uint8Array, aoProgredir?: (pagina: number, total: number) => void): Promise<ImagensDoPdf> {
  const pdfjs = await import("pdfjs-dist");
  const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const tarefa = pdfjs.getDocument({ data: dados, ...recursosDoPdfjs() });
  const doc = await tarefa.promise;
  const OPS = pdfjs.OPS;
  const imagens: ImagemExtraida[] = [];
  const impressoes: Uint32Array[] = [];
  const descartadas = { pequenas: 0, repetidas: 0 };
  let tituloDoDocumento = "";
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      aoProgredir?.(n, doc.numPages);
      const pagina = await doc.getPage(n);
      const vp = pagina.getViewport({ scale: 1 });
      const areaPagina = vp.width * vp.height;
      const textos = textosPorTamanho((await pagina.getTextContent()).items as ItemTexto[]);
      if (n === 1) tituloDoDocumento = tituloDaCapa(textos);
      const ops = await pagina.getOperatorList();
      // a matriz corrente diz o tamanho da imagem na página (o quadrado unitário vai para a imagem)
      let m: Matriz = [1, 0, 0, 1, 0, 0];
      const pilha: Matriz[] = [];
      const vistas = new Set<string>();
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i], args = ops.argsArray[i];
        if (fn === OPS.save) pilha.push(m);
        else if (fn === OPS.restore) m = pilha.pop() ?? [1, 0, 0, 1, 0, 0];
        else if (fn === OPS.transform) m = multiplicar(m, args as Matriz);
        else if (fn === OPS.paintImageXObject || fn === OPS.paintImageXObjectRepeat) {
          const id = args[0] as string;
          if (vistas.has(id)) continue;
          vistas.add(id);
          const area = Math.abs(m[0] * m[3] - m[1] * m[2]);
          const fonte = id.startsWith("g_") ? pagina.commonObjs : pagina.objs;
          const obj = await new Promise<Parameters<typeof paraCanvas>[0]>((ok) => fonte.get(id, ok));
          if (!obj || area / areaPagina < AREA_MINIMA_NA_PAGINA || Math.min(obj.width, obj.height) < LADO_MINIMO_PX) {
            descartadas.pequenas++;
            continue;
          }
          const c = paraCanvas(obj);
          if (!c) {
            descartadas.pequenas++;
            continue;
          }
          const imp = impressaoDoCanvas(c);
          if (impressoes.some((x) => distancia(x, imp) <= LIMIAR_REPETIDA)) {
            descartadas.repetidas++;
            continue;
          }
          impressoes.push(imp);
          imagens.push({ ...(await comoJpeg(c)), pagina: n, tituloSugerido: n === 1 ? "" : textos[0] ?? "" });
        }
      }
      pagina.cleanup();
    }
  } finally {
    await tarefa.destroy();
  }
  return { imagens, tituloDoDocumento, paginas: doc.numPages, descartadas };
}
