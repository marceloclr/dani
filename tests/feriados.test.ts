// Calendário oficial do Ceará e da RMF para os dias úteis da estimativa (ADR-22).
import { describe, expect, it } from "vitest";
import { estimarCronograma } from "../src/fourd/estimativa";
import { ANO_FINAL, ANO_INICIAL, MUNICIPIOS, OUTRO_MUNICIPIO, baseDeFeriados, contarDiasUteis, diaDaSemana, feriadosDoAno, filtrarFeriados, pascoa } from "../src/fourd/feriados";
import { formatarISO, lerData } from "../src/fourd/tempo";

const d = (iso: string) => lerData(iso)!;
const base = baseDeFeriados();
const doMunicipio = (m: string, a: string, b: string) => filtrarFeriados(base, m, d(a), d(b));
const uteis = (m: string, a: string, b: string) => contarDiasUteis(d(a), d(b), doMunicipio(m, a, b).map((f) => f.dia));

describe("datas móveis", () => {
  it("Páscoa de 2026 a 2030", () => {
    expect([2026, 2027, 2028, 2029, 2030].map((a) => formatarISO(pascoa(a)))).toEqual(["2026-04-05", "2027-03-28", "2028-04-16", "2029-04-01", "2030-04-21"]);
  });
  it("Carnaval, Sexta-feira Santa e Corpus Christi de 2026 em Fortaleza", () => {
    const f = new Map(doMunicipio("fortaleza", "2026-01-01", "2026-12-31").map((x) => [x.nome, formatarISO(x.dia)]));
    expect(f.get("Segunda-feira de Carnaval")).toBe("2026-02-16");
    expect(f.get("Terça-feira de Carnaval")).toBe("2026-02-17");
    expect(f.get("Sexta-feira Santa (Paixão de Cristo)")).toBe("2026-04-03");
    expect(f.get("Corpus Christi")).toBe("2026-06-04");
    expect(f.get("Tricentenário de Fortaleza")).toBe("2026-04-13");
  });
  it("o tricentenário vale só em 2026", () => {
    expect(feriadosDoAno(2027).some((x) => x.nome === "Tricentenário de Fortaleza")).toBe(false);
  });
});

describe("base no banco: 2026 a 2030", () => {
  it("cobre os cinco anos e os 19 municípios da RMF", () => {
    const anos = new Set(base.map((x) => formatarISO(x.dia).slice(0, 4)));
    expect([...anos].sort()).toEqual(["2026", "2027", "2028", "2029", "2030"]);
    expect(ANO_FINAL - ANO_INICIAL).toBe(4);
    expect(MUNICIPIOS).toHaveLength(19);
    for (const m of MUNICIPIOS) expect(base.some((x) => x.abrangencia === m.id), m.nome).toBe(true);
    expect(base).toHaveLength(5 * (13 + 42) + 1); // por ano: 13 do Ceará inteiro e 42 municipais; mais o tricentenário
  });
  it("Data Magna do Ceará é estadual e vale para todo município", () => {
    const dm = doMunicipio(OUTRO_MUNICIPIO, "2027-03-25", "2027-03-25");
    expect(dm.map((x) => [x.nome, x.esfera])).toEqual([["Data Magna do Ceará (abolição da escravatura)", "estadual"]]);
  });
  it("feriado municipal de um não vale para outro", () => {
    expect(doMunicipio("caucaia", "2026-10-15", "2026-10-15").map((x) => x.nome)).toEqual(["Aniversário de Caucaia"]);
    expect(doMunicipio("fortaleza", "2026-10-15", "2026-10-15")).toEqual([]);
    expect(doMunicipio(OUTRO_MUNICIPIO, "2026-03-19", "2026-03-19")).toEqual([]); // São José não é feriado estadual
  });
  it("chaves únicas (o banco usa abrangência, dia e nome)", () => {
    const chaves = base.map((x) => `${x.abrangencia}|${x.dia}|${x.nome}`);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});

describe("contagem de dias úteis (segunda a sexta)", () => {
  it("dia da semana do dia civil", () => {
    expect(diaDaSemana(d("2026-10-07"))).toBe(3); // quarta-feira
    expect(diaDaSemana(d("1970-01-01"))).toBe(4);
  });
  it("janeiro de 2026: 22 dias de semana menos 1º de janeiro", () => {
    expect(uteis("fortaleza", "2026-01-01", "2026-01-31")).toBe(21);
  });
  it("março de 2026 muda conforme o município", () => {
    // 22 dias de semana; 19/3 (qui) e 25/3 (qua) em Fortaleza; Maracanaú tem ainda 6/3 (sex)
    expect(uteis("fortaleza", "2026-03-01", "2026-03-31")).toBe(20);
    expect(uteis("maracanau", "2026-03-01", "2026-03-31")).toBe(19);
    expect(uteis(OUTRO_MUNICIPIO, "2026-03-01", "2026-03-31")).toBe(21);
  });
  it("feriado no fim de semana não desconta duas vezes", () => {
    // 15/8/2026 é sábado
    expect(uteis("fortaleza", "2026-08-10", "2026-08-16")).toBe(5);
  });
  it("dias corridos continuam no cronograma; o município fica gravado", () => {
    const c = estimarCronograma({ area: 120, pavimentos: ["Térreo"], estrutura: "concreto", inicio: d("2026-02-02"), prazo: 180, municipio: "caucaia" });
    expect(c.municipio).toBe("caucaia");
    expect(Math.max(...c.tarefas.map((t) => t.fim))).toBe(179);
    const fim = c.inicio + 179;
    const n = contarDiasUteis(c.inicio, fim, filtrarFeriados(base, "caucaia", c.inicio, fim).map((x) => x.dia));
    expect(n).toBeLessThan(180 * (5 / 7));
    expect(n).toBeGreaterThan(110);
  });
});
