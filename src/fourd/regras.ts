// Mapeamento tarefa ↔ elemento por regras + exceções (ADR-02).
import type { AcaoTarefa, ElementoMeta, Excecao, FiltroRegra, Regra, Tarefa, Vinculo } from "../types";

interface ModeloRegra {
  acao: AcaoTarefa;
  onde: FiltroRegra;
  descricao: string;
}

/** Regras-padrão por categoria de tarefa. O usuário corrige com exceções. */
export const REGRAS_PADRAO: Record<string, ModeloRegra[]> = {
  terreno: [{ acao: "construct", onde: { ifcType: ["IfcGeographicElement"], predefinedType: ["TERRAIN"] }, descricao: "Terreno (IfcGeographicElement TERRAIN)" }],
  fundacao: [
    { acao: "construct", onde: { ifcType: ["IfcFooting", "IfcPile"] }, descricao: "Sapatas, baldrames e estacas (IfcFooting, IfcPile)" },
    { acao: "construct", onde: { ifcType: ["IfcSlab"], predefinedType: ["BASESLAB"] }, descricao: "Contrapiso (IfcSlab BASESLAB)" },
  ],
  estrutura: [{ acao: "construct", onde: { ifcType: ["IfcColumn", "IfcBeam", "IfcMember", "IfcStair", "IfcStairFlight"] }, descricao: "Pilares, vigas e escadas (IfcColumn, IfcBeam, IfcMember, IfcStair)" }],
  alvenaria: [{ acao: "construct", onde: { ifcType: ["IfcWall", "IfcWallStandardCase"] }, descricao: "Paredes (IfcWall)" }],
  laje: [{ acao: "construct", onde: { ifcType: ["IfcSlab"], predefinedType: ["FLOOR"] }, descricao: "Lajes (IfcSlab FLOOR)" }],
  cobertura: [
    { acao: "construct", onde: { ifcType: ["IfcSlab"], predefinedType: ["ROOF"] }, descricao: "Telhado (IfcSlab ROOF)" },
    { acao: "construct", onde: { ifcType: ["IfcCovering"], predefinedType: ["ROOFING"] }, descricao: "Telhas (IfcCovering ROOFING)" },
  ],
  instalacoes: [
    {
      acao: "install",
      onde: { ifcType: ["IfcPipeSegment", "IfcPipeFitting", "IfcTank", "IfcElectricDistributionBoard", "IfcCableSegment", "IfcDuctSegment"] },
      descricao: "Tubos, caixa d'água e quadros (IfcPipeSegment, IfcTank, IfcElectricDistributionBoard…)",
    },
  ],
  reboco: [{ acao: "finish", onde: { ifcType: ["IfcWall", "IfcWallStandardCase", "IfcColumn", "IfcBeam"] }, descricao: "Reboco das paredes, pilares e vigas (IfcWall, IfcColumn, IfcBeam)" }],
  esquadrias: [{ acao: "install", onde: { ifcType: ["IfcDoor", "IfcWindow"] }, descricao: "Portas e janelas (IfcDoor, IfcWindow)" }],
  revestimento: [{ acao: "construct", onde: { ifcType: ["IfcCovering"], predefinedType: ["FLOORING"] }, descricao: "Pisos (IfcCovering FLOORING)" }],
  pintura: [{ acao: "finish", onde: { ifcType: ["IfcWall", "IfcWallStandardCase", "IfcColumn", "IfcBeam"] }, descricao: "Pintura das paredes, pilares e vigas (IfcWall, IfcColumn, IfcBeam)" }],
  loucas: [{ acao: "install", onde: { ifcType: ["IfcSanitaryTerminal"] }, descricao: "Louças e metais (IfcSanitaryTerminal)" }],
  paisagismo: [{ acao: "construct", onde: { ifcType: ["IfcGeographicElement"], objectType: ["PAISAGISMO"] }, descricao: "Paisagismo (IfcGeographicElement PAISAGISMO)" }],
};

/** Ações que fazem o elemento surgir; "finish" e "remove" só mudam algo que já existe. */
export const ACOES_DE_SURGIMENTO: ReadonlySet<AcaoTarefa> = new Set<AcaoTarefa>(["construct", "install", "temporary"]);

const norm = (c: string) => c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function regrasPadrao(tarefas: Tarefa[]): Regra[] {
  // tarefa de um pavimento só pega os elementos dele (ADR-19)
  return tarefas.flatMap((t) =>
    (REGRAS_PADRAO[norm(t.categoria)] ?? []).map((r) => ({ taskId: t.id, acao: r.acao, onde: t.pavimento ? { ...r.onde, pavimento: [t.pavimento] } : r.onde })),
  );
}

export function descreverRegras(categoria: string): string[] {
  return (REGRAS_PADRAO[norm(categoria)] ?? []).map((r) => r.descricao);
}

export function casa(e: ElementoMeta, f: FiltroRegra): boolean {
  if (f.ifcType && !f.ifcType.includes(e.ifcType)) return false;
  if (f.predefinedType && !(e.predefinedType && f.predefinedType.includes(e.predefinedType))) return false;
  if (f.objectType && !(e.objectType && f.objectType.includes(e.objectType))) return false;
  if (f.pavimento && !(e.pavimento && f.pavimento.includes(e.pavimento))) return false;
  if (f.nomeContem && !e.nome.toLowerCase().includes(f.nomeContem.toLowerCase())) return false;
  return true;
}

/** Resolve regras e exceções: guid → vínculos. */
export function aplicarMapeamento(elementos: ElementoMeta[], regras: Regra[], excecoes: Excecao[]): Map<string, Vinculo[]> {
  const mapa = new Map<string, Vinculo[]>();
  for (const e of elementos) {
    const lista: Vinculo[] = [];
    for (const r of regras) if (casa(e, r.onde)) lista.push({ taskId: r.taskId, acao: r.acao, origem: "regra" });
    mapa.set(e.guid, lista);
  }
  for (const x of excecoes) {
    const lista = mapa.get(x.guid);
    if (!lista) continue; // elemento que não existe mais no modelo
    const filtrada = lista.filter((v) => v.taskId !== x.taskId);
    if (x.modo === "include") filtrada.push({ taskId: x.taskId, acao: x.acao, origem: "excecao" });
    mapa.set(x.guid, filtrada);
  }
  return mapa;
}

/** Quantos elementos cada tarefa movimenta. */
export function contarPorTarefa(vinculos: Map<string, Vinculo[]>): Map<string, number> {
  const n = new Map<string, number>();
  for (const lista of vinculos.values()) for (const v of lista) n.set(v.taskId, (n.get(v.taskId) ?? 0) + 1);
  return n;
}

/** Elementos sem nenhuma tarefa que os faça surgir (recebem a política de "sem tarefa"). */
export function semTarefa(vinculos: Map<string, Vinculo[]>): string[] {
  const out: string[] = [];
  for (const [guid, lista] of vinculos) if (!lista.some((v) => ACOES_DE_SURGIMENTO.has(v.acao))) out.push(guid);
  return out;
}
