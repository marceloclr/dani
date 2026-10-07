// Motor 4D como função pura sobre o índice de dia (ADR-03). Não depende de Three.js nem do DOM.
import type { AcaoTarefa, EstadoElemento, PoliticaSemTarefa, Tarefa, Vinculo } from "../types";
import { ACOES_DE_SURGIMENTO } from "./regras";

/** Ordem de precedência entre tarefas simultâneas no mesmo elemento (ADR-02). */
const ORDEM: Record<AcaoTarefa, number> = { construct: 0, temporary: 0, finish: 1, install: 2, remove: 3 };

const normalizar = (c: string) => c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

interface VinculoResolvido {
  acao: AcaoTarefa;
  tarefa: Tarefa;
}

export interface Contexto {
  vinculos: Map<string, Vinculo[]>;
  tarefas: Tarefa[];
  politica: PoliticaSemTarefa;
}

function resolver(lista: Vinculo[], porId: Map<string, Tarefa>): VinculoResolvido[] {
  const out: VinculoResolvido[] = [];
  for (const v of lista) {
    const tarefa = porId.get(v.taskId);
    if (tarefa) out.push({ acao: v.acao, tarefa });
  }
  return out;
}

/** Aparência dada pelo último acabamento concluído; "base" quando não houver. */
function aparencia(vs: VinculoResolvido[], dia: number): string {
  let melhor: Tarefa | null = null;
  for (const v of vs) {
    if (v.acao !== "finish" || dia <= v.tarefa.fim) continue;
    if (!melhor || v.tarefa.fim > melhor.fim || (v.tarefa.fim === melhor.fim && v.tarefa.ini > melhor.ini)) melhor = v.tarefa;
  }
  return melhor ? normalizar(melhor.categoria) || "base" : "base";
}

/** Tarefa que faz o elemento surgir: a primeira (menor início) entre as de surgimento. */
export function tarefaDeSurgimento(lista: Vinculo[], porId: Map<string, Tarefa>): Tarefa | null {
  let melhor: Tarefa | null = null;
  for (const v of lista) {
    const t = porId.get(v.taskId);
    if (t && ACOES_DE_SURGIMENTO.has(v.acao) && (!melhor || t.ini < melhor.ini)) melhor = t;
  }
  return melhor;
}

/** Avanço da tarefa no instante `dia` (fracionário; o dia k vai de k a k+1). */
export const avancoNaTarefa = (t: Tarefa, dia: number) => Math.min(Math.max((dia - t.ini + 1) / (t.fim - t.ini + 1), 0), 1);

/**
 * Estado de um elemento no instante `dia`. A fase usa o dia inteiro (Math.floor);
 * `surgimento` usa o valor fracionário, para animações suaves.
 */
export function estadoDe(lista: Vinculo[], diaFracionario: number, porId: Map<string, Tarefa>, politica: PoliticaSemTarefa): EstadoElemento {
  const dia = Math.floor(diaFracionario);
  const vs = resolver(lista, porId);
  const ap = aparencia(vs, dia);
  const surgimento = vs.filter((v) => ACOES_DE_SURGIMENTO.has(v.acao));

  if (surgimento.length === 0) {
    if (politica === "oculto") return { visivel: false, fase: "oculto", aparencia: ap, progresso: 0, surgimento: 0 };
    if (politica === "visivel") return { visivel: true, fase: "concluido", aparencia: ap, progresso: 1, surgimento: 1 };
    return { visivel: true, fase: "fantasma", aparencia: ap, progresso: 0, surgimento: 1 };
  }

  const primeira = surgimento.reduce((a, b) => (b.tarefa.ini < a.tarefa.ini ? b : a)).tarefa;
  const surg = avancoNaTarefa(primeira, diaFracionario);
  if (dia < primeira.ini) return { visivel: false, fase: "oculto", aparencia: ap, progresso: 0, surgimento: 0 };

  const removido = vs.some((v) => v.acao === "remove" && dia > v.tarefa.fim);
  const soTemporario = surgimento.every((v) => v.acao === "temporary");
  if (removido || (soTemporario && dia > Math.max(...surgimento.map((v) => v.tarefa.fim)))) {
    return { visivel: false, fase: "oculto", aparencia: ap, progresso: 1, surgimento: 1 };
  }

  // tarefa que governa o elemento hoje: maior ordem de ação; empate, a que começou por último
  let ativa: VinculoResolvido | null = null;
  for (const v of vs) {
    if (dia < v.tarefa.ini || dia > v.tarefa.fim) continue;
    if (!ativa || ORDEM[v.acao] > ORDEM[ativa.acao] || (ORDEM[v.acao] === ORDEM[ativa.acao] && v.tarefa.ini > ativa.tarefa.ini)) ativa = v;
  }
  if (ativa) {
    const progresso = (dia - ativa.tarefa.ini + 1) / (ativa.tarefa.fim - ativa.tarefa.ini + 1);
    return { visivel: true, fase: "em-execucao", aparencia: ap, progresso, surgimento: surg };
  }
  return { visivel: true, fase: "concluido", aparencia: ap, progresso: 1, surgimento: 1 };
}

/** avaliar(dia) → Map<guid, EstadoElemento> (ADR-03). `dia` pode ser fracionário. */
export function avaliar(dia: number, ctx: Contexto): Map<string, EstadoElemento> {
  const porId = new Map(ctx.tarefas.map((t) => [t.id, t]));
  const out = new Map<string, EstadoElemento>();
  for (const [guid, lista] of ctx.vinculos) out.set(guid, estadoDe(lista, dia, porId, ctx.politica));
  return out;
}

/** Duração total da obra em dias (fim inclusivo). */
export function duracaoObra(tarefas: Tarefa[]): number {
  return tarefas.length ? Math.max(...tarefas.map((t) => t.fim)) + 1 : 0;
}
