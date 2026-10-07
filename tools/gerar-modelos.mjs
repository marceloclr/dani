// Gera os modelos de arquivo para download (public/modelos/), com exemplos preenchidos.
// Uso: node tools/gerar-modelos.mjs   (o exemplo.4dstudio é gerado pelo app: npm run modelos)
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";

const DIR = "public/modelos";
mkdirSync(DIR, { recursive: true });

// Cronograma da casa de demonstração (180 dias) com execução real até 20/04/2026.
const TAREFAS = [
  // id, nome, início, fim, categoria, início real, fim real, avanço
  ["PRE-01", "Serviços preliminares e locação", "2026-01-05", "2026-01-14", "terreno", "2026-01-05", "2026-01-15", 1],
  ["FUN-01", "Fundação (sapatas e baldrames)", "2026-01-15", "2026-02-03", "fundacao", "2026-01-16", "2026-02-08", 1],
  ["EST-01", "Estrutura (pilares e vigas)", "2026-02-04", "2026-02-28", "estrutura", "2026-02-09", "2026-03-06", 1],
  ["ALV-01", "Alvenaria", "2026-03-01", "2026-03-30", "alvenaria", "2026-03-07", "2026-04-10", 1],
  ["LAJ-01", "Laje de forro", "2026-03-31", "2026-04-14", "laje", "2026-04-11", "", 0.6],
  ["COB-01", "Cobertura", "2026-04-15", "2026-05-04", "cobertura", "", "", ""],
  ["INS-01", "Instalações hidráulicas e elétricas", "2026-04-20", "2026-05-14", "instalacoes", "2026-04-18", "", 0.15],
  ["REB-01", "Chapisco e reboco", "2026-05-05", "2026-05-24", "reboco", "", "", ""],
  ["ESQ-01", "Esquadrias", "2026-05-25", "2026-06-08", "esquadrias", "", "", ""],
  ["PIS-01", "Revestimento de pisos", "2026-05-25", "2026-06-13", "revestimento", "", "", ""],
  ["PIN-01", "Pintura", "2026-06-09", "2026-06-23", "pintura", "", "", ""],
  ["LOU-01", "Louças e metais", "2026-06-14", "2026-06-23", "loucas", "", "", ""],
  ["PAI-01", "Paisagismo", "2026-06-15", "2026-06-27", "paisagismo", "", "", ""],
  ["LIM-01", "Limpeza final", "2026-06-24", "2026-06-28", "limpeza", "", "", ""],
  ["ENT-01", "Vistoria e entrega", "2026-06-29", "2026-07-03", "entrega", "", "", ""],
];
const br = (iso) => (iso ? iso.split("-").reverse().join("/") : "");
const pct = (a) => (a === "" ? "" : `${Math.round(a * 100)}%`);

// 1) CSV no padrão do Excel brasileiro: ponto e vírgula, dd/mm/aaaa, UTF-8 com BOM
const csv = [
  "id;nome;inicio;fim;categoria;pavimento;inicio_real;fim_real;avanco",
  ...TAREFAS.map(([id, nome, i, f, cat, ri, rf, av]) => [id, nome, br(i), br(f), cat, "", br(ri), br(rf), pct(av)].join(";")),
];
writeFileSync(`${DIR}/cronograma-modelo.csv`, "﻿" + csv.join("\r\n") + "\r\n");

// 2) JSON
const json = {
  tarefas: TAREFAS.map(([id, nome, inicio, fim, categoria, ri, rf, av]) => ({
    id, nome, categoria, inicio, fim,
    ...(ri ? { inicio_real: ri } : {}),
    ...(rf ? { fim_real: rf } : {}),
    ...(av !== "" ? { avanco: av } : {}),
  })),
};
writeFileSync(`${DIR}/cronograma-modelo.json`, JSON.stringify(json, null, 2) + "\n");

