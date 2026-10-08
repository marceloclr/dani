import { describe, expect, it } from "vitest";
import { MARCA_S, cenaNoTempo, duracoes, roteiroDasFalas } from "../src/rendering/montagem";

describe("roteiro a partir das falas (ADR-30)", () => {
  it("terreno, sobre a obra e só a voz: cenas na ordem das falas e marca no fim", () => {
    const { cenas, totalS } = roteiroDasFalas([
      { cena: "terreno", duracaoS: 10 },
      { cena: "sobre-obra", duracaoS: 14 },
      { cena: "voz", duracaoS: 12 },
    ]);
    expect(totalS).toBe(36 + MARCA_S);
    expect(cenas.reduce((s, c) => s + c.peso, 0)).toBeCloseTo(1);
    const seg = duracoes(cenas, totalS);
    // abertura + revelação ocupam exatamente a primeira fala
    expect(cenas.slice(0, 2).map((c) => c.tipo)).toEqual(["fala", "revelacao"]);
    expect(seg[0] + seg[1]).toBeCloseTo(10);
    // a segunda fala começa no segundo 10 com ela recortada
    expect(cenaNoTempo(cenas, 10.01, totalS).cena).toMatchObject({ tipo: "obra", pessoa: "recortada" });
    // a terceira (só a voz) começa no 24, sem a pessoa, e termina no passeio do drone pela obra pronta
    expect(cenaNoTempo(cenas, 24.01, totalS).cena.pessoa).toBe("oculta");
    const passeio = cenas[cenas.length - 2];
    expect(passeio).toMatchObject({ camera: "orbita", percurso: "volta", rotulo: "Volta por fora", obra: [1, 1], pessoa: "oculta" }); // padrão: externo
    expect(seg[cenas.length - 2]).toBeCloseTo(12 * 0.4);
    expect(cenas[cenas.length - 1].tipo).toBe("marca");
    expect(seg[cenas.length - 1]).toBeCloseTo(MARCA_S);
  });

  it("a obra se forma de 0 a 1 ao longo das tomadas, sem voltar, e as tomadas têm de 2 a 5 s", () => {
    const { cenas, totalS } = roteiroDasFalas([{ cena: "sobre-obra", duracaoS: 20 }, { cena: "sobre-obra", duracaoS: 9 }]);
    const tomadas = cenas.filter((c) => c.tipo === "obra" && !c.percurso);
    expect(tomadas[0].obra[0]).toBe(0);
    expect(tomadas[tomadas.length - 1].obra[1]).toBeCloseTo(1);
    tomadas.forEach((c, i) => i && expect(c.obra[0]).toBeCloseTo(tomadas[i - 1].obra[1]));
    const seg = duracoes(cenas, totalS);
    cenas.forEach((c, i) => c.tipo === "obra" && !c.percurso && expect(seg[i]).toBeGreaterThanOrEqual(2) && expect(seg[i]).toBeLessThanOrEqual(5));
    // câmeras em rodízio: duas tomadas seguidas nunca repetem a câmera
    tomadas.forEach((c, i) => i && expect(c.camera).not.toBe(tomadas[i - 1].camera));
  });

  it("fala curta não ganha passeio; sem falas, volta ao roteiro sem pessoa", () => {
    const curta = roteiroDasFalas([{ cena: "sobre-obra", duracaoS: 4 }]);
    expect(curta.cenas.some((c) => c.percurso)).toBe(false);
    const nada = roteiroDasFalas([]);
    expect(nada.cenas.every((c) => c.pessoa === "oculta")).toBe(true);
  });
});

describe("sequência de falas", async () => {
  const { localizarNaSequencia } = await import("../src/rendering/apresentadora");
  const trechos = [{ inicioS: 1, fimS: 4 }, { inicioS: 0, fimS: 5 }];
  it("leva o tempo do vídeo ao arquivo e ao corte certos", () => {
    expect(localizarNaSequencia(trechos, 0)).toEqual({ indice: 0, tArquivo: 1 });
    expect(localizarNaSequencia(trechos, 2.5)).toEqual({ indice: 0, tArquivo: 3.5 });
    expect(localizarNaSequencia(trechos, 3)).toEqual({ indice: 1, tArquivo: 0 });
    expect(localizarNaSequencia(trechos, 7.5)).toEqual({ indice: 1, tArquivo: 4.5 });
    // depois do fim (a marca), fica no último quadro da última fala
    expect(localizarNaSequencia(trechos, 20)).toEqual({ indice: 1, tArquivo: 5 });
  });
});

describe("falas da planilha × arquivos recebidos", async () => {
  const { montarFalas } = await import("../src/app/falas");
  const arq = (nome: string, duracaoS: number) => [nome.toLowerCase(), { nome, blob: new Blob([nome]), duracaoS, largura: 1080, altura: 1920 }] as const;
  it("casa pelo nome (sem caixa), aplica o corte e aponta o que falta", () => {
    const r = montarFalas(
      [
        { ordem: 1, arquivo: "Abertura.MP4", assunto: "", cena: "terreno", recorte: "ia", inicioS: 1 },
        { ordem: 2, arquivo: "etapas.mp4", assunto: "", cena: "sobre-obra", recorte: "verde", fimS: 30 },
        { ordem: 3, arquivo: "final.mp4", assunto: "", cena: "voz", recorte: "ia" },
      ],
      new Map([arq("abertura.mp4", 9), arq("etapas.mp4", 12)]),
    );
    expect(r.faltando).toEqual(["final.mp4"]);
    expect(r.trechos.map((t) => [t.inicioS, t.fimS])).toEqual([[1, 9], [0, 12]]);
    expect(r.avisos.join(" ")).toMatch(/passa do fim/);
    expect(r.avisos.join(" ")).toMatch(/recortes diferentes/);
    expect(r.totalS).toBeCloseTo(8 + 12 + 2.5);
    expect(r.cfg).toMatchObject({ arquivo: "2 falas", recorte: "ia", largura: 1080, altura: 1920, duracaoS: r.totalS, acompanharFala: true });
  });
});

