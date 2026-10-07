// Avisos de consistência entre cronograma e modelo (§41).
import type { ElementoMeta, Tarefa, Vinculo } from "../types";
import type { Problema } from "../importers/cronograma";
import { contarPorTarefa, semTarefa } from "./regras";

export function validarMapeamento(tarefas: Tarefa[], elementos: ElementoMeta[], vinculos: Map<string, Vinculo[]>): Problema[] {
  const problemas: Problema[] = [];
  if (!tarefas.length || !elementos.length) return problemas;
  const contagem = contarPorTarefa(vinculos);
  const vazias = tarefas.filter((t) => !contagem.get(t.id));
  if (vazias.length) {
    problemas.push({
      nivel: "aviso",
      mensagem: `${vazias.length} ${vazias.length === 1 ? "atividade não possui" : "atividades não possuem"} elementos associados: ${vazias.map((t) => t.nome).join(", ")}.`,
    });
  }
  const soltos = semTarefa(vinculos).length;
  if (soltos) {
    problemas.push({ nivel: "aviso", mensagem: `${soltos} ${soltos === 1 ? "elemento não está ligado" : "elementos não estão ligados"} a nenhuma tarefa que os faça surgir.` });
  }
  return problemas;
}
