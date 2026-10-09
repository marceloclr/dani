// Legendas animadas (INC-21): palavras e asteriscos, trechos de fala pela energia, sincronização, grupos e destaque.
import { describe, expect, it } from "vitest";
import { GRUPO_CARACTERES, GRUPO_MAX, POP_S, SOBRA_S, gruposDaLegenda, legendaNoTempo, legendasDoVideo, palavrasDoTexto, sincronizar, temMarcacao, trechosDeFala } from "../src/rendering/legendas";

const TAXA = 8000;
/** Áudio de teste: tom de 220 Hz nos trechos de fala, silêncio (ou ruído leve) no resto. */
function audio(durS: number, fala: [number, number][], ruido = 0): Float32Array {
  const a = new Float32Array(Math.round(durS * TAXA));
  for (let i = 0; i < a.length; i++) {
    const t = i / TAXA;
    a[i] = (fala.some(([x, y]) => t >= x && t < y) ? 0.5 * Math.sin(2 * Math.PI * 220 * t) : 0) + ruido * Math.sin(i * 12.9898);
  }
  return a;
}

describe("palavrasDoTexto", () => {
  it("separa as palavras, guarda a pontuação como pausa e conta as sílabas", () => {
    const p = palavrasDoTexto("Hoje eu vou conversar um pouco, sobre essa obra. Lindo!");
    expect(p.map((x) => x.texto)).toEqual(["Hoje", "eu", "vou", "conversar", "um", "pouco,", "sobre", "essa", "obra.", "Lindo!"]);
    expect(p[5].pausa).toBe(1);
    expect(p[8].pausa).toBe(2);
    expect(p[9].pausa).toBe(2);
    expect(p[3].silabas).toBe(3); // con-ver-sar
    expect(p[0].pausa).toBe(0);
  });
  it("tira os asteriscos e marca as palavras, inclusive em várias palavras e antes da pontuação", () => {
    const p = palavrasDoTexto("essa *obra* que *nós entregamos*, um *banheiro,* completo");
    expect(p.map((x) => x.texto)).toEqual(["essa", "obra", "que", "nós", "entregamos,", "um", "banheiro,", "completo"]);
    expect(p.map((x) => x.marcada)).toEqual([false, true, false, true, true, false, true, false]);
    expect(temMarcacao("essa *obra*")).toBe(true);
    expect(temMarcacao("3 * 4")).toBe(false);
  });
  it("números pesam pelo tamanho; pontuação solta reforça a pausa", () => {
    const p = palavrasDoTexto("esses 100 metros quadrados ... e mais");
    expect(p.map((x) => x.texto)).toEqual(["esses", "100", "metros", "quadrados", "e", "mais"]);
    expect(p[1].silabas).toBeGreaterThanOrEqual(4);
    expect(p[3].pausa).toBe(2);
  });
});

describe("trechosDeFala", () => {
  it("acha os trechos separados por pausas e ignora pausas curtas", () => {
    const t = trechosDeFala(audio(6, [[0.5, 1.8], [1.9, 2.5], [3.2, 5.0]]), TAXA);
    expect(t.length).toBe(2);
    expect(t[0][0]).toBeCloseTo(0.5, 1);
    expect(t[0][1]).toBeCloseTo(2.5, 1);
    expect(t[1][0]).toBeCloseTo(3.2, 1);
    expect(t[1][1]).toBeCloseTo(5.0, 1);
  });
  it("funciona com ruído de fundo leve", () => {
    const t = trechosDeFala(audio(4, [[0.3, 1.5], [2.2, 3.6]], 0.01), TAXA);
    expect(t.length).toBe(2);
  });
  it("sem contraste (som contínuo, como música por baixo), um trecho só", () => {
    const t = trechosDeFala(audio(3, [[0, 3]]), TAXA);
    expect(t).toEqual([[0, 3]]);
  });
  it("silêncio: nenhum trecho", () => {
    expect(trechosDeFala(new Float32Array(TAXA * 2), TAXA)).toEqual([]);
  });
});

