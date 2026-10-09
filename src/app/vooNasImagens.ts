// Voo do drone pela casa 3D no vídeo de imagens (INC-20): abre o IFC sem perder as trilhas, deixa a casa
// pronta (estimativa automática quando não há cronograma) e desenha o trecho 3D de cada quadro no canvas
// do vídeo de imagens, com a mesma cena, luz e acabamento do vídeo da obra.
import * as THREE from "three";
import { arquivosDeTrilha, restaurarTrilhas } from "./anexos";
import { camadasPara } from "./estadoCena";
import { abrirIfcComoProjeto, novoProjeto } from "./projetos";
import { aplicarSol, diaCivilDaSimulacao } from "./solDaCena";
import { estimarCronograma, prazoSugerido } from "../fourd/estimativa";
import { duracaoObra } from "../fourd/simulacao";
import { lerData } from "../fourd/tempo";
import { cenasDoPasseio, poseDaCena, quadroDoVooNaCena, type Cena as CenaMontagem } from "../rendering/montagem";
import type { Cena } from "../rendering/Cena";
import type { ParteDoVoo } from "../rendering/imagensNoVideo";
import { useProjeto } from "../state/projectStore";

/** Último dia da obra (a casa pronta, mobiliada e com pessoas). */
export function diaDaObraPronta(): number {
  const c = useProjeto.getState().cronograma;
  return c ? Math.max(duracaoObra(c.tarefas) - 1, 0) : 0;
}

/**
 * Abre o IFC para o vídeo de imagens: as trilhas já enviadas continuam (abrir um IFC sem planilha limpa os
 * anexos) e, sem cronograma, entra a estimativa automática (§13), para a casa aparecer pronta.
 */
export async function abrirIfcParaImagens(f: File): Promise<boolean> {
  const trilhas = new Map(arquivosDeTrilha());
  await abrirIfcComoProjeto(f.name, await f.arrayBuffer());
  await restaurarTrilhas(trilhas);
  const st = useProjeto.getState();
  if (st.tipoModelo !== "IFC") return false;
  if (!st.cronograma) {
    const hoje = lerData(new Date().toLocaleDateString("sv-SE"))!;
    const c = estimarCronograma({ area: 100, pavimentos: ["Térreo"], estrutura: "concreto", inicio: hoje, prazo: prazoSugerido(100, 1, "concreto") });
    st.definirCronograma(c, "estimativa automática", "estimativa (§13)", [], false);
  }
  useProjeto.getState().definirDia(diaDaObraPronta());
  return true;
}

/** Tira o IFC do vídeo de imagens (enviado por engano): o modelo sai da tela, as trilhas ficam e o projeto continua salvo em Projetos. */
export async function tirarIfcDasImagens(): Promise<void> {
  const trilhas = new Map(arquivosDeTrilha());
  await novoProjeto();
  await restaurarTrilhas(trilhas);
}

/** Trecho 3D pronto para desenhar quadros (INC-20). */
export interface Trecho3D {
  /** Desenha no `ctx` o quadro do voo `parte` no instante `u` (0 a 1), com a opacidade dada. */
  desenhar(ctx: CanvasRenderingContext2D, parte: ParteDoVoo, u: number, duracaoS: number, quadro: number, opacidade: number): void;
  dispose(): void;
}

/**
 * Prepara o trecho 3D num renderizador dedicado do tamanho do vídeo: a obra pronta, o sol do vídeo (fachada ao
 * sol, de lado, ADR-36) e o percurso: a volta por fora ou a volta e a entrada pela porta. No encerramento, a
 * volta anda no sentido contrário, para não repetir a abertura.
 */
export async function criarTrecho3D(cena: Cena, largura: number, altura: number, percurso: "volta" | "porta"): Promise<Trecho3D> {
  await cena.preparar();
  const st = useProjeto.getState;
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(largura, altura, false);
  const desenhista = cena.criarDesenhista(renderer, largura, altura);
  const camera = new THREE.PerspectiveCamera(45, largura / altura, 0.05, 4000);
  const dia = diaDaObraPronta();
  cena.silencioso = true;
  cena.aplicar(camadasPara(st(), cena, dia, true));
  if (st().aparencia3d === "realista") aplicarSol(cena, undefined, diaCivilDaSimulacao(st(), dia), true);
  const e = cena.enquadramento();
  const voo = cena.voo();
  const partes = cenasDoPasseio(percurso === "porta" ? "ambos" : "externo");
  return {
    desenhar(ctx, parte, u, duracaoS, quadro, opacidade) {
      // em que parte do percurso está o instante u (volta, depois por dentro)
      let ini = 0, k = 0;
      while (k < partes.length - 1 && u > ini + partes[k].parte) ini += partes[k++].parte;
      const p = partes[k];
      const uu = Math.min(1, Math.max(0, (u - ini) / p.parte));
      const c: CenaMontagem = { id: "voo", tipo: "obra", peso: 1, camera: p.camera, obra: [1, 1], pessoa: "oculta", percurso: p.percurso };
      if (p.percurso === "interno" && voo) cena.posicionarLivre(camera, quadroDoVooNaCena(c, uu, voo, duracaoS * p.parte));
      else {
        cena.atualizarPortas(null);
        cena.posicionar(camera, poseDaCena("orbita", e, parte === "encerramento" ? 1 - uu : uu, "volta"));
      }
      desenhista.desenhar(camera, quadro);
      ctx.globalAlpha = opacidade;
      ctx.drawImage(canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.globalAlpha = 1;
    },
    dispose() {
      cena.silencioso = false;
      cena.atualizarPortas(null);
      desenhista.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      aplicarSol(cena);
    },
  };
}
