// Planejado × real (ADR-13): simulação com as datas reais, comparação por elemento e indicadores.
// Função pura, sem DOM.
import type { Desvio, EstadoElemento, FotoObra, PoliticaSemTarefa, Tarefa, Vinculo } from "../types";
import { avaliar } from "./simulacao";

/** Data de status (índice de dia): a última data real informada ou a da última foto. null se não há dado real. */
export function dataDeStatus(tarefas: Tarefa[], fotosDias: number[] = []): number | null {
  const datas = [...tarefas.flatMap((t) => [t.realIni, t.realFim].filter((d): d is number => d !== undefined)), ...fotosDias];
  return datas.length ? Math.max(...datas) : null;
}

export const temDadosReais = (tarefas: Tarefa[]) => tarefas.some((t) => t.realIni !== undefined);

/**
 * Tarefas "como executadas": sem início real, ainda não começou (fica para depois do horizonte);
 * com início e sem fim real, segue em execução até a data de status (e além, sem data de término).
 */
export function tarefasReais(tarefas: Tarefa[]): Tarefa[] {
  const LONGE = 1e7;
  return tarefas.map((t) => {
    if (t.realIni === undefined) return { ...t, ini: LONGE, fim: LONGE };
    // sem fim real: em execução até a data de status e, como não há previsão de término, depois dela também
    return { ...t, ini: t.realIni, fim: t.realFim ?? LONGE - 1 };
  });
}

/** Estados pela execução real no instante `dia`. */
export function avaliarReal(dia: number, ctx: { vinculos: Map<string, Vinculo[]>; tarefas: Tarefa[]; politica: PoliticaSemTarefa }) {
  return avaliar(dia, { vinculos: ctx.vinculos, tarefas: tarefasReais(ctx.tarefas), politica: ctx.politica });
}

/** Desvio de cada elemento no dia: compara a existência planejada com a real. */
export function compararEstados(planejado: Map<string, EstadoElemento>, real: Map<string, EstadoElemento>): Map<string, Desvio> {
  const out = new Map<string, Desvio>();
  for (const [guid, p] of planejado) {
    const r = real.get(guid);
    if (!r || p.fase === "fantasma") {
      out.set(guid, "em-dia");
      continue;
    }
    const existeP = p.visivel, existeR = r.visivel;
    const concluidoP = p.fase === "concluido", concluidoR = r.fase === "concluido";
    if ((existeP && !existeR) || (concluidoP && !concluidoR && existeR)) out.set(guid, "atrasado");
    else if ((existeR && !existeP) || (concluidoR && !concluidoP && existeP)) out.set(guid, "adiantado");
    else out.set(guid, "em-dia");
  }
  return out;
}

const duracao = (t: Tarefa) => t.fim - t.ini + 1;

/** Avanço planejado no dia: durações decorridas ÷ durações totais. */
export function avancoPlanejado(tarefas: Tarefa[], dia: number): number {
  const total = tarefas.reduce((s, t) => s + duracao(t), 0);
  if (!total) return 0;
  const feito = tarefas.reduce((s, t) => s + Math.min(Math.max(dia - t.ini + 1, 0), duracao(t)), 0);
  return feito / total;
}

/** Avanço físico de uma tarefa: o informado ou, sem ele, deduzido das datas reais até `dia`. */
export function avancoDaTarefa(t: Tarefa, dia: number): number {
  if (t.avanco !== undefined) return t.avanco;
  if (t.realIni === undefined || dia < t.realIni) return 0;
  if (t.realFim !== undefined) return dia >= t.realFim ? 1 : (dia - t.realIni + 1) / (t.realFim - t.realIni + 1);
  // em execução sem fim real: fração do prazo planejado já consumida, no máximo 95%
  return Math.min((dia - t.realIni + 1) / duracao(t), 0.95);
}

/** Avanço real: média dos avanços ponderada pela duração planejada. */
export function avancoReal(tarefas: Tarefa[], dia: number): number {
  const total = tarefas.reduce((s, t) => s + duracao(t), 0);
  return total ? tarefas.reduce((s, t) => s + avancoDaTarefa(t, dia) * duracao(t), 0) / total : 0;
}

export interface DesvioTarefa {
  tarefa: Tarefa;
  dias: number; // positivo = atraso
  motivo: string;
}

/** Tarefas atrasadas ou adiantadas em relação ao planejado, vistas na data `dia`. */
export function desviosDasTarefas(tarefas: Tarefa[], dia: number): DesvioTarefa[] {
  const out: DesvioTarefa[] = [];
  for (const t of tarefas) {
    if (t.realFim !== undefined && t.realFim !== t.fim) {
      out.push({ tarefa: t, dias: t.realFim - t.fim, motivo: t.realFim > t.fim ? "terminou depois do previsto" : "terminou antes do previsto" });
    } else if (t.realFim === undefined && dia > t.fim) {
      out.push({ tarefa: t, dias: dia - t.fim, motivo: t.realIni === undefined ? "não começou e já devia ter terminado" : "em execução além do prazo" });
    } else if (t.realIni === undefined && dia > t.ini) {
      out.push({ tarefa: t, dias: dia - t.ini, motivo: "não começou na data prevista" });
    }
  }
  return out.sort((a, b) => b.dias - a.dias);
}

/** Foto mais recente até o dia (inclusive), para a simulação. */
export function fotoAte(fotos: FotoObra[], diaCivil: number): FotoObra | null {
  let melhor: FotoObra | null = null;
  for (const f of fotos) if (f.dia <= diaCivil && (!melhor || f.dia > melhor.dia)) melhor = f;
  return melhor;
}