describe("aba Falas vazia", async () => {
  const { montarFalas } = await import("../src/app/falas");
  it("os vídeos recebidos viram as falas, na ordem de envio", () => {
    const recebidos = new Map([
      ["b.mp4", { nome: "B.mp4", blob: new Blob(["b"]), duracaoS: 5, largura: 1080, altura: 1920 }],
      ["a.mp4", { nome: "a.mp4", blob: new Blob(["a"]), duracaoS: 7, largura: 1080, altura: 1920 }],
    ]);
    const r = montarFalas([], recebidos);
    expect(r.automaticas).toBe(true);
    expect(r.trechos.map((t) => [t.linha.arquivo, t.linha.cena, t.linha.recorte])).toEqual([["B.mp4", "sobre-obra", "ia"], ["a.mp4", "sobre-obra", "ia"]]);
    expect(r.totalS).toBeCloseTo(12 + 2.5);
    expect(r.naoCitados).toEqual([]);
  });
  it("com a aba preenchida, o vídeo que ela não cita fica de fora e é apontado", () => {
    const recebidos = new Map([["extra.mp4", { nome: "extra.mp4", blob: new Blob(["x"]), duracaoS: 5, largura: 1080, altura: 1920 }]]);
    const r = montarFalas([{ ordem: 1, arquivo: "fala.mp4", assunto: "", cena: "terreno", recorte: "ia" }], recebidos);
    expect(r.automaticas).toBe(false);
    expect(r.faltando).toEqual(["fala.mp4"]);
    expect(r.naoCitados).toEqual(["extra.mp4"]);
  });
});

describe("passeio externo, interno ou ambos (ADR-32)", async () => {
  const { roteiroDasFalas, CAMERAS_TOMADA, duracoes, MARCA_S, trechoInterno, ANTES_DA_PORTA_M, PASSEIO_DESDE_PORTA_M, VELOCIDADE_INTERNA } = await import("../src/rendering/montagem");
  const fala = [{ cena: "sobre-obra" as const, duracaoS: 20 }];
  const fim = (passeio: "externo" | "interno" | "ambos") => {
    const { cenas, totalS } = roteiroDasFalas(fala, { passeio });
    const seg = duracoes(cenas, totalS);
    return cenas.map((c, i) => ({ c, s: seg[i] })).filter((x) => x.c.percurso);
  };
  it("externo: uma volta por fora de 8 s (40 % de 20 s); interno: por dentro, 10 s; ambos: fora 4,4 s e depois dentro 6,6 s", () => {
    const e = fim("externo"), i = fim("interno"), a = fim("ambos");
    expect(e.map((x) => [x.c.percurso, x.c.camera])).toEqual([["volta", "orbita"]]);
    expect(e[0].s).toBeCloseTo(8);
    expect(i.map((x) => [x.c.percurso, x.c.camera, x.c.rotulo])).toEqual([["interno", "drone", "Por dentro"]]);
    expect(i[0].s).toBeCloseTo(10);
    expect(a.map((x) => x.c.percurso)).toEqual(["volta", "interno"]);
    expect(a[0].s).toBeCloseTo(11 * 0.4);
    expect(a[1].s).toBeCloseTo(11 * 0.6);
    // total sempre = falas + marca
    for (const p of ["externo", "interno", "ambos"] as const) expect(roteiroDasFalas(fala, { passeio: p }).totalS).toBe(20 + MARCA_S);
  });
  it("tomadas começam pela isométrica, sem vista de cima nem lateral", () => {
    expect(CAMERAS_TOMADA[0]).toBe("isometrica");
    expect(CAMERAS_TOMADA).not.toContain("superior");
    expect(CAMERAS_TOMADA).not.toContain("lateral");
  });
  it("por dentro: começa de frente para a porta, a 1,5 m, anda 1 m/s e nunca passa da volta final", () => {
    // voo sintético: 200 m andando em u de 0 a 0,9; passeio a 3,5 m da porta em u = 0,5; volta final em u = 0,6
    const voo = { comprimento: 200, marcas: { fimConstrucao: 0.3, inicioInterno: 0.45, naPorta: 0.5, inicioVoltaFinal: 0.6, fimMovimento: 0.9 } };
    const mPorU = 200 / 0.9;
    expect(trechoInterno(0, voo, 8)).toBeCloseTo(0.5 + (PASSEIO_DESDE_PORTA_M - ANTES_DA_PORTA_M) / mPorU);
    expect((trechoInterno(1, voo, 8) - trechoInterno(0, voo, 8)) * mPorU).toBeCloseTo(VELOCIDADE_INTERNA * 8);
    // cena longa demais para o caminho: para na volta final
    expect(trechoInterno(1, voo, 60)).toBeCloseTo(0.6);
  });
});
