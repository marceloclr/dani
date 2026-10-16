// Render no Blender (INC-23, ADR-43): o pacote (cena, faixas por quadro, script e .bat) e o caminho de volta,
// o MP4 do Blender no lugar do desenho 3D do vídeo da obra e do voo do vídeo de imagens.
import { zipSync, strToU8 } from "fflate";
import { GravadorBlender, type FaixasBlender, type OrigemDoPacote } from "../rendering/gravadorBlender";
import { totalDeQuadros } from "../rendering/cameras";
import { abrirQuadros, type QuadrosDaFala } from "../rendering/apresentadora";
import { sobrepor } from "../rendering/marcaVideo";
import { percorrerVooDeImagens, type DesenhoDoVoo, type PedidoImagens } from "../rendering/videoDeImagens";
import type { Cena } from "../rendering/Cena";
import type { FabricaDesenho3D } from "../rendering/VideoRenderer";
import { formatoDoVideo, percorrerVideoDaObra, type PedidoDaObra } from "./videoDaObra";
import { criarTrecho3D } from "./vooNasImagens";
import script from "../../tools/blender/dani_blender.py?raw";
import bat from "../../tools/blender/renderizar.bat?raw";
import leiame from "../../tools/blender/LEIA-ME.txt?raw";

export interface PacoteBlender {
  blob: Blob;
  nome: string;
  assinatura: string;
  quadros: number;
}

type Progresso = (p: { quadro: number; total: number; restanteS: number | null }) => void;

const crlf = (s: string) => s.replace(/\r?\n/g, "\r\n");

