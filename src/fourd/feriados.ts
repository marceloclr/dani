// Calendário oficial do Ceará e dos municípios da Região Metropolitana de Fortaleza (ADR-22).
// Função pura, sem DOM: gera os feriados de 2026 a 2030 a partir das regras abaixo.
// O banco local (storage/IndexedDb.ts) guarda o resultado; os testes usam este módulo direto.
import { diaCivil, partes } from "./tempo";

export const ANO_INICIAL = 2026;
export const ANO_FINAL = 2030;
/** Muda quando as regras mudam: o banco local é recarregado. */
export const VERSAO_FERIADOS = 1;

export type Esfera = "nacional" | "estadual" | "municipal" | "facultativo";

export interface Feriado {
  dia: number; // dia civil
  nome: string;
  esfera: Esfera;
  /** "CE" para nacionais, estaduais e facultativos; senão o id do município. */
  abrangencia: string;
  base: string;
  /** false quando só um agregador traz a data e nenhuma fonte oficial a confirma. */
  confirmado: boolean;
}

export interface Municipio {
  id: string;
  nome: string;
  /** Sede do município (IBGE, Localidades; graus decimais), para a posição do sol (ADR-26). */
  lat: number;
  lon: number;
}

/** Região Metropolitana de Fortaleza: 19 municípios (LC estadual 18/1999 e ampliações até 2014). */
export const MUNICIPIOS: Municipio[] = ([
  ["fortaleza", "Fortaleza", -3.71664, -38.5423],
  ["aquiraz", "Aquiraz", -3.89929, -38.3896],
  ["cascavel", "Cascavel", -4.12967, -38.2412],
  ["caucaia", "Caucaia", -3.72797, -38.6619],
  ["chorozinho", "Chorozinho", -4.28873, -38.4986],
  ["eusebio", "Eusébio", -3.8925, -38.4559],
  ["guaiuba", "Guaiúba", -4.04057, -38.6404],
  ["horizonte", "Horizonte", -4.1209, -38.4707],
  ["itaitinga", "Itaitinga", -3.96577, -38.5298],
  ["maracanau", "Maracanaú", -3.86699, -38.6259],
  ["maranguape", "Maranguape", -3.89143, -38.6829],
  ["pacajus", "Pacajus", -4.17107, -38.465],
  ["pacatuba", "Pacatuba", -3.9784, -38.6183],
  ["paracuru", "Paracuru", -3.41436, -39.03],
  ["paraipaba", "Paraipaba", -3.43799, -39.1479],
  ["pindoretama", "Pindoretama", -4.01584, -38.3061],
  ["sao-goncalo-do-amarante", "São Gonçalo do Amarante", -3.60515, -38.9726],
  ["sao-luis-do-curu", "São Luís do Curu", -3.66976, -39.2391],
  ["trairi", "Trairi", -3.26932, -39.2681],
] as [string, string, number, number][]).map(([id, nome, lat, lon]) => ({ id: id as string, nome: nome as string, lat: lat as number, lon: lon as number }));

/** Fora da RMF: só feriados nacionais e estaduais. */
export const OUTRO_MUNICIPIO = "outro-ce";
export const NOME_OUTRO = "Outro município do Ceará (sem feriados municipais)";

export const nomeMunicipio = (id: string) => MUNICIPIOS.find((m) => m.id === id)?.nome ?? NOME_OUTRO;

// Fontes (detalhes em docs/feriados.md)
const LEI_NACIONAL = "Leis federais 662/1949, 6.802/1980, 9.093/1995 e 14.759/2023";
const DATA_MAGNA = "Constituição do Ceará, art. 18, parágrafo único (EC estadual 73/2011)";
const TRT = "Portaria TRT7.GP 518/2025 (calendário 2026 do TRT-CE)";
const SINDICATO = "Sintracondce (feriados da construção civil)";
const AGREGADOR = "iFeriados e feriados.inf.br";

type Fixo = { mes: number; dia: number; nome: string; base: string; confirmado: boolean };
type Movel = { deslocamento: number; nome: string; base: string };

const NACIONAIS: Fixo[] = [
  { mes: 1, dia: 1, nome: "Confraternização Universal", base: LEI_NACIONAL, confirmado: true },
  { mes: 4, dia: 21, nome: "Tiradentes", base: LEI_NACIONAL, confirmado: true },
  { mes: 5, dia: 1, nome: "Dia do Trabalho", base: LEI_NACIONAL, confirmado: true },
  { mes: 9, dia: 7, nome: "Independência do Brasil", base: LEI_NACIONAL, confirmado: true },
  { mes: 10, dia: 12, nome: "Nossa Senhora Aparecida", base: LEI_NACIONAL, confirmado: true },
  { mes: 11, dia: 2, nome: "Finados", base: LEI_NACIONAL, confirmado: true },
  { mes: 11, dia: 15, nome: "Proclamação da República", base: LEI_NACIONAL, confirmado: true },
  { mes: 11, dia: 20, nome: "Dia Nacional de Zumbi e da Consciência Negra", base: LEI_NACIONAL, confirmado: true },
  { mes: 12, dia: 25, nome: "Natal", base: LEI_NACIONAL, confirmado: true },
];

