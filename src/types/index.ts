// Modelo interno do Construction 4D Studio (especificação §2, ADR-02, ADR-03, ADR-05).

/** Metadados preservados de cada elemento IFC com geometria (§11). */
export interface ElementoMeta {
  guid: string;
  expressId: number;
  ifcType: string; // ex.: "IfcWall"
  predefinedType: string | null; // ex.: "BASESLAB"
  objectType: string | null;
  nome: string;
  pavimento: string | null;
  material: string | null;
}

/** Caixa envolvente em coordenadas da cena (Y para cima). */
export interface Caixa {
  min: [number, number, number];
  max: [number, number, number];
}

/** Tarefa do cronograma; datas como índice de dia a partir do início da obra, fim inclusivo. */
export interface Tarefa {
  id: string;
  nome: string;
  categoria: string;
  ini: number;
  fim: number;
  progresso?: number; // informativo; a simulação planejada o ignora
  /** Dados reais (ADR-13): índices de dia como ini/fim; avanço físico 0..1. */
  realIni?: number;
  realFim?: number;
  avanco?: number;
}

/** Foto da obra (ADR-14). O arquivo (Blob) fica fora do estado, por id. */
export interface FotoObra {
  id: string;
  arquivo: string;
  tipo: string;
  dia: number; // dia civil
  local: string;
  descricao: string;
  etapa: string | null; // ID da tarefa
}

/** Planta sobreposta (§29): só referência visual. */
export interface PlantaSobreposta {
  arquivo: string;
  tipo: string;
  larguraM: number; // largura da imagem em metros
  x: number;
  z: number;
  rotacaoGraus: number;
  opacidade: number;
  visivel: boolean;
  proporcao: number; // altura ÷ largura da imagem
}

export type Visao = "planejado" | "real" | "comparar";
export type Desvio = "atrasado" | "adiantado" | "em-dia";

export interface Cronograma {
  /** Início da obra como dia civil (dias desde 1970-01-01, sem fuso). */
  inicio: number;
  tarefas: Tarefa[];
}

export type AcaoTarefa = "construct" | "finish" | "install" | "temporary" | "remove";

export interface FiltroRegra {
  ifcType?: string[];
  predefinedType?: string[];
  objectType?: string[];
  pavimento?: string[];
  nomeContem?: string;
}

/** Regra que liga elementos a uma tarefa; sobrevive à reexportação do IFC. */
export interface Regra {
  taskId: string;
  acao: AcaoTarefa;
  onde: FiltroRegra;
}

/** Exceção manual por elemento. */
export interface Excecao {
  taskId: string;
  guid: string;
  acao: AcaoTarefa;
  modo: "include" | "exclude";
}

export type PoliticaSemTarefa = "fantasma" | "oculto" | "visivel";

export type Fase = "oculto" | "em-execucao" | "concluido" | "fantasma";

/** Aparência construtiva: "base" é a cor do IFC; as demais vêm da categoria do acabamento concluído. */
export type Aparencia = string;

export interface EstadoElemento {
  visivel: boolean;
  fase: Fase;
  aparencia: Aparencia;
  progresso: number; // 0..1 dentro da tarefa em execução
  /** Avanço (0..1) da tarefa que faz o elemento surgir, com dia fracionário; 1 depois dela. */
  surgimento: number;
}

export type ModoAnimacao = "progressivo" | "aparecimento" | "fade" | "crescimento" | "fases";

/** Vínculo resolvido: elemento → tarefa, com a ação e a origem. */
export interface Vinculo {
  taskId: string;
  acao: AcaoTarefa;
  origem: "regra" | "excecao";
}
