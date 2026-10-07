// Gera docs/feriados.md a partir de src/fourd/feriados.ts (ADR-22). Uso: npm run feriados
import { writeFileSync } from "node:fs";
import { ANO_FINAL, ANO_INICIAL, MUNICIPIOS, baseDeFeriados, feriadosDoAno } from "../src/fourd/feriados";
import { formatarBR } from "../src/fourd/tempo";

const ddmm = (dia: number) => formatarBR(dia).slice(0, 5);
const ano = feriadosDoAno(2027); // ano sem feriado avulso: mostra as regras permanentes
const linhas: string[] = [
  "# Feriados do Ceará e da Região Metropolitana de Fortaleza",
  "",
  `Gerado por \`npm run feriados\` a partir de \`src/fourd/feriados.ts\` (ADR-22). Base de ${ANO_INICIAL} a ${ANO_FINAL}: ${baseDeFeriados().length} registros no banco local.`,
  "",
  "Dia útil de obra: segunda a sexta, fora os feriados abaixo. As datas móveis seguem a Páscoa; a tabela mostra 2027 como exemplo.",
  "",
  "## Ceará inteiro",
  "",
  "| Data (2027) | Feriado | Esfera | Base |",
  "|---|---|---|---|",
  ...ano.filter((f) => f.abrangencia === "CE").map((f) => `| ${ddmm(f.dia)} | ${f.nome} | ${f.esfera === "facultativo" ? "ponto facultativo (descontado)" : f.esfera} | ${f.base} |`),
  "",
  "São José (19/3) não é feriado estadual: só conta onde a lei municipal o adota. Corpus Christi é ponto facultativo federal; só desconta onde é feriado municipal.",
  "",
  "## Municípios",
  "",
  "| Município | Data | Feriado | Fonte | Situação |",
  "|---|---|---|---|---|",
];
for (const m of MUNICIPIOS) {
  for (const f of ano.filter((x) => x.abrangencia === m.id)) linhas.push(`| ${m.nome} | ${f.nome === "Corpus Christi" ? "Corpus Christi (Páscoa + 60)" : ddmm(f.dia)} | ${f.nome} | ${f.base} | ${f.confirmado ? "confirmado" : "a confirmar"} |`);
}
linhas.push(
  "| Fortaleza | 13/04 (só 2026) | Tricentenário de Fortaleza | Lei municipal de 8/4/2026 | confirmado |",
  "",
  "## Fontes",
  "",
  "- [Portaria TJCE 2924/2025](https://www.tjce.jus.br/atos_normativos/portaria-n-2924-2025/): feriados nacionais, estaduais e pontos facultativos de 2026.",
  "- [Calendário de feriados 2026 do TRT-CE](https://www.trt7.jus.br/index.php/servicos/agendas-e-calendarios/calendario-de-feriados-do-trt-ce/16348-calendario-de-feriados-2026?showall=1): feriados municipais onde há Vara do Trabalho.",
  "- [Sintracondce](https://sintracondce.com.br/feriados/): feriados da construção civil (sem datas, só os nomes).",
  "- [iFeriados](https://www.iferiados.com.br/) e [feriados.inf.br](https://www.feriados.inf.br/): agregadores, usados onde não há fonte oficial.",
  "- [Diário do Nordeste: 19 de março](https://diariodonordeste.verdesmares.com.br/opiniao/colunistas/germano-ribeiro/dia-19-de-marco-e-feriado-ou-ponto-facultativo-entenda-a-regra-para-feriados-religiosos-1.3490281): São José municipal; Lei 8.796/2003 de Fortaleza.",
  "- [Diário do Nordeste: feriado de 13 de abril](https://diariodonordeste.verdesmares.com.br/pontopoder/feriado-de-13-de-abril-em-fortaleza-so-pode-ocorrer-a-cada-100-anos-veja-o-que-se-sabe-1.3755354): tricentenário, só em 2026.",
  "",
  "Divergências tratadas pela união das datas: Caucaia (TRT-CE: 19/3, 15/10 e 8/12; agregadores: 15/8 e 15/10), Maracanaú, Eusébio e Pacajus. Paraipaba: o agregador põe Santa Rita de Cássia em 1º/11; o dia litúrgico é 22/5; entram as duas até a prefeitura confirmar.",
  "",
);
writeFileSync("docs/feriados.md", linhas.join("\n"));
console.log("docs/feriados.md:", linhas.length, "linhas");
