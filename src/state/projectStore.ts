// Estado do projeto (Zustand). Geometria pesada fica na cena (rendering/Cena.ts), não aqui.
import type { TrilhaSequencia } from "../app/sequencia";
import { create } from "zustand";
import type { AcaoTarefa, Cronograma, ElementoMeta, Excecao, ModoAnimacao, PoliticaSemTarefa, Regra, Vinculo } from "../types";
import type { PontoRoteiro } from "../rendering/cameras";
import type { ParametrosCasa } from "../bim/parametrico";
import type { Aparencia3D } from "../rendering/aparencia";
import type { Luz } from "../rendering/iluminacao";
import type { ConfigApresentadora } from "../rendering/composicao";
import type { Cena, Passeio } from "../rendering/montagem";
import type { ConfigSol } from "../rendering/cicloDia";
import type { GeoIfc } from "../bim/parseIfc";
import type { FotoObra, PlantaSobreposta, Tarefa, Visao } from "../types";
import type { Problema } from "../importers/cronograma";
import type { DadosObra, DocumentoPlanilha, LinhaFala, LinhaFoto } from "../planilha/tipos";
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
  /** Câmera do vídeo: roteiro de vistas (padrão) ou drone, com voo e passeio pela obra pronta (ADR-23). */
  camera?: "roteiro" | "drone" | "montagem";
  /** Cenas da montagem (ADR-25); null = Roteiro Reels. */
  montagem?: Cena[] | null;
  /** Nome e slogan da marca no canto do vídeo (padrão: ligado). */
  assinatura?: boolean;
  /** Vinheta de abertura e encerramento com a marca (padrão: ligada, ADR-24). */
  vinheta?: boolean;
  /** Luz da cena no realista (ADR-24): dia (padrão), entardecer ou noite. Vale para a viewport também. */
  luz?: Luz;
  /** Sol e orientação (ADR-26): norte e local ajustados na tela; ausentes = os do IFC e do município. */
  sol?: ConfigSol;
  /** Insolação sobre a imagem do vídeo (arco do sol e fachadas ao sol, ADR-26). */
  insolacaoNoVideo?: boolean;
  /** Apresentadora em primeiro plano (ADR-24); o arquivo fica no IndexedDB. null = sem apresentadora. */
  apresentadora?: ConfigApresentadora | null;
  /** Qualidade do vídeo (ADR-24): máxima renderiza a 1,5× e reduz (mais lento). */
  qualidade?: "normal" | "maxima";
  /** Passeio final no vídeo do assistente (ADR-32): externo (padrão), interno ou ambos. */
  passeio?: Passeio;
  /** Ordem dos itens do vídeo do assistente (ids: "voz:…", "foto:…", "obra"), ajustada no Conferir (ADR-34). */
  sequencia?: string[];
  /** Duração de cada foto no vídeo (s), pelo id. */
  duracoesFoto?: Record<string, number>;
  /** Trilhas sonoras: onde cada uma entra e o volume (ADR-34). */
  trilhas?: TrilhaSequencia[];
}

/** Tarefa em edição, com datas absolutas (dia civil). */
export interface TarefaEditada {
  id: string;
  nome: string;
  categoria: string;
  inicio: number;
  fim: number;
  /** Dados reais (ADR-13), em dias civis; undefined = não informado. */
  inicioReal?: number;
  fimReal?: number;
  avanco?: number;
  pavimento?: string;
}

/** Tarefas com datas absolutas (dia civil), inclusive as reais. */
const absolutas = (c: Cronograma) =>
  c.tarefas.map((x) => ({
    ...x,
    ini: x.ini + c.inicio,
    fim: x.fim + c.inicio,
    realIni: x.realIni === undefined ? undefined : x.realIni + c.inicio,
    realFim: x.realFim === undefined ? undefined : x.realFim + c.inicio,
  }));

/** O que a planilha única traz além do cronograma, do modelo e do vídeo (ADR-29). */
export interface DadosPlanilha {
  arquivo: string;
  obra: DadosObra;
  falas: LinhaFala[];
  fotos: LinhaFoto[];
  documento: DocumentoPlanilha;
  /** Aba Vínculos: exceções do IFC citado, reaplicadas quando ele é carregado. */
  vinculos: Excecao[];
  /** Aba Modelo: a casa usada sem IFC (ou quando o IFC citado não está à mão). */
  modelo?: ParametrosCasa | null;
}