describe("sincronizar", () => {
  it("sem pausas, as palavras dividem a voz pelas sílabas, em ordem e sem sair dela", () => {
    const p = palavrasDoTexto("casa bonita demais");
    const t = sincronizar(p, [], 4.5);
    expect(t[0].ini).toBe(0);
    expect(t[2].fim).toBeCloseTo(4.5, 3);
    // casa (2), bonita (3), demais (2): bonita fala mais tempo
    expect(t[1].fim - t[1].ini).toBeGreaterThan(t[0].fim - t[0].ini);
    for (let k = 1; k < t.length; k++) expect(t[k].ini).toBeGreaterThanOrEqual(t[k - 1].fim - 1e-9);
  });
  it("pula as pausas da voz e o fim da frase gruda na pausa", () => {
    // duas frases de mesmo peso; a primeira fala de 0 a 2 s, pausa de 1 s, a segunda de 3 a 5 s
    const p = palavrasDoTexto("Aqui demolimos tudo. Depois fizemos tudo.");
    const t = sincronizar(p, [[0, 2], [3, 5]], 5);
    expect(t[2].fim).toBeCloseTo(2, 2);
    expect(t[3].ini).toBeCloseTo(3, 2);
    // nenhuma palavra cai dentro da pausa
    for (const x of t) expect(x.ini >= 2 && x.ini < 3).toBe(false);
  });
  it("frase longe de qualquer pausa não gruda: segue as sílabas", () => {
    const p = palavrasDoTexto("um dois três, quatro cinco seis sete oito nove dez onze doze treze");
    const t = sincronizar(p, [[0, 9], [9.3, 10]], 10);
    // a vírgula cai perto de 2,5 s de fala: a pausa de 9 s está longe e não puxa
    expect(t[2].fim).toBeLessThan(4);
  });
});

describe("gruposDaLegenda", () => {
  const texto = "Hoje eu vou conversar um pouco sobre essa obra que nós entregamos. É uma cozinha linda, integrada!";
  const p = palavrasDoTexto(texto);
  const tempos = sincronizar(p, [], 10);
  const grupos = gruposDaLegenda(p, tempos, false);
  it("grupos de até 4 palavras e 22 letras, quebrando na pontuação", () => {
    for (const g of grupos) {
      expect(g.palavras.length).toBeLessThanOrEqual(GRUPO_MAX);
      if (g.palavras.length > 1) expect(g.palavras.map((x) => x.texto).join(" ").length).toBeLessThanOrEqual(GRUPO_CARACTERES);
    }
    expect(grupos.flatMap((g) => g.palavras.map((x) => x.texto))).toEqual(p.map((x) => x.texto));
    // "entregamos." fecha um grupo
    expect(grupos.some((g) => g.palavras[g.palavras.length - 1].texto === "entregamos.")).toBe(true);
  });
  it("destaque automático: a palavra forte mais longa, nunca as fracas", () => {
    const d = grupos.flatMap((g) => g.palavras.filter((x) => x.destaque).map((x) => x.texto));
    expect(d).toContain("conversar");
    for (const f of ["eu", "um", "que", "nós", "É", "uma"]) expect(d).not.toContain(f);
    for (const g of grupos) expect(g.palavras.filter((x) => x.destaque).length).toBeLessThanOrEqual(1);
  });
  it("com asteriscos, só as marcadas se destacam", () => {
    const t2 = "Essa *obra* que nós entregamos. É *linda*.";
    const g2 = legendasDoVideo(t2, [], 6, 0);
    expect(g2.flatMap((g) => g.palavras.filter((x) => x.destaque).map((x) => x.texto))).toEqual(["obra", "linda."]);
  });
  it("o grupo fica até o seguinte começar, ou 0,4 s depois da última palavra", () => {
    for (let j = 0; j < grupos.length - 1; j++) expect(grupos[j].fim).toBeLessThanOrEqual(grupos[j + 1].ini + 1e-9);
    const ult = grupos[grupos.length - 1];
    expect(ult.fim).toBeCloseTo(ult.palavras[ult.palavras.length - 1].fim + SOBRA_S, 3);
  });
});

describe("legendasDoVideo e legendaNoTempo", () => {
  it("leva para o relógio do vídeo (começo da voz e atraso, limitado a 1 s)", () => {
    const a = legendasDoVideo("casa bonita", [], 2, 1.2);
    const b = legendasDoVideo("casa bonita", [], 2, 1.2, 0.5);
    const c = legendasDoVideo("casa bonita", [], 2, 1.2, 5);
    expect(a[0].ini).toBeCloseTo(1.2, 3);
    expect(b[0].ini).toBeCloseTo(1.7, 3);
    expect(c[0].ini).toBeCloseTo(2.2, 3);
    expect(legendasDoVideo("  ", [], 2, 0)).toEqual([]);
  });
  it("palavra a palavra: antes do tempo dela, 0; depois do pop, 1; fora dos grupos, nada", () => {
    const g = legendasDoVideo("casa bonita demais", [], 3, 1);
    expect(legendaNoTempo(g, 0.5)).toBeNull();
    const l = legendaNoTempo(g, 1.01)!;
    expect(l.entradas[0]).toBeGreaterThan(0);
    expect(l.entradas[0]).toBeLessThan(1);
    expect(l.entradas[2]).toBe(0);
    const fim = legendaNoTempo(g, g[0].palavras[2].ini + POP_S + 0.01)!;
    expect(fim.entradas).toEqual([1, 1, 1]);
    expect(legendaNoTempo(g, 10)).toBeNull();
  });
});
