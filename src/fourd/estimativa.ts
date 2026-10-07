// Cronograma estimado automaticamente (§13, ADR-18). Função pura, sem DOM.
// É uma ESTIMATIVA para começar a simular, não um cronograma executivo.
import type { Cronograma, ElementoMeta, Tarefa } from "../types";

export type TipoEstrutura = "concreto" | "alvenaria-estrutural" | "metalica";

export const NOME_ESTRUTURA: Record<TipoEstrutura, string> = {
  concreto: "Concreto armado (pilares e vigas)",
  "alvenaria-estrutural": "Alvenaria estrutural",
  metalica: "Estrutura metálica",
};

const FATOR_ESTRUTURA: Record<TipoEstrutura, number> = { concreto: 1, "alvenaria-estrutural": 0.9, metalica: 0.8 };

export interface ParametrosEstimativa {
  area: number; // m² construídos
  pavimentos: string[]; // nomes, de baixo para cima (ex.: ["Térreo", "Pavimento superior"])
  estrutura: TipoEstrutura;
  inicio: number; // dia civil
  prazo: number; // dias corridos
}

/** Prazo sugerido em dias: (60 + 0,9 × área) × 1,15 por pavimento adicional × fator da estrutura. */
export function prazoSugerido(area: number, nPavimentos: number, estrutura: TipoEstrutura): number {
  const base = 60 + 0.9 * Math.max(area, 0);
  return Math.max(30, Math.round(base * Math.pow(1.15, Math.max(nPavimentos, 1) - 1) * FATOR_ESTRUTURA[estrutura]));
}

export const FORMULA_PRAZO = "Prazo sugerido = (60 + 0,9 × área) × 1,15 por pavimento adicional × fator da estrutura (concreto 1,0; alvenaria estrutural 0,9; metálica 0,8)";

interface Etapa {
  id: string;
  nome: string;
  categoria: string;
  de: number; // fração do prazo
  ate: number;
  pavimento?: string;
}

/** Bloco estrutural: de 16% a 52% do prazo, repartido entre os pavimentos, de baixo para cima. */
function blocoEstrutural(pavimentos: string[], estrutura: TipoEstrutura): Etapa[] {
  const ini = 0.16, fim = 0.52;
  const n = Math.max(pavimentos.length, 1);
  const passo = (fim - ini) / n;
  const nomeEstrutura = estrutura === "alvenaria-estrutural" ? "Grautes, cintas e vergas" : estrutura === "metalica" ? "Estrutura metálica" : "Estrutura (pilares e vigas)";
  const etapas: Etapa[] = [];
  pavimentos.forEach((pav, k) => {
    const s = ini + k * passo;
    const sufixo = n > 1 ? `, ${pav.toLowerCase()}` : "";
    const ultimo = k === n - 1;
    const doPav = n > 1 ? pav : undefined;
    // em alvenaria estrutural as paredes são a estrutura: alvenaria primeiro, grautes e cintas junto
    if (estrutura === "alvenaria-estrutural") {
      etapas.push({ id: `ALV-${k + 1}`, nome: `Alvenaria estrutural${sufixo}`, categoria: "alvenaria", de: s, ate: s + 0.65 * passo, pavimento: doPav });
      etapas.push({ id: `EST-${k + 1}`, nome: `${nomeEstrutura}${sufixo}`, categoria: "estrutura", de: s + 0.35 * passo, ate: s + 0.75 * passo, pavimento: doPav });
    } else {
      etapas.push({ id: `EST-${k + 1}`, nome: `${nomeEstrutura}${sufixo}`, categoria: "estrutura", de: s, ate: s + 0.4 * passo, pavimento: doPav });
      etapas.push({ id: `ALV-${k + 1}`, nome: `Alvenaria${sufixo}`, categoria: "alvenaria", de: s + 0.3 * passo, ate: s + 0.8 * passo, pavimento: doPav });
    }
    etapas.push({ id: `LAJ-${k + 1}`, nome: ultimo ? `Laje de forro${sufixo}` : `Laje do pavimento acima${sufixo}`, categoria: "laje", de: s + 0.75 * passo, ate: s + passo, pavimento: doPav });
  });
  return etapas;
}

/** Etapas da estimativa, como frações do prazo, na ordem construtiva. */
export function etapasDaEstimativa(pavimentos: string[], estrutura: TipoEstrutura): Etapa[] {
  return [
    { id: "PRE-01", nome: "Serviços preliminares e locação", categoria: "terreno", de: 0, ate: 0.05 },
    { id: "FUN-01", nome: "Fundação", categoria: "fundacao", de: 0.05, ate: 0.16 },
    ...blocoEstrutural(pavimentos, estrutura),
    { id: "COB-01", nome: "Cobertura", categoria: "cobertura", de: 0.52, ate: 0.62 },
    { id: "INS-01", nome: "Instalações hidráulicas e elétricas", categoria: "instalacoes", de: 0.4, ate: 0.68 },
    { id: "REB-01", nome: "Chapisco e reboco", categoria: "reboco", de: 0.62, ate: 0.74 },
    { id: "ESQ-01", nome: "Esquadrias", categoria: "esquadrias", de: 0.74, ate: 0.82 },
    { id: "PIS-01", nome: "Revestimento de pisos", categoria: "revestimento", de: 0.72, ate: 0.84 },
    { id: "PIN-01", nome: "Pintura", categoria: "pintura", de: 0.84, ate: 0.92 },
    { id: "LOU-01", nome: "Louças e metais", categoria: "loucas", de: 0.88, ate: 0.94 },
    { id: "PAI-01", nome: "Paisagismo", categoria: "paisagismo", de: 0.9, ate: 0.97 },
    { id: "LIM-01", nome: "Limpeza final", categoria: "limpeza", de: 0.95, ate: 0.98 },
    { id: "ENT-01", nome: "Vistoria e entrega", categoria: "entrega", de: 0.98, ate: 1 },
  ];
}

/** Monta o cronograma estimado: dias inteiros, fim inclusivo, ao menos um dia por etapa. */
export function estimarCronograma(p: ParametrosEstimativa): Cronograma {
  const prazo = Math.max(Math.round(p.prazo), 15);
  const pavs = p.pavimentos.length ? p.pavimentos : ["Térreo"];
  const tarefas: Tarefa[] = etapasDaEstimativa(pavs, p.estrutura).map((e) => {
    const ini = Math.min(Math.floor(e.de * prazo), prazo - 1);
    const fim = Math.min(Math.max(ini, Math.round(e.ate * prazo) - 1), prazo - 1);
    const t: Tarefa = { id: e.id, nome: e.nome, categoria: e.categoria, ini, fim };
    if (e.pavimento) t.pavimento = e.pavimento;
    return t;
  });
  return { inicio: p.inicio, tarefas, estimado: true };
}

/** Pavimentos do modelo que têm paredes, de baixo para cima (para o bloco estrutural). */
export function pavimentosDoModelo(elementos: ElementoMeta[], baseY: (guid: string) => number | undefined): string[] {
  const menor = new Map<string, number>();
  for (const e of elementos) {
    if (!e.pavimento || (e.ifcType !== "IfcWall" && e.ifcType !== "IfcWallStandardCase")) continue;
    const y = baseY(e.guid) ?? 0;
    menor.set(e.pavimento, Math.min(menor.get(e.pavimento) ?? Infinity, y));
  }
  return [...menor].sort((a, b) => a[1] - b[1]).map(([nome]) => nome);
}
