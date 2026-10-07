// Estado do projeto (Zustand). Geometria pesada fica na cena (rendering/Cena.ts), não aqui.
import { create } from "zustand";
import type { AcaoTarefa, Cronograma, ElementoMeta, Excecao, ModoAnimacao, PoliticaSemTarefa, Regra, Vinculo } from "../types";
import type { PontoRoteiro } from "../rendering/cameras";
import type { Problema } from "../importers/cronograma";
import { aplicarMapeamento, regrasPadrao } from "../fourd/regras";
import { duracaoObra } from "../fourd/simulacao";

export interface ErroVisivel {
  mensagem: string;
  orientacao?: string;
  detalhes?: string | null;
}

export type FormatoVideo = "horizontal" | "vertical" | "quadrado";
export const RESOLUCOES: Record<FormatoVideo, { largura: number; altura: number; rotulo: string }> = {
  horizontal: { largura: 1920, altura: 1080, rotulo: "Horizontal 16:9 (1920 × 1080)" },
  vertical: { largura: 1080, altura: 1920, rotulo: "Vertical 9:16 (1080 × 1920)" },
  quadrado: { largura: 1080, altura: 1080, rotulo: "Quadrado 1:1 (1080 × 1080)" },
};

export interface ConfigVideo {
  formato: FormatoVideo;
  fps: 24 | 30;
  segundos: 15 | 30 | 60 | 90 | 120;
  /** null = roteiro padrão do §21 para a duração escolhida. */
  roteiro: PontoRoteiro[] | null;
}

export interface Estado {
  // modelo
  elementos: ElementoMeta[];
  arquivoModelo: string | null;
  demoModelo: boolean;
  carga: { fracao: number; etapa: string } | null;
  // cronograma e mapeamento
  cronograma: Cronograma | null;
  arquivoCronograma: string | null;
  formatoCronograma: string | null;
  demoCronograma: boolean;
  problemasImportacao: Problema[];
  regras: Regra[];
  excecoes: Excecao[];
  politica: PoliticaSemTarefa;
  vinculos: Map<string, Vinculo[]>;
  // simulação
  dia: number;
  tocando: boolean;
  velocidade: number;
  // interação
  selecionado: string | null;
  modoSelecao: boolean;
  ocultosUsuario: Set<string>;
  tarefaIsolada: string | null;
  painel: "tarefas" | "elemento" | "validacao" | "video";
  erro: ErroVisivel | null;
  // animação e vídeo
  modoAnimacao: ModoAnimacao;
  video: ConfigVideo;
  gerandoVideo: boolean;

  definirModelo(elementos: ElementoMeta[], arquivo: string, demo: boolean): void;
  definirCronograma(c: Cronograma, arquivo: string, formato: string, problemas: Problema[], demo: boolean): void;
  definirProblemasImportacao(p: Problema[]): void;
  definirCarga(c: Estado["carga"]): void;
  definirDia(d: number): void;
  definirTocando(t: boolean): void;
  definirVelocidade(v: number): void;
  selecionar(guid: string | null): void;
  alternarModoSelecao(): void;
  ocultarSelecionado(): void;
  mostrarTodos(): void;
  isolarTarefa(id: string | null): void;
  definirPolitica(p: PoliticaSemTarefa): void;
  excluirDeTarefa(guid: string, taskId: string): void;
  incluirEmTarefa(guid: string, taskId: string, acao: AcaoTarefa): void;
  removerExcecao(guid: string, taskId: string): void;
  definirPainel(p: Estado["painel"]): void;
  mostrarErro(e: ErroVisivel | null): void;
  definirModoAnimacao(m: ModoAnimacao): void;
  definirVideo(v: Partial<ConfigVideo>): void;
  definirGerandoVideo(g: boolean): void;
}