export interface Estado {
  // projeto (ADR-11)
  projetoId: string | null;
  nomeProjeto: string | null;
  salvoEm: string | null;
  persistencia: boolean | null;
  tipoModelo: "IFC" | "PARAMETRICO" | null;
  parametros: ParametrosCasa | null;
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
  painel: "tarefas" | "elemento" | "validacao" | "obra" | "video";
  erro: ErroVisivel | null;
  // animação e vídeo
  modoAnimacao: ModoAnimacao;
  video: ConfigVideo;
  gerandoVideo: boolean;
  // acompanhamento (ADR-13, ADR-14)
  visao: Visao;
  /** Aparência da cena, do vídeo e do relatório (ADR-21). */
  aparencia3d: Aparencia3D;
  /** Local e norte lidos do IFC (ADR-26). */
  geoIfc: GeoIfc;
  fotos: FotoObra[];
  mostrarFotos: boolean;
  planta: PlantaSobreposta | null;
  /** Dados da planilha única (ADR-29) que não têm lugar próprio no estado: obra, falas, fotos citadas e documento. */
  planilha: DadosPlanilha | null;

  definirModelo(elementos: ElementoMeta[], arquivo: string, demo: boolean, tipo?: "IFC" | "PARAMETRICO", parametros?: ParametrosCasa | null): void;
  definirProjeto(p: Partial<Pick<Estado, "projetoId" | "nomeProjeto" | "salvoEm" | "persistencia">>): void;
  /** Restaura cronograma, exceções e preferências de um projeto salvo. */
  restaurar(r: Pick<Estado, "cronograma" | "arquivoCronograma" | "excecoes" | "politica" | "modoAnimacao" | "video" | "demoCronograma" | "fotos" | "planta"> & { aparencia3d?: Aparencia3D; planilha?: DadosPlanilha | null }): void;
  /** Inclui ou altera uma tarefa; devolve a mensagem de erro, se houver. */
  salvarTarefa(t: TarefaEditada, idOriginal: string | null): string | null;
  excluirTarefa(id: string): void;
  reiniciar(): void;
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
  definirVisao(v: Visao): void;
  definirAparencia3d(a: Aparencia3D): void;
  adicionarFotos(f: FotoObra[]): void;
  atualizarFoto(id: string, p: Partial<FotoObra>): void;
  removerFoto(id: string): void;
  definirMostrarFotos(m: boolean): void;
  definirPlanta(p: PlantaSobreposta | null): void;
  ajustarPlanta(p: Partial<PlantaSobreposta>): void;
}

/** Estado inicial (sem ações), usado por reiniciar(). */
function INICIAL_COMPLETO(): Partial<Estado> {
  return {
    projetoId: null, nomeProjeto: null, salvoEm: null, tipoModelo: null, parametros: null,
    elementos: [], arquivoModelo: null, demoModelo: false, carga: null,
    cronograma: null, arquivoCronograma: null, formatoCronograma: null, demoCronograma: false, problemasImportacao: [],
    regras: [], excecoes: [], politica: "fantasma", dia: 0, tocando: false,
    selecionado: null, ocultosUsuario: new Set(), tarefaIsolada: null, painel: "tarefas", erro: null,
    modoAnimacao: "progressivo", video: { formato: "horizontal", fps: 30, segundos: 30, roteiro: null }, gerandoVideo: false,
    visao: "planejado", aparencia3d: "realista", geoIfc: {}, fotos: [], mostrarFotos: true, planta: null, planilha: null,
  };
}

/** Recria o cronograma a partir de tarefas com datas absolutas, preservando as exceções das tarefas que continuam. */
function reconstruir(lista: (Omit<Tarefa, "realIni" | "realFim"> & { realIni?: number; realFim?: number })[], s: Estado, renomeada: [string, string] | null): Partial<Estado> {
  if (lista.length === 0) {
    return { cronograma: null, regras: [], excecoes: [], vinculos: aplicarMapeamento(s.elementos, [], []), dia: 0, tarefaIsolada: null };
  }
  const inicio = Math.min(...lista.map((x) => x.ini));
  const tarefas: Tarefa[] = lista.map((x) => {
    const t: Tarefa = { id: x.id, nome: x.nome, categoria: x.categoria, ini: x.ini - inicio, fim: x.fim - inicio };
    if (x.progresso !== undefined) t.progresso = x.progresso;
    if (x.realIni !== undefined) t.realIni = x.realIni - inicio;
    if (x.realFim !== undefined) t.realFim = x.realFim - inicio;
    if (x.avanco !== undefined) t.avanco = x.avanco;
    if (x.pavimento) t.pavimento = x.pavimento;
    return t;
  });
  const ids = new Set(tarefas.map((x) => x.id));
  const excecoes = s.excecoes
    .map((x) => (renomeada && x.taskId === renomeada[0] ? { ...x, taskId: renomeada[1] } : x))
    .filter((x) => ids.has(x.taskId));
  const regras = regrasPadrao(tarefas);
  // editar uma estimativa não a transforma em cronograma executivo (ADR-18)
  const cronograma = s.cronograma?.estimado ? { inicio, tarefas, estimado: true } : { inicio, tarefas };
  const fim = Math.max(...tarefas.map((x) => x.fim));
  return {
    cronograma,
    arquivoCronograma: s.arquivoCronograma ?? "editado na tela",
    regras,
    excecoes,
    vinculos: aplicarMapeamento(s.elementos, regras, excecoes),
    dia: Math.min(s.dia, fim),
    tarefaIsolada: s.tarefaIsolada && ids.has(s.tarefaIsolada) ? s.tarefaIsolada : null,
  };
}

