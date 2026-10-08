// Planilha única do projeto (ADR-29): o que cada aba guarda, já interpretado.
import type { ParametrosCasa } from "../bim/parametrico";
import type { AcaoTarefa, Cronograma, Excecao, ModoAnimacao } from "../types";
import type { Recorte } from "../rendering/composicao";
import type { Luz } from "../rendering/iluminacao";
import type { Aparencia3D } from "../rendering/aparencia";
import type { FormatoVideo } from "../state/projectStore";

/** Aba Obra. */
export interface DadosObra {
  nome: string;
  proprietario: string;
  endereco: string;
  /** Id do município (src/fourd/feriados.ts) ou null se não informado. */
  municipio: string | null;
  responsavel: string;
  crea: string;
  /** Dia civil do status do documento; null = hoje. */
  dataReferencia: number | null;
  /** Nome do IFC citado; null = casa gerada pela aba Modelo. */
  arquivoIfc: string | null;
  /** Rumo da fachada frontal em graus; null = o do IFC. */
  rumoFrente: number | null;
  descricao: string;
}

/** Onde a fala entra no vídeo (ADR-30). */
export type CenaFala = "terreno" | "sobre-obra" | "voz";

/** Aba Falas: um vídeo da engenheira por linha, na ordem do vídeo final. */
export interface LinhaFala {
  ordem: number;
  arquivo: string;
  assunto: string;
  cena: CenaFala;
  recorte: Recorte;
  /** Corte do clipe em segundos; undefined = do início / até o fim. */
  inicioS?: number;
  fimS?: number;
}

/** Aba Fotos (as mesmas colunas do fotos.csv). */
export interface LinhaFoto {
  arquivo: string;
  dia: number | null;
  local: string;
  descricao: string;
  etapa: string | null;
}

/** Aba Vídeo. Campos ausentes ficam com o padrão do app. */
export interface VideoPlanilha {
  formato?: FormatoVideo;
  /** null = soma das falas (ou 30 s sem falas). */
  segundos?: number | null;
  fps?: 24 | 30;
  qualidade?: "normal" | "maxima";
  aparencia?: Aparencia3D;
  luz?: Luz;
  animacao?: ModoAnimacao;
  assinatura?: boolean;
}

export const SECOES_DOCUMENTO = ["ficha", "etapas", "imagens", "fotos", "video"] as const;
export type SecaoDocumento = (typeof SECOES_DOCUMENTO)[number];

/** Aba Documento. */
export interface DocumentoPlanilha {
  titulo: string;
  destinatario: string;
  observacoes: string;
  secoes: Record<SecaoDocumento, boolean>;
}

export interface ProblemaPlanilha {
  nivel: "erro" | "aviso";
  aba: string;
  linha?: number;
  mensagem: string;
}

export interface ProjetoPlanilha {
  obra: DadosObra;
  /** Aba Modelo; usada quando não há IFC. */
  modelo: ParametrosCasa | null;
  cronograma: Cronograma | null;
  vinculos: Excecao[];
  falas: LinhaFala[];
  fotos: LinhaFoto[];
  video: VideoPlanilha;
  documento: DocumentoPlanilha;
}

export const OBRA_VAZIA: DadosObra = {
  nome: "", proprietario: "", endereco: "", municipio: null, responsavel: "", crea: "", dataReferencia: null, arquivoIfc: null, rumoFrente: null, descricao: "",
};

export const DOCUMENTO_PADRAO: DocumentoPlanilha = {
  titulo: "Relatório de acompanhamento da obra",
  destinatario: "",
  observacoes: "",
  secoes: { ficha: true, etapas: true, imagens: true, fotos: true, video: true },
};

/** Rótulos usados na planilha (iguais às listas de tools/gerar_planilha_modelo.py). */
export const ROTULO_ACAO: Record<AcaoTarefa, string> = { construct: "construção", finish: "acabamento", install: "instalação", temporary: "temporário", remove: "remoção" };
export const ROTULO_CENA: Record<CenaFala, string> = { terreno: "terreno", "sobre-obra": "sobre a obra", voz: "só a voz" };
export const ROTULO_RECORTE: Record<Recorte, string> = { ia: "IA", verde: "fundo verde" };
export const ROTULO_FORMATO: Record<FormatoVideo, string> = { vertical: "vertical 9:16", horizontal: "horizontal 16:9", quadrado: "quadrado 1:1" };
export const ROTULO_ANIMACAO: Record<ModoAnimacao, string> = { progressivo: "Progressivo", aparecimento: "Aparecimento", fade: "Fade-in", crescimento: "Crescimento", fases: "Por fases" };
export const ROTULO_APARENCIA: Record<Aparencia3D, string> = { realista: "Realista", tecnica: "Técnica" };
export const ROTULO_COBERTURA = { "duas-aguas": "duas águas", "uma-agua": "uma água", plana: "plana" } as const;

/** Campos das abas de campo e valor, na ordem da planilha. */
export const CAMPOS_OBRA = {
  nome: "Nome da obra",
  proprietario: "Proprietário",
  endereco: "Endereço",
  municipio: "Município",
  responsavel: "Responsável técnica",
  crea: "CREA",
  dataReferencia: "Data de referência",
  arquivoIfc: "Arquivo IFC",
  rumoFrente: "Rumo da fachada frontal (graus)",
  descricao: "Descrição",
} as const;
export const CAMPOS_MODELO = {
  terrenoLargura: "Largura do terreno (m)",
  terrenoComprimento: "Comprimento do terreno (m)",
  area: "Área construída (m²)",
  pavimentos: "Pavimentos",
  peDireito: "Pé-direito (m)",
  cobertura: "Cobertura",
} as const;
export const CAMPOS_VIDEO = {
  formato: "Formato",
  segundos: "Duração (s)",
  fps: "Quadros por segundo",
  qualidade: "Qualidade",
  aparencia: "Aparência",
  luz: "Luz",
  animacao: "Animação",
  assinatura: "Marca no canto",
} as const;
export const CAMPOS_DOCUMENTO = {
  titulo: "Título",
  destinatario: "Destinatário",
  observacoes: "Observações",
  ficha: "Ficha da obra",
  etapas: "Etapas",
  imagens: "Linha do tempo em imagens",
  fotos: "Fotos da obra",
  video: "Referência ao vídeo",
} as const;

export const ABAS = { obra: "Obra", modelo: "Modelo", cronograma: "Cronograma", vinculos: "Vínculos", falas: "Falas", fotos: "Fotos", video: "Vídeo", documento: "Documento" } as const;