export const useProjeto = create<Estado>((set, get) => {
  const remapear = (parcial: Partial<Estado>) => {
    const s = { ...get(), ...parcial };
    return { ...parcial, vinculos: aplicarMapeamento(s.elementos, s.regras, s.excecoes) };
  };

  return {
    elementos: [],
    arquivoModelo: null,
    demoModelo: false,
    carga: null,
    cronograma: null,
    arquivoCronograma: null,
    formatoCronograma: null,
    demoCronograma: false,
    problemasImportacao: [],
    regras: [],
    excecoes: [],
    politica: "fantasma",
    vinculos: new Map(),
    dia: 0,
    tocando: false,
    velocidade: 1,
    selecionado: null,
    modoSelecao: true,
    ocultosUsuario: new Set(),
    tarefaIsolada: null,
    painel: "tarefas",
    erro: null,
    modoAnimacao: "aparecimento",
    video: { formato: "horizontal", fps: 30, segundos: 30, roteiro: null },
    gerandoVideo: false,

    definirModelo: (elementos, arquivo, demo) =>
      set(remapear({ elementos, arquivoModelo: arquivo, demoModelo: demo, excecoes: [], selecionado: null, ocultosUsuario: new Set(), tarefaIsolada: null, erro: null })),

    definirCronograma: (c, arquivo, formato, problemas, demo) =>
      set(
        remapear({
          cronograma: c,
          arquivoCronograma: arquivo,
          formatoCronograma: formato,
          problemasImportacao: problemas,
          demoCronograma: demo,
          regras: regrasPadrao(c.tarefas),
          excecoes: [],
          dia: 0,
          tocando: false,
          tarefaIsolada: null,
          erro: null,
        }),
      ),

    definirProblemasImportacao: (p) => set({ problemasImportacao: p, painel: "validacao" }),
    definirCarga: (carga) => set({ carga }),
    definirDia: (d) => {
      const fim = Math.max(duracaoObra(get().cronograma?.tarefas ?? []) - 1, 0);
      set({ dia: Math.min(Math.max(d, 0), fim) });
    },
    definirTocando: (tocando) => set({ tocando }),
    definirVelocidade: (velocidade) => set({ velocidade }),
    selecionar: (guid) => set({ selecionado: guid, ...(guid ? { painel: "elemento" as const } : {}) }),
    alternarModoSelecao: () => set((s) => ({ modoSelecao: !s.modoSelecao })),
    ocultarSelecionado: () =>
      set((s) => (s.selecionado ? { ocultosUsuario: new Set([...s.ocultosUsuario, s.selecionado]), selecionado: null } : {})),
    mostrarTodos: () => set({ ocultosUsuario: new Set(), tarefaIsolada: null }),
    isolarTarefa: (id) => set({ tarefaIsolada: id }),
    definirPolitica: (politica) => set({ politica }),

    excluirDeTarefa: (guid, taskId) => {
      const s = get();
      const outras = s.excecoes.filter((x) => !(x.guid === guid && x.taskId === taskId));
      const veioDeInclusao = s.excecoes.some((x) => x.guid === guid && x.taskId === taskId && x.modo === "include");
      const acao = s.vinculos.get(guid)?.find((v) => v.taskId === taskId)?.acao ?? "construct";
      set(remapear({ excecoes: veioDeInclusao ? outras : [...outras, { guid, taskId, acao, modo: "exclude" }] }));
    },
    incluirEmTarefa: (guid, taskId, acao) => {
      const outras = get().excecoes.filter((x) => !(x.guid === guid && x.taskId === taskId));
      set(remapear({ excecoes: [...outras, { guid, taskId, acao, modo: "include" }] }));
    },
    removerExcecao: (guid, taskId) => set(remapear({ excecoes: get().excecoes.filter((x) => !(x.guid === guid && x.taskId === taskId)) })),
    definirPainel: (painel) => set({ painel }),
    mostrarErro: (erro) => set({ erro }),
    definirModoAnimacao: (modoAnimacao) => set({ modoAnimacao }),
    definirVideo: (v) => set((s) => ({ video: { ...s.video, ...v } })),
    definirGerandoVideo: (gerandoVideo) => set({ gerandoVideo, ...(gerandoVideo ? { tocando: false } : {}) }),
  };
});