export const useProjeto = create<Estado>((set, get) => {
  const remapear = (parcial: Partial<Estado>) => {
    const s = { ...get(), ...parcial };
    return { ...parcial, vinculos: aplicarMapeamento(s.elementos, s.regras, s.excecoes) };
  };

  return {
    projetoId: null,
    nomeProjeto: null,
    salvoEm: null,
    persistencia: null,
    tipoModelo: null,
    parametros: null,
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
    modoAnimacao: "progressivo",
    video: { formato: "horizontal", fps: 30, segundos: 30, roteiro: null },
    gerandoVideo: false,
    visao: "planejado",
    aparencia3d: "realista",
    geoIfc: {},
    fotos: [],
    mostrarFotos: true,
    planta: null,
    planilha: null,

    definirModelo: (elementos, arquivo, demo, tipo = "IFC", parametros = null) =>
      set(remapear({ elementos, arquivoModelo: arquivo, demoModelo: demo, tipoModelo: tipo, parametros, excecoes: [], selecionado: null, ocultosUsuario: new Set(), tarefaIsolada: null, erro: null })),

    definirProjeto: (p) => set(p),

    restaurar: (r) =>
      set(
        remapear({
          ...r,
          planilha: r.planilha ?? null,
          regras: r.cronograma ? regrasPadrao(r.cronograma.tarefas) : [],
          problemasImportacao: [],
          dia: 0,
          tocando: false,
          formatoCronograma: r.cronograma ? "projeto salvo" : null,
        }),
      ),

    salvarTarefa: (t, idOriginal) => {
      const s = get();
      const nome = t.nome.trim();
      const id = t.id.trim();
      if (!id) return "Informe o ID da tarefa.";
      if (!nome) return "Informe o nome da tarefa.";
      if (!Number.isFinite(t.inicio) || !Number.isFinite(t.fim)) return "Informe as datas de início e fim.";
      if (t.fim < t.inicio) return "A tarefa termina antes de começar.";
      if (t.fimReal !== undefined && t.inicioReal === undefined) return "Informe o início real antes do fim real.";
      if (t.fimReal !== undefined && t.inicioReal !== undefined && t.fimReal < t.inicioReal) return "O fim real é anterior ao início real.";
      if (t.avanco !== undefined && !(t.avanco >= 0 && t.avanco <= 1)) return "O avanço físico deve ficar entre 0 e 100%.";
      const atuais = s.cronograma ? absolutas(s.cronograma) : [];
      if (atuais.some((x) => x.id === id && x.id !== idOriginal)) return `Já existe uma tarefa com o ID "${id}".`;
      const nova = { id, nome, categoria: t.categoria.trim().toLowerCase(), ini: t.inicio, fim: t.fim, realIni: t.inicioReal, realFim: t.fimReal, avanco: t.avanco, pavimento: t.pavimento?.trim() || undefined };
      const lista = idOriginal ? atuais.map((x) => (x.id === idOriginal ? { ...x, ...nova } : x)) : [...atuais, nova];
      set(reconstruir(lista, s, idOriginal && idOriginal !== id ? [idOriginal, id] : null));
      return null;
    },

    excluirTarefa: (id) => {
      const s = get();
      if (!s.cronograma) return;
      const lista = absolutas(s.cronograma).filter((x) => x.id !== id);
      set(reconstruir(lista, s, null));
    },

    reiniciar: () => set({ ...INICIAL_COMPLETO(), vinculos: new Map() }),

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
    definirVisao: (visao) => set({ visao }),
    definirAparencia3d: (aparencia3d) => set({ aparencia3d }),
    adicionarFotos: (f) => set((s) => ({ fotos: [...s.fotos, ...f].sort((a, b) => a.dia - b.dia || a.arquivo.localeCompare(b.arquivo)) })),
    atualizarFoto: (id, p) => set((s) => ({ fotos: s.fotos.map((f) => (f.id === id ? { ...f, ...p } : f)).sort((a, b) => a.dia - b.dia || a.arquivo.localeCompare(b.arquivo)) })),
    removerFoto: (id) => set((s) => ({ fotos: s.fotos.filter((f) => f.id !== id) })),
    definirMostrarFotos: (mostrarFotos) => set({ mostrarFotos }),
    definirPlanta: (planta) => set({ planta }),
    ajustarPlanta: (p) => set((s) => (s.planta ? { planta: { ...s.planta, ...p } } : {})),
  };
});