export function novaAssinatura(): string {
  const b = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** O ZIP: uma pasta com a cena, as faixas, o script, o .bat e o LEIA-ME. */
async function montarPacote(g: GravadorBlender, meta: Omit<Parameters<GravadorBlender["faixasDoPacote"]>[0], "assinatura">): Promise<PacoteBlender> {
  const assinatura = novaAssinatura();
  const faixas: FaixasBlender = g.faixasDoPacote({ ...meta, assinatura });
  const glb = new Uint8Array(await g.glb());
  const pasta = `${meta.nome}-blender`;
  const zip = zipSync({
    [pasta]: {
      "cena.glb": [glb, { level: 0 }],
      "faixas.json": strToU8(JSON.stringify(faixas)),
      "dani_blender.py": strToU8(script),
      "renderizar.bat": strToU8(crlf(bat)),
      "LEIA-ME.txt": strToU8(crlf(leiame)),
    },
  });
  return { blob: new Blob([zip], { type: "application/zip" }), nome: `${pasta}.zip`, assinatura, quadros: faixas.quadros };
}

/** Pacote do vídeo da obra: os mesmos quadros do vídeo, gravados em vez de desenhados. */
export async function pacoteDaObra(cena: Cena, p: Omit<PedidoDaObra, "desenho3D" | "saida">): Promise<PacoteBlender> {
  const { largura, altura, fps } = formatoDoVideo();
  const g = new GravadorBlender(cena, totalDeQuadros(p.segundos, fps));
  await percorrerVideoDaObra(cena, { ...p, saida: "mp4-alta", desenho3D: async () => g.comoDesenho() });
  return montarPacote(g, { origem: "obra", nome: p.nomeBase, fps, largura, altura });
}

/** Pacote do voo 3D do vídeo de imagens: só os quadros do voo; os outros saem pretos no Blender. */
export async function pacoteDoVoo(
  cena: Cena,
  p: Pick<PedidoImagens, "imagens" | "segundos" | "largura" | "altura" | "fps" | "transicoes"> & { voo: { aberturaS?: number; encerramentoS?: number }; percurso: "volta" | "porta"; nomeBase: string },
  sinal: AbortSignal,
  aoProgredir: Progresso,
): Promise<PacoteBlender> {
  const g = new GravadorBlender(cena, totalDeQuadros(p.segundos, p.fps));
  const trecho = await criarTrecho3D(cena, p.largura, p.altura, p.percurso, g);
  try {
    await percorrerVooDeImagens(p, trecho, sinal, aoProgredir);
  } finally {
    trecho.dispose();
  }
  return montarPacote(g, { origem: "imagens", nome: p.nomeBase, fps: p.fps, largura: p.largura, altura: p.altura });
}

const RE_RENDER = /-([0-9a-f]{8})-(rascunho|final)\.mp4$/i;

/** Assinatura e qualidade que o script põe no nome do MP4 (null se o arquivo foi renomeado). */
export function dadosDoNome(nome: string): { assinatura: string; qualidade: "rascunho" | "final" } | null {
  const m = RE_RENDER.exec(nome);
  return m ? { assinatura: m[1].toLowerCase(), qualidade: m[2].toLowerCase() as "rascunho" | "final" } : null;
}

/** Leitor do MP4 do Blender pelo tempo: lê em sequência e pula quadros para a frente (decodificar é rápido). */
export interface LeitorDoBlender {
  largura: number;
  altura: number;
  duracaoS: number;
  quadroEm(t: number): Promise<CanvasImageSource>;
  dispose(): void;
}

export async function abrirRenderDoBlender(arquivo: Blob, fps: number): Promise<LeitorDoBlender> {
  // a duração vem do próprio arquivo: os tempos de todos os quadros, em ordem
  const sonda = await abrirQuadros(arquivo, [0]);
  const duracaoS = sonda.duracaoS;
  sonda.dispose();
  const n = Math.max(1, Math.round(duracaoS * fps));
  const q: QuadrosDaFala = await abrirQuadros(arquivo, Array.from({ length: n }, (_, j) => j / fps));
  let k = 0;
  let ultimo: CanvasImageSource | null = null;
  return {
    largura: q.largura,
    altura: q.altura,
    duracaoS,
    async quadroEm(t: number) {
      const j = Math.min(n - 1, Math.max(0, Math.round(t * fps)));
      while (k <= j || !ultimo) {
        ultimo = await q.proximo(k / fps);
        k++;
        if (k >= n) break;
      }
      return ultimo!;
    },
    dispose: () => q.dispose(),
  };
}

/** Confere o MP4 contra o vídeo que vai ser gerado: a duração tem de bater (meio segundo de folga). */
export function conferirRender(duracaoS: number, segundos: number): string | null {
  if (Math.abs(duracaoS - segundos) > 0.5) {
    return `O render do Blender tem ${duracaoS.toFixed(1)} s, e o vídeo, ${segundos.toFixed(1)} s. Gere o pacote de novo com a duração atual.`;
  }
  return null;
}

/** O MP4 do Blender como desenho 3D do vídeo da obra: cada quadro do render cobre a tela antes das camadas. */
export function desenhoDoBlender(arquivo: Blob, segundos: number): FabricaDesenho3D {
  return async (renderer, largura, altura, fps) => {
    const leitor = await abrirRenderDoBlender(arquivo, fps);
    const erro = conferirRender(leitor.duracaoS, segundos);
    if (erro) {
      leitor.dispose();
      throw new Error(erro);
    }
    const tela = document.createElement("canvas");
    tela.width = largura;
    tela.height = altura;
    const ctx = tela.getContext("2d")!;
    ctx.imageSmoothingQuality = "high";
    const camada = sobrepor(tela, largura, altura, "cheia");
    return {
      async desenhar(_camera, i) {
        ctx.drawImage(await leitor.quadroEm(i / fps), 0, 0, largura, altura);
        camada.atualizar();
        renderer.setRenderTarget(null);
        renderer.setClearColor(0x000000, 1);
        renderer.clear();
        renderer.autoClear = false;
        renderer.render(camada.cena, camada.camera);
        renderer.autoClear = true;
      },
      dispose() {
        camada.dispose();
        leitor.dispose();
      },
    };
  };
}

/** O MP4 do Blender como voo do vídeo de imagens: o quadro do render no tempo do quadro do vídeo. */
export async function vooDoBlender(arquivo: Blob, fps: number, segundos: number): Promise<DesenhoDoVoo & { dispose(): void }> {
  const leitor = await abrirRenderDoBlender(arquivo, fps);
  const erro = conferirRender(leitor.duracaoS, segundos);
  if (erro) {
    leitor.dispose();
    throw new Error(erro);
  }
  return {
    async desenhar(ctx, _parte, _u, _d, quadro, opacidade) {
      const img = await leitor.quadroEm(quadro / fps);
      ctx.globalAlpha = opacidade;
      ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.globalAlpha = 1;
    },
    dispose: () => leitor.dispose(),
  };
}

export type { OrigemDoPacote };

// ------------------------------------------------------------------ estado da interface
// O render escolhido e a assinatura do último pacote, por origem: valem até recarregar a página (o MP4 não
// vai para o projeto salvo, que ficaria pesado demais).
const renders: Record<OrigemDoPacote, File | null> = { obra: null, imagens: null };
const assinaturas: Record<OrigemDoPacote, string | null> = { obra: null, imagens: null };
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

export function aoMudarBlender(f: () => void): () => void {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}
export const renderDoBlender = (o: OrigemDoPacote): File | null => renders[o];
export const assinaturaDoPacote = (o: OrigemDoPacote): string | null => assinaturas[o];
export function definirRenderDoBlender(o: OrigemDoPacote, f: File | null): void {
  renders[o] = f;
  avisar();
}
export function registrarPacote(o: OrigemDoPacote, assinatura: string): void {
  assinaturas[o] = assinatura;
  avisar();
}
