// Importação de cronograma em CSV ou JSON (§12, ADR-05).
import Papa from "papaparse";
import type { Cronograma, Tarefa } from "../types";
import { lerData } from "../fourd/tempo";
import { decodificar } from "./texto";

export interface Problema {
  nivel: "erro" | "aviso";
  mensagem: string;
  linha?: number;
}

export interface ResultadoImportacao {
  cronograma: Cronograma | null;
  problemas: Problema[];
  formato: string;
}

/** Linha bruta, já com nomes de coluna normalizados. */
interface LinhaBruta {
  id?: string;
  nome?: string;
  inicio?: string;
  fim?: string;
  categoria?: string;
  progresso?: string;
  inicioReal?: string;
  fimReal?: string;
  avanco?: string;
  pavimento?: string;
}

const ALIASES: Record<keyof LinhaBruta, string[]> = {
  id: ["id", "codigo", "código", "cod"],
  nome: ["nome", "name", "tarefa", "atividade", "descricao", "descrição"],
  inicio: ["inicio", "início", "start", "startdate", "data_inicio", "datainicio"],
  fim: ["fim", "termino", "término", "end", "enddate", "data_fim", "datafim"],
  categoria: ["categoria", "category", "etapa", "fase"],
  progresso: ["progresso", "progress"],
  inicioReal: ["inicio_real", "início_real", "inicioreal", "inícioreal", "realstart", "actualstart", "actual_start"],
  fimReal: ["fim_real", "fimreal", "termino_real", "término_real", "realend", "actualend", "actual_end"],
  avanco: ["avanco", "avanço", "avanco_fisico", "avanço_físico", "avanco_real", "percentcomplete"],
  pavimento: ["pavimento", "andar", "storey", "nivel", "nível", "level"],
};

/** "45%", "0,45", "0.45" ou "45" → 0,45. Vazio → undefined; inválido → NaN. */
export function lerAvanco(texto: string | undefined): number | undefined {
  if (texto === undefined || texto.trim() === "") return undefined;
  const t = texto.trim().replace("%", "").replace(",", ".");
  const n = Number(t);
  if (!Number.isFinite(n)) return NaN;
  const f = texto.includes("%") || n > 1 ? n / 100 : n;
  return f >= 0 && f <= 1 ? f : NaN;
}

const chave = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");

/** A coluna guarda datas (início ou fim)? Usado pelo importador de XLSX. */
export const ehColunaData = (nome: string) => [...ALIASES.inicio, ...ALIASES.fim, ...ALIASES.inicioReal, ...ALIASES.fimReal].includes(chave(nome));

function normalizarLinha(obj: Record<string, unknown>): LinhaBruta {
  const out: LinhaBruta = {};
  for (const [k, v] of Object.entries(obj)) {
    const c = chave(k);
    for (const [campo, nomes] of Object.entries(ALIASES) as [keyof LinhaBruta, string[]][]) {
      if (nomes.includes(c) && out[campo] === undefined && v !== null && v !== undefined) out[campo] = String(v).trim();
    }
  }
  return out;
}

/** Converte linhas brutas em cronograma, acumulando os problemas encontrados (§41). */
export function montarCronograma(linhas: LinhaBruta[], primeiraLinha = 2): { cronograma: Cronograma | null; problemas: Problema[] } {
  const problemas: Problema[] = [];
  const brutas: { id: string; nome: string; categoria: string; ini: number; fim: number; progresso?: number; realIni?: number; realFim?: number; avanco?: number; pavimento?: string; linha: number }[] = [];
  const vistos = new Set<string>();

  linhas.forEach((l, i) => {
    const linha = primeiraLinha + i;
    if (!l.id && !l.nome && !l.inicio && !l.fim) return; // linha vazia
    const id = l.id ?? "";
    if (!id) problemas.push({ nivel: "erro", linha, mensagem: `Linha ${linha}: tarefa sem ID.` });
    else if (vistos.has(id)) problemas.push({ nivel: "erro", linha, mensagem: `Linha ${linha}: ID "${id}" repetido.` });
    const ini = l.inicio ? lerData(l.inicio) : null;
    const fim = l.fim ? lerData(l.fim) : null;
    if (ini === null) problemas.push({ nivel: "erro", linha, mensagem: `Linha ${linha}: data de início inválida ("${l.inicio ?? ""}"). Use aaaa-mm-dd ou dd/mm/aaaa.` });
    if (fim === null) problemas.push({ nivel: "erro", linha, mensagem: `Linha ${linha}: data de fim inválida ("${l.fim ?? ""}"). Use aaaa-mm-dd ou dd/mm/aaaa.` });
    if (ini !== null && fim !== null && fim < ini) problemas.push({ nivel: "erro", linha, mensagem: `Linha ${linha}: a tarefa "${l.nome ?? id}" termina antes de começar.` });
    if (!id || vistos.has(id) || ini === null || fim === null || fim < ini) {
      if (id) vistos.add(id);
      return;
    }
    vistos.add(id);
    const progresso = l.progresso ? Number(l.progresso.replace(",", ".")) : undefined;
    // dados reais (ADR-13): opcionais, mas se vierem precisam ser válidos
    const realIni = l.inicioReal ? lerData(l.inicioReal) : undefined;
    const realFim = l.fimReal ? lerData(l.fimReal) : undefined;
    const avanco = lerAvanco(l.avanco);
    if (realIni === null) problemas.push({ nivel: "erro", linha, mensagem: `Linha ${linha}: início real inválido ("${l.inicioReal}").` });
    if (realFim === null) problemas.push({ nivel: "erro", linha, mensagem: `Linha ${linha}: fim real inválido ("${l.fimReal}").` });
    if (realFim != null && realIni == null) problemas.push({ nivel: "erro", linha, mensagem: `Linha ${linha}: há fim real sem início real.` });
    if (realIni != null && realFim != null && realFim < realIni) problemas.push({ nivel: "erro", linha, mensagem: `Linha ${linha}: o fim real é anterior ao início real.` });
    if (Number.isNaN(avanco)) problemas.push({ nivel: "erro", linha, mensagem: `Linha ${linha}: avanço inválido ("${l.avanco}"). Use 0 a 100%.` });
    brutas.push({
      id, nome: l.nome || id, categoria: (l.categoria ?? "").toLowerCase(), ini, fim,
      progresso: Number.isFinite(progresso) ? progresso : undefined,
      realIni: realIni ?? undefined, realFim: realFim ?? undefined, avanco: Number.isNaN(avanco) ? undefined : avanco,
      pavimento: l.pavimento?.trim() || undefined, linha,
    });
  });

  if (brutas.length === 0) {
    if (!problemas.some((p) => p.nivel === "erro")) problemas.push({ nivel: "erro", mensagem: "O arquivo não tem nenhuma tarefa." });
    return { cronograma: null, problemas };
  }
  if (problemas.some((p) => p.nivel === "erro")) return { cronograma: null, problemas };

  const inicio = Math.min(...brutas.map((b) => b.ini));
  const tarefas: Tarefa[] = brutas.map((b) => {
    const t: Tarefa = { id: b.id, nome: b.nome, categoria: b.categoria, ini: b.ini - inicio, fim: b.fim - inicio };
    if (b.progresso !== undefined) t.progresso = b.progresso;
    if (b.realIni !== undefined) t.realIni = b.realIni - inicio;
    if (b.realFim !== undefined) t.realFim = b.realFim - inicio;
    if (b.avanco !== undefined) t.avanco = b.avanco;
    if (b.pavimento) t.pavimento = b.pavimento;
    return t;
  });
  return { cronograma: { inicio, tarefas }, problemas };
}

