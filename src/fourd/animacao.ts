// Modos de animação (§16): transformam o estado 4D em opacidade e escala vertical.
// Função pura; a geometria nunca muda (§62), só escala, opacidade e cor.
import type { EstadoElemento, ModoAnimacao, Tarefa, Vinculo } from "../types";
import { tarefaDeSurgimento } from "./simulacao";

export interface ParametrosVisuais {
  opacidade: number; // multiplica a opacidade do material
  escalaY: number; // 1 = altura total; pivô na base do elemento
}

/** Classes que "crescem" de baixo para cima no modo Crescimento. */
export const CLASSES_QUE_CRESCEM: ReadonlySet<string> = new Set(["IfcWall", "IfcWallStandardCase", "IfcColumn", "IfcDoor", "IfcWindow", "IfcMember", "IfcPile"]);

/** Posição de um elemento na fila do modo Por fases: `pos` de 0 a n−1. */
export interface PosicaoFila {
  pos: number;
  n: number;
}

const INTEIRO: ParametrosVisuais = { opacidade: 1, escalaY: 1 };

export function parametros(estado: EstadoElemento, modo: ModoAnimacao, ifcType: string, fila?: PosicaoFila): ParametrosVisuais {
  if (!estado.visivel || estado.fase !== "em-execucao" || estado.surgimento >= 1 || modo === "aparecimento") return INTEIRO;
  const s = estado.surgimento;
  switch (modo) {
    case "fade":
      return { opacidade: s, escalaY: 1 };
    case "crescimento":
      return CLASSES_QUE_CRESCEM.has(ifcType) ? { opacidade: 1, escalaY: Math.max(s, 0.001) } : { opacidade: s, escalaY: 1 };
    case "fases": {
      if (!fila || fila.n <= 1) return { opacidade: s, escalaY: 1 };
      // cada elemento ocupa uma fatia 1/n do avanço da tarefa e surge ao longo dela
      const local = Math.min(Math.max((s - fila.pos / fila.n) * fila.n, 0), 1);
      return { opacidade: local, escalaY: 1 };
    }
  }
}

export interface PosicaoElemento {
  guid: string;
  baseY: number; // ponto mais baixo
  frente: number; // maior = mais perto da frente
  lado: number; // desempate (x)
}

/**
 * Fila do modo Por fases: dentro de cada tarefa de surgimento, de baixo para cima
 * (faixas de 10 cm) e, na mesma faixa, da frente para o fundo.
 */
export function filaPorFases(posicoes: PosicaoElemento[], vinculos: Map<string, Vinculo[]>, tarefas: Tarefa[]): Map<string, PosicaoFila> {
  const porId = new Map(tarefas.map((t) => [t.id, t]));
  const grupos = new Map<string, PosicaoElemento[]>();
  for (const p of posicoes) {
    const t = tarefaDeSurgimento(vinculos.get(p.guid) ?? [], porId);
    if (!t) continue;
    const g = grupos.get(t.id) ?? [];
    g.push(p);
    grupos.set(t.id, g);
  }
  const out = new Map<string, PosicaoFila>();
  for (const g of grupos.values()) {
    g.sort((a, b) => Math.round(a.baseY * 10) - Math.round(b.baseY * 10) || b.frente - a.frente || a.lado - b.lado);
    g.forEach((p, pos) => out.set(p.guid, { pos, n: g.length }));
  }
  return out;
}
