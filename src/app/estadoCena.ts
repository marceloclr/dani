// Monta as camadas da cena para um instante: usado pela viewport e pelo gerador de vídeo,
// para que o vídeo mostre exatamente o que a simulação mostra.
import { filaPorFases, type PosicaoFila } from "../fourd/animacao";
import { avaliar } from "../fourd/simulacao";
import type { Camadas, Cena } from "../rendering/Cena";
import type { Estado } from "../state/projectStore";

let cenaAtual: Cena | null = null;
export const definirCena = (c: Cena | null) => (cenaAtual = c);
export const obterCena = () => cenaAtual;

// caches por identidade: só recalculam quando o modelo ou o mapeamento mudam
let cacheTipos: { chave: unknown; valor: Map<string, string> } | null = null;
let cacheFila: { chaves: unknown[]; valor: Map<string, PosicaoFila> } | null = null;
let cacheIsolados: { chaves: unknown[]; valor: Set<string> | null } | null = null;

function tipos(s: Estado): Map<string, string> {
  if (cacheTipos?.chave !== s.elementos) cacheTipos = { chave: s.elementos, valor: new Map(s.elementos.map((e) => [e.guid, e.ifcType])) };
  return cacheTipos.valor;
}

function fila(s: Estado, cena: Cena): Map<string, PosicaoFila> | null {
  if (s.modoAnimacao !== "fases" || !s.cronograma) return null;
  const chaves = [s.vinculos, s.cronograma, s.elementos];
  if (!cacheFila || cacheFila.chaves.some((c, i) => c !== chaves[i])) {
    cacheFila = { chaves, valor: filaPorFases(cena.posicoes(), s.vinculos, s.cronograma.tarefas) };
  }
  return cacheFila.valor;
}

function isolados(s: Estado): Set<string> | null {
  const chaves = [s.tarefaIsolada, s.vinculos];
  if (!cacheIsolados || cacheIsolados.chaves.some((c, i) => c !== chaves[i])) {
    let v: Set<string> | null = null;
    if (s.tarefaIsolada) {
      v = new Set();
      for (const [guid, lista] of s.vinculos) if (lista.some((x) => x.taskId === s.tarefaIsolada)) v.add(guid);
    }
    cacheIsolados = { chaves, valor: v };
  }
  return cacheIsolados.valor;
}

/** Camadas para o instante `dia` (fracionário). `paraVideo` ignora seleção, ocultos e isolamento. */
export function camadasPara(s: Estado, cena: Cena, dia: number, paraVideo = false): Camadas {
  return {
    estados: s.cronograma ? avaliar(dia, { vinculos: s.vinculos, tarefas: s.cronograma.tarefas, politica: s.politica }) : null,
    ocultos: paraVideo ? new Set() : s.ocultosUsuario,
    isolados: paraVideo ? null : isolados(s),
    selecionado: paraVideo ? null : s.selecionado,
    modo: s.modoAnimacao,
    fila: fila(s, cena),
    tipos: tipos(s),
  };
}
