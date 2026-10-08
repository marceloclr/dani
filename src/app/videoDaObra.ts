// Geração do vídeo da obra a partir do estado do projeto (ADR-30): a mesma rotina serve ao painel Vídeo
// (Gestão) e ao assistente. Monta o pedido do VideoRenderer: dia da obra, sol real por quadro, insolação,
// marca, vinheta, apresentadora (uma fala ou a sequência da planilha) e câmera (roteiro, drone ou montagem).
import { camadasPara } from "./estadoCena";
import { aplicarSol, cicloDoVoo, definirInsolacaoAtiva, diaCivilDaSimulacao, insolacaoLigada, solDoProjeto } from "./solDaCena";
import { CLIENTE } from "./marca";
import { duracaoObra } from "../fourd/simulacao";
import { horarioDoVoo } from "../rendering/cicloDia";
import { poseNoTempo, type PontoRoteiro } from "../rendering/cameras";
import { diaDoVoo } from "../rendering/drone";
import { cenaNoTempo, obraNaCena, poseDaCena, quadroDoVooNaCena, trechoDoVoo, trechoInterno, type Cena as CenaMontagem } from "../rendering/montagem";
import { gerarVideo, type ArquivoGerado, type Saida } from "../rendering/VideoRenderer";
import type { Cena } from "../rendering/Cena";
import type { ConfigApresentadora } from "../rendering/composicao";
import type { FonteFala } from "../rendering/apresentadora";
import { RESOLUCOES, useProjeto } from "../state/projectStore";

export interface PedidoDaObra {
  saida: Saida;
  segundos: number;
  camera: "roteiro" | "drone" | "montagem";
  /** Cenas da montagem (camera = "montagem"). */
  cenas: CenaMontagem[];
  /** Roteiro de vistas (camera = "roteiro"). */
  roteiro: PontoRoteiro[];
  fala: { fonte: FonteFala; cfg: ConfigApresentadora } | null;
  nomeBase: string;
  sinal: AbortSignal;
  aoProgredir(p: { quadro: number; total: number; restanteS: number | null }): void;
  aoCriarCanvas?(c: HTMLCanvasElement): void;
}

export async function gerarVideoDaObra(cena: Cena, p: PedidoDaObra): Promise<ArquivoGerado> {
  const st = useProjeto.getState;
  const video = st().video;
  const { largura, altura } = RESOLUCOES[video.formato];
  const dias = st().cronograma ? duracaoObra(st().cronograma!.tarefas) : 0;
  const e = cena.enquadramento();
  const comDrone = p.camera === "drone", comMontagem = p.camera === "montagem";
  const voo = comDrone ? cena.voo() : null;
  const seg = p.segundos;
  // sol real por quadro (ADR-26): a data é a do dia da obra no quadro; no Ciclo, o horário corre
  let diaAtual = 0;
  const ciclo = video.luz === "ciclo";
  const vooCiclo = ciclo ? cena.voo() : null;
  const horaDoVoo = vooCiclo ? cicloDoVoo(vooCiclo) : null;
  const efem = solDoProjeto(st(), 600, diaCivilDaSimulacao(st(), Number.MAX_SAFE_INTEGER)).efemerides;
  const marcasGlobais = { fimConstrucao: 0.3, inicioInterno: 0.5, inicioVoltaFinal: 0.7, fimMovimento: 0.97 };
  const minutosNoQuadro = (i: number, n: number): number | undefined => {
    if (!ciclo) return undefined;
    const t = i / video.fps, uVideo = n > 1 ? i / (n - 1) : 1;
    if (comDrone && horaDoVoo) return horaDoVoo(t / seg);
    if (comMontagem && horaDoVoo && vooCiclo) {
      const m = cenaNoTempo(p.cenas, t, seg);
      if (m.cena.camera === "drone" && m.cena.tipo === "obra") return horaDoVoo(m.cena.percurso === "interno" ? trechoInterno(m.u, vooCiclo, m.fim - m.inicio) : trechoDoVoo(m.cena, m.u, vooCiclo.fimConstrucao));
    }
    return horarioDoVoo(uVideo, marcasGlobais, 0.85, efem);
  };
  const insolacaoAntes = insolacaoLigada();
  definirInsolacaoAtiva(!!video.insolacaoNoVideo && st().aparencia3d === "realista");
  const montagem = comMontagem ? { cenas: p.cenas, enquadramento: e, voo: cena.voo(), cartela: { nome: CLIENTE.nome, slogan: CLIENTE.slogan, secundario: CLIENTE.instagram } } : undefined;
  try {
    return await gerarVideo(cena, {
      saida: p.saida,
      largura,
      altura,
      fps: video.fps,
      segundos: seg,
      diasDeObra: dias,
      nomeBase: p.nomeBase,
      aplicarDia: (d) => {
        diaAtual = d;
        cena.aplicar(camadasPara(st(), cena, d, true));
      },
      aoQuadro: (i, n) => {
        if (st().aparencia3d === "realista") aplicarSol(cena, minutosNoQuadro(i, n), diaCivilDaSimulacao(st(), diaAtual), (video.luz ?? "dia") === "dia");
      },
      maxima: video.qualidade === "maxima" && st().aparencia3d === "realista",
      ...(p.fala ? { apresentadora: { arquivo: p.fala.fonte, cfg: p.fala.cfg } } : {}),
      // só nome e slogan: a linha do produto ficava ilegível no celular (ADR-31); a vinheta fecha com o @
      ...(video.assinatura !== false ? { assinatura: { nome: CLIENTE.nome, slogan: CLIENTE.slogan } } : {}),
      ...(video.vinheta !== false && seg >= 6 ? { vinheta: { nome: CLIENTE.nome, slogan: CLIENTE.slogan, secundario: CLIENTE.instagram } } : {}),
      poseNoTempo: (t) => poseNoTempo(p.roteiro, e, t, seg),
      ...(montagem ? { montagem } : {}),
      ...(voo
        ? {
            quadroLivre: (t: number) => voo.quadro(t / seg),
            diaNoQuadro: (i: number, n: number) => diaDoVoo(n > 1 ? i / (n - 1) : 1, dias, voo.fimConstrucao),
          }
        : {}),
      sinal: p.sinal,
      aoProgredir: p.aoProgredir,
      ...(p.aoCriarCanvas ? { aoCriarCanvas: p.aoCriarCanvas } : {}),
    });
  } finally {
    // volta o sol e a insolação da viewport
    definirInsolacaoAtiva(insolacaoAntes);
    aplicarSol(cena);
  }
}

/** Leva a cena 3D ao segundo `t` de uma montagem (prévia do assistente e do painel Vídeo). */
export function mostrarNaMontagem(cena: Cena, cenas: CenaMontagem[], t: number, segundos: number): void {
  const st = useProjeto.getState();
  const dias = st.cronograma ? duracaoObra(st.cronograma.tarefas) : 0;
  const m = cenaNoTempo(cenas, t, segundos);
  const c = m.cena;
  cena.pararGiro();
  if (c.tipo === "marca") return;
  const voo = c.camera === "drone" ? cena.voo() : null;
  if (voo) cena.posicionarLivre(cena.camera, quadroDoVooNaCena(c, m.u, voo, m.fim - m.inicio));
  else cena.mostrarPose(poseDaCena(c.camera === "drone" ? "orbita" : c.camera, cena.enquadramento(), m.u, c.percurso));
  // a fala no terreno mostra o terreno; a revelação, a obra pronta atrás dela
  st.definirDia((c.tipo === "revelacao" ? 1 : obraNaCena(c, m.u)) * Math.max(dias - 1, 0));
  cena.pedirQuadro();
}