/** Datas móveis, em dias a partir do domingo de Páscoa. */
const SEXTA_SANTA: Movel = { deslocamento: -2, nome: "Sexta-feira Santa (Paixão de Cristo)", base: LEI_NACIONAL };
/** Carnaval é ponto facultativo nacional, mas a obra para: entra no desconto dos dias úteis. */
const CARNAVAL: Movel[] = [
  { deslocamento: -48, nome: "Segunda-feira de Carnaval", base: "Ponto facultativo federal" },
  { deslocamento: -47, nome: "Terça-feira de Carnaval", base: "Ponto facultativo federal" },
];
const CORPUS_CHRISTI = 60;

interface RegrasMunicipio {
  fixos: Fixo[];
  corpusChristi?: string; // base legal, quando o município o adota como feriado
  /** Feriados de um ano só (ex.: tricentenário de Fortaleza). */
  avulsos?: { ano: number; mes: number; dia: number; nome: string; base: string }[];
}

const f = (mes: number, dia: number, nome: string, base: string, confirmado = true): Fixo => ({ mes, dia, nome, base, confirmado });
const SAO_JOSE = "Dia de São José";

/**
 * Feriados municipais. Quando as fontes divergem, entram todas as datas (união):
 * o prazo em dias úteis fica do lado seguro, sem prometer dias que podem ser feriado.
 */
const MUNICIPAIS: Record<string, RegrasMunicipio> = {
  fortaleza: {
    fixos: [f(3, 19, SAO_JOSE, "Lei municipal 8.796/2003"), f(8, 15, "Nossa Senhora da Assunção", "Lei municipal 8.796/2003")],
    corpusChristi: "Lei municipal 8.796/2003",
    avulsos: [{ ano: 2026, mes: 4, dia: 13, nome: "Tricentenário de Fortaleza", base: "Lei municipal de 8/4/2026 (só em 2026)" }],
  },
  aquiraz: { fixos: [f(2, 13, "Aniversário de Aquiraz", AGREGADOR, false), f(8, 15, "Nossa Senhora da Assunção", SINDICATO)] },
  cascavel: { fixos: [f(10, 4, "São Francisco de Assis", AGREGADOR, false), f(10, 17, "Aniversário de Cascavel", AGREGADOR, false), f(12, 8, "Imaculada Conceição", AGREGADOR, false)] },
  caucaia: { fixos: [f(3, 19, SAO_JOSE, TRT), f(8, 15, "Nossa Senhora dos Prazeres (padroeira)", `${SINDICATO}; ${AGREGADOR}`), f(10, 15, "Aniversário de Caucaia", TRT), f(12, 8, "Imaculada Conceição", TRT)] },
  chorozinho: { fixos: [f(10, 1, "Santa Teresinha", AGREGADOR, false)] },
  eusebio: { fixos: [f(3, 19, SAO_JOSE, TRT), f(6, 23, "Aniversário de Eusébio", TRT), f(7, 26, "Sant'Ana (padroeira)", `${SINDICATO}; ${AGREGADOR}`)] },
  guaiuba: { fixos: [f(3, 17, "Aniversário de Guaiúba", AGREGADOR, false), f(9, 14, "Santo Cruzeiro", AGREGADOR, false)] },
  horizonte: { fixos: [f(3, 6, "Aniversário de Horizonte", AGREGADOR, false), f(6, 24, "São João Batista", AGREGADOR, false)] },
  itaitinga: { fixos: [f(3, 27, "Aniversário de Itaitinga", AGREGADOR, false), f(6, 13, "Santo Antônio", AGREGADOR, false)] },
  maracanau: { fixos: [f(3, 6, "Aniversário de Maracanaú", TRT), f(3, 19, SAO_JOSE, TRT), f(6, 13, "Santo Antônio", `${SINDICATO}; ${AGREGADOR}`)] },
  maranguape: { fixos: [f(1, 20, "São Sebastião", AGREGADOR, false), f(9, 8, "Nossa Senhora da Penha", AGREGADOR, false), f(11, 17, "Aniversário de Maranguape", AGREGADOR, false)] },
  pacajus: { fixos: [f(5, 23, "Aniversário de Pacajus", `${SINDICATO}; ${AGREGADOR}`), f(12, 8, "Imaculada Conceição (padroeira)", TRT)] },
  pacatuba: { fixos: [f(7, 16, "Nossa Senhora do Carmo", AGREGADOR, false), f(10, 8, "Aniversário de Pacatuba", AGREGADOR, false), f(12, 8, "Imaculada Conceição", AGREGADOR, false)] },
  paracuru: { fixos: [f(11, 22, "Aniversário de Paracuru", AGREGADOR, false)] },
  // o agregador traz Santa Rita em 1º/11; o dia litúrgico é 22/5: entram as duas até a prefeitura confirmar
  paraipaba: { fixos: [f(2, 5, "Aniversário de Paraipaba", AGREGADOR, false), f(5, 22, "Santa Rita de Cássia (dia litúrgico)", "Calendário litúrgico; a confirmar", false), f(11, 1, "Santa Rita de Cássia (data do agregador)", AGREGADOR, false)] },
  pindoretama: { fixos: [f(9, 7, "Aniversário de Pindoretama", AGREGADOR, false), f(11, 27, "Nossa Senhora das Graças", AGREGADOR, false)] },
  "sao-goncalo-do-amarante": { fixos: [f(11, 27, "Aniversário de São Gonçalo do Amarante", TRT)] },
  "sao-luis-do-curu": { fixos: [f(11, 22, "Aniversário de São Luís do Curu", AGREGADOR, false)] },
  trairi: { fixos: [f(11, 22, "Aniversário de Trairi", AGREGADOR, false)] },
};

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), como dia civil. */
export function pascoa(ano: number): number {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, g = Math.floor((8 * b + 13) / 25);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return diaCivil(ano, mes, dia)!;
}

