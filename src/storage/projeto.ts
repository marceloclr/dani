// Registro de projeto e arquivo .4dstudio (ADR-11, §38). Sem DOM nem IndexedDB: roda no Node.
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type { ParametrosCasa } from "../bim/parametrico";
import type { ConfigVideo } from "../state/projectStore";
import type { Cronograma, Excecao, ModoAnimacao, PoliticaSemTarefa } from "../types";

export const VERSAO_FORMATO = 1;

export interface RegistroProjeto {
  id: string;
  nome: string;
  criadoEm: string;
  atualizadoEm: string;
  modelo: { tipo: "IFC"; arquivo: string; tamanho: number } | { tipo: "PARAMETRICO"; parametros: ParametrosCasa };
  cronograma: Cronograma | null;
  arquivoCronograma: string | null;
  excecoes: Excecao[];
  politica: PoliticaSemTarefa;
  modoAnimacao: ModoAnimacao;
  video: ConfigVideo;
  demo: boolean;
}

export class ErroProjeto extends Error {
  constructor(mensagem: string, readonly detalhes?: string) {
    super(mensagem);
  }
}

const json = (o: unknown) => strToU8(JSON.stringify(o, null, 2));

/** Monta o .4dstudio: ZIP com project, schedule, mappings, settings e o IFC em assets/. */
export function exportar4dstudio(r: RegistroProjeto, ifc: Uint8Array | null): Uint8Array {
  const arquivos: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    "project.json": json({
      formato: "4dstudio",
      versao: VERSAO_FORMATO,
      projeto: { id: r.id, nome: r.nome, criadoEm: r.criadoEm, atualizadoEm: r.atualizadoEm, demo: r.demo },
      modelo: r.modelo,
    }),
    "schedule.json": json({ arquivo: r.arquivoCronograma, cronograma: r.cronograma }),
    "mappings.json": json({ excecoes: r.excecoes, politica: r.politica }),
    "settings.json": json({ modoAnimacao: r.modoAnimacao, video: r.video }),
  };
  if (r.modelo.tipo === "IFC") {
    if (!ifc) throw new ErroProjeto("O arquivo IFC do projeto não foi encontrado.");
    arquivos["assets/modelo.ifc"] = ifc;
  }
  return zipSync(arquivos, { level: 6 });
}

function lerJson<T>(arquivos: Record<string, Uint8Array>, nome: string): T {
  const a = arquivos[nome];
  if (!a) throw new ErroProjeto("O arquivo .4dstudio está incompleto.", `Falta ${nome}.`);
  try {
    return JSON.parse(strFromU8(a)) as T;
  } catch (e) {
    throw new ErroProjeto("O arquivo .4dstudio está corrompido.", `${nome}: ${(e as Error).message}`);
  }
}

/** Lê e valida um .4dstudio. O id e as datas do registro devem ser renovados por quem importa. */
export function importar4dstudio(bytes: Uint8Array): { registro: Omit<RegistroProjeto, "id">; ifc: Uint8Array | null } {
  let arquivos: Record<string, Uint8Array>;
  try {
    arquivos = unzipSync(bytes);
  } catch (e) {
    throw new ErroProjeto("Este arquivo não é um projeto .4dstudio.", String(e));
  }
  const proj = lerJson<{ formato?: string; versao?: number; projeto?: { nome?: string; criadoEm?: string; atualizadoEm?: string; demo?: boolean }; modelo?: RegistroProjeto["modelo"] }>(arquivos, "project.json");
  if (proj.formato !== "4dstudio" || !proj.projeto || !proj.modelo) throw new ErroProjeto("Este arquivo não é um projeto .4dstudio.", "project.json sem formato, projeto ou modelo.");
  if ((proj.versao ?? 0) > VERSAO_FORMATO) throw new ErroProjeto("Este projeto foi salvo por uma versão mais nova do Construction 4D Studio.", `Versão ${proj.versao}.`);
  const sch = lerJson<{ arquivo?: string | null; cronograma?: Cronograma | null }>(arquivos, "schedule.json");
  const map = lerJson<{ excecoes?: Excecao[]; politica?: PoliticaSemTarefa }>(arquivos, "mappings.json");
  const set = lerJson<{ modoAnimacao?: ModoAnimacao; video?: ConfigVideo }>(arquivos, "settings.json");
  const ifc = arquivos["assets/modelo.ifc"] ?? null;
  if (proj.modelo.tipo === "IFC" && !ifc) throw new ErroProjeto("O arquivo .4dstudio está incompleto.", "Falta assets/modelo.ifc.");
  if (proj.modelo.tipo !== "IFC" && proj.modelo.tipo !== "PARAMETRICO") throw new ErroProjeto("Tipo de modelo desconhecido no .4dstudio.", JSON.stringify(proj.modelo));
  const c = sch.cronograma ?? null;
  if (c && (!Array.isArray(c.tarefas) || typeof c.inicio !== "number")) throw new ErroProjeto("O cronograma do .4dstudio é inválido.");
  return {
    registro: {
      nome: proj.projeto.nome || "Projeto importado",
      criadoEm: proj.projeto.criadoEm ?? new Date().toISOString(),
      atualizadoEm: proj.projeto.atualizadoEm ?? new Date().toISOString(),
      modelo: proj.modelo,
      cronograma: c,
      arquivoCronograma: sch.arquivo ?? null,
      excecoes: Array.isArray(map.excecoes) ? map.excecoes : [],
      politica: map.politica ?? "fantasma",
      modoAnimacao: set.modoAnimacao ?? "aparecimento",
      video: set.video ?? { formato: "horizontal", fps: 30, segundos: 30, roteiro: null },
      demo: !!proj.projeto.demo,
    },
    ifc,
  };
}