// 3) XLSX: "Cronograma" primeiro (é a planilha lida) e "Instruções" depois
// datas como número de série do Excel (independe do fuso de quem gera): dias desde 1970 + 25569
const data = (iso) => (iso ? Date.UTC(...iso.split("-").map((n, i) => (i === 1 ? +n - 1 : +n))) / 86_400_000 + 25569 : null);
const linhas = [
  ["id", "nome", "inicio", "fim", "categoria", "pavimento", "inicio_real", "fim_real", "avanco"],
  ...TAREFAS.map(([id, nome, i, f, cat, ri, rf, av]) => [id, nome, data(i), data(f), cat, null, data(ri), data(rf), av === "" ? null : av]),
];
const ws = XLSX.utils.aoa_to_sheet(linhas);
for (let r = 1; r < linhas.length; r++) {
  for (const c of [2, 3, 6, 7]) {
    const cel = ws[XLSX.utils.encode_cell({ r, c })];
    if (cel) cel.z = "dd/mm/yyyy";
  }
  const av = ws[XLSX.utils.encode_cell({ r, c: 8 })];
  if (av) av.z = "0%";
}
ws["!cols"] = [{ wch: 9 }, { wch: 36 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 8 }];
const instrucoes = XLSX.utils.aoa_to_sheet([
  ["Construction 4D Studio: modelo de cronograma"],
  [],
  ["Coluna", "Obrigatória", "Conteúdo"],
  ["id", "sim", "Código único da tarefa (ex.: ALV-01)"],
  ["nome", "não", "Nome da tarefa; se faltar, usa o id"],
  ["inicio", "sim", "Data de início planejada (data do Excel, dd/mm/aaaa ou aaaa-mm-dd)"],
  ["fim", "sim", "Data de fim planejada, inclusive"],
  ["categoria", "não", "Liga os elementos do modelo à tarefa (ver lista abaixo); sem categoria, inclua os elementos à mão"],
  ["pavimento", "não", "Limita a tarefa aos elementos de um pavimento (ex.: Térreo); em branco, vale para o prédio inteiro"],
  ["inicio_real", "não", "Data em que a tarefa começou de fato"],
  ["fim_real", "não", "Data em que terminou de fato (exige inicio_real)"],
  ["avanco", "não", "Avanço físico medido: 0% a 100%; vazio = deduzido das datas reais"],
  [],
  ["Categorias com regra automática"],
  ...["terreno", "fundacao", "estrutura", "alvenaria", "laje", "cobertura", "instalacoes", "reboco", "esquadrias", "revestimento", "pintura", "loucas", "paisagismo"].map((c) => [c]),
  [],
  ["O app lê só a primeira planilha (Cronograma). Os dados deste modelo são fictícios."],
]);
instrucoes["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 90 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Cronograma");
XLSX.utils.book_append_sheet(wb, instrucoes, "Instruções");
wb.Props = { Title: "Modelo de cronograma", Author: "Construction 4D Studio", CreatedDate: new Date("2026-10-07T00:00:00Z") };
writeFileSync(`${DIR}/cronograma-modelo.xlsx`, XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }));

// 4) fotos.csv: dados das fotos pelo nome do arquivo
const fotos = [
  ["arquivo", "data", "local", "descricao", "etapa"],
  ["obra-2026-02-02.jpg", "02/02/2026", "Lote inteiro", "Sapatas concretadas e baldrames em execução", "FUN-01"],
  ["obra-2026-03-02.jpg", "02/03/2026", "Fachada frontal", "Pilares e vigas prontos", "EST-01"],
  ["obra-2026-04-01.jpg", "01/04/2026", "Sala de pé-direito duplo", "Alvenaria da sala chegando à platibanda", "ALV-01"],
  ["obra-2026-04-20.jpg", "20/04/2026", "Cobertura", "Laje de forro em execução", "LAJ-01"],
];
writeFileSync(`${DIR}/fotos-modelo.csv`, "﻿" + fotos.map((l) => l.join(";")).join("\r\n") + "\r\n");

// 5) IFC de exemplo: a casa da demonstração
copyFileSync("public/samples/demo.ifc", `${DIR}/casa-exemplo.ifc`);

console.log(`modelos gravados em ${DIR}/`);