/** Todos os feriados de um ano, para os nacionais/estaduais e para cada município da RMF. */
export function feriadosDoAno(ano: number): Feriado[] {
  const out: Feriado[] = [];
  const p = pascoa(ano);
  for (const n of NACIONAIS) out.push({ dia: diaCivil(ano, n.mes, n.dia)!, nome: n.nome, esfera: "nacional", abrangencia: "CE", base: n.base, confirmado: true });
  out.push({ dia: p + SEXTA_SANTA.deslocamento, nome: SEXTA_SANTA.nome, esfera: "nacional", abrangencia: "CE", base: SEXTA_SANTA.base, confirmado: true });
  for (const c of CARNAVAL) out.push({ dia: p + c.deslocamento, nome: c.nome, esfera: "facultativo", abrangencia: "CE", base: c.base, confirmado: true });
  out.push({ dia: diaCivil(ano, 3, 25)!, nome: "Data Magna do Ceará (abolição da escravatura)", esfera: "estadual", abrangencia: "CE", base: DATA_MAGNA, confirmado: true });
  for (const [id, r] of Object.entries(MUNICIPAIS)) {
    for (const x of r.fixos) out.push({ dia: diaCivil(ano, x.mes, x.dia)!, nome: x.nome, esfera: "municipal", abrangencia: id, base: x.base, confirmado: x.confirmado });
    if (r.corpusChristi) out.push({ dia: p + CORPUS_CHRISTI, nome: "Corpus Christi", esfera: "municipal", abrangencia: id, base: r.corpusChristi, confirmado: true });
    for (const a of r.avulsos ?? []) if (a.ano === ano) out.push({ dia: diaCivil(ano, a.mes, a.dia)!, nome: a.nome, esfera: "municipal", abrangencia: id, base: a.base, confirmado: true });
  }
  return out.sort((x, y) => x.dia - y.dia);
}

/** Base completa de 2026 a 2030: o que vai para o banco local. */
export function baseDeFeriados(): Feriado[] {
  const out: Feriado[] = [];
  for (let ano = ANO_INICIAL; ano <= ANO_FINAL; ano++) out.push(...feriadosDoAno(ano));
  return out;
}

/** Feriados que valem para o município (nacionais, estaduais, Carnaval e os municipais dele), no intervalo [ini, fim]. */
export function filtrarFeriados<T extends Feriado>(base: T[], municipio: string, ini: number, fim: number): T[] {
  return base.filter((x) => x.dia >= ini && x.dia <= fim && (x.abrangencia === "CE" || x.abrangencia === municipio));
}

/** 0 = domingo … 6 = sábado (o dia civil 0, 1/1/1970, foi quinta-feira). */
export const diaDaSemana = (dia: number) => (((dia + 4) % 7) + 7) % 7;

/** Dias úteis de obra em [ini, fim]: segunda a sexta, fora feriados e Carnaval. */
export function contarDiasUteis(ini: number, fim: number, feriados: Iterable<number>): number {
  const fora = new Set(feriados);
  let n = 0;
  for (let d = ini; d <= fim; d++) {
    const s = diaDaSemana(d);
    if (s !== 0 && s !== 6 && !fora.has(d)) n++;
  }
  return n;
}

/** Ano coberto pela base? Fora dela, a contagem só desconta fins de semana. */
export const anoCoberto = (dia: number) => {
  const a = partes(dia).ano;
  return a >= ANO_INICIAL && a <= ANO_FINAL;
};

export const FORMULA_DIAS_UTEIS =
  "Dias úteis = dias corridos − sábados − domingos − feriados em dia de semana\nFeriados: nacionais, Data Magna do Ceará (25/3), Carnaval e os municipais do município da obra";