export function importarCsv(bytes: Uint8Array): ResultadoImportacao {
  const { texto, codificacao } = decodificar(bytes);
  const r = Papa.parse<Record<string, string>>(texto, { header: true, skipEmptyLines: "greedy", delimitersToGuess: [";", ",", "\t"] });
  const problemas: Problema[] = [];
  const colunas = (r.meta.fields ?? []).map(chave);
  for (const campo of ["id", "inicio", "fim"] as const) {
    if (!ALIASES[campo].some((a) => colunas.includes(a))) {
      problemas.push({ nivel: "erro", mensagem: `Falta a coluna "${campo}". O CSV precisa de: id, nome, inicio, fim, categoria.` });
    }
  }
  if (problemas.length) return { cronograma: null, problemas, formato: "CSV" };
  const res = montarCronograma(r.data.map(normalizarLinha));
  const sep = r.meta.delimiter === "\t" ? "tabulação" : `"${r.meta.delimiter}"`;
  return { ...res, formato: `CSV (separador ${sep}, ${codificacao})` };
}

export function importarJson(bytes: Uint8Array): ResultadoImportacao {
  const { texto } = decodificar(bytes);
  let dados: unknown;
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    return { cronograma: null, formato: "JSON", problemas: [{ nivel: "erro", mensagem: `O JSON está malformado: ${(e as Error).message}` }] };
  }
  // aceita [ ... ], { tarefas: [...] }, { tasks: [...] } ou { schedule: { tasks: [...] } } (§8)
  const d = dados as Record<string, unknown>;
  const lista = Array.isArray(dados)
    ? dados
    : (d?.tarefas ?? d?.tasks ?? (d?.schedule as Record<string, unknown> | undefined)?.tasks ?? (d?.cronograma as Record<string, unknown> | undefined)?.tarefas);
  if (!Array.isArray(lista)) {
    return { cronograma: null, formato: "JSON", problemas: [{ nivel: "erro", mensagem: 'O JSON precisa ser uma lista de tarefas ou ter o campo "tarefas".' }] };
  }
  return { ...montarCronograma(lista.map((o) => normalizarLinha(o as Record<string, unknown>)), 1), formato: "JSON" };
}

/** Linhas já lidas de uma planilha (XLSX), com datas convertidas para texto. */
export function importarLinhas(linhas: Record<string, unknown>[], formato: string): ResultadoImportacao {
  const colunas = new Set(linhas.flatMap((l) => Object.keys(l)).map(chave));
  const problemas: Problema[] = [];
  for (const campo of ["id", "inicio", "fim"] as const) {
    if (!ALIASES[campo].some((a) => colunas.has(a))) problemas.push({ nivel: "erro", mensagem: `Falta a coluna "${campo}". A planilha precisa de: id, nome, inicio, fim, categoria.` });
  }
  if (problemas.length) return { cronograma: null, problemas, formato };
  return { ...montarCronograma(linhas.map(normalizarLinha)), formato };
}

export function importarCronograma(nomeArquivo: string, bytes: Uint8Array): ResultadoImportacao {
  return /\.json$/i.test(nomeArquivo) ? importarJson(bytes) : importarCsv(bytes);
}
