import { describe, expect, it } from "vitest";
import { MARCA_S, RESPIRO_S, cenaNoTempo, duracoes, roteiroDasFalas } from "../src/rendering/montagem";

describe("roteiro a partir das falas (ADR-30)", () => {
  it("terreno, sobre a obra e só a voz: cenas na ordem das falas e marca no fim", () => {
    const { cenas, totalS } = roteiroDasFalas([
      { cena: "terreno", duracaoS: 10 },
      { cena: "sobre-obra", duracaoS: 14 },
      { cena: "voz", duracaoS: 12 },
    ]);
    expect(totalS).toBe(36 + RESPIRO_S + MARCA_S); // ADR-34: respiro de 1 s antes da marca
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
    expect(seg[cenas.length - 2]).toBeCloseTo(12 * 0.4 + RESPIRO_S); // a última cena ganha o respiro
    expect(cenas[cenas.length - 1].tipo).toBe("marca");
    expect(seg[cenas.length - 1]).toBeCloseTo(MARCA_S);
  });

  it("a obra se forma de 0 a 1 ao longo das falas, sem voltar, uma cena por fala na câmera contínua (ADR-41)", () => {
    const { cenas } = roteiroDasFalas([{ cena: "sobre-obra", duracaoS: 20 }, { cena: "sobre-obra", duracaoS: 9 }]);
    const tomadas = cenas.filter((c) => c.tipo === "obra" && !c.percurso);
    expect(tomadas[0].obra[0]).toBe(0);
    expect(tomadas[tomadas.length - 1].obra[1]).toBeCloseTo(1);
    tomadas.forEach((c, i) => i && expect(c.obra[0]).toBeCloseTo(tomadas[i - 1].obra[1]));
    // sem cortes dentro da fala: a primeira (20 s) é uma cena só; a segunda (9 s) divide-se com o passeio
    expect(tomadas).toHaveLength(2);
    expect(tomadas.every((c) => c.camera === "continua")).toBe(true);
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
    expect(r.totalS).toBeCloseTo(8 + 12 + RESPIRO_S + 2.5);
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
    expect(r.totalS).toBeCloseTo(12 + RESPIRO_S + 2.5);
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
  const { roteiroDasFalas, CONTINUA, poseDaCena, duracoes, MARCA_S, RESPIRO_S, trechoInterno, ANTES_DA_PORTA_M, PASSEIO_DESDE_PORTA_M, VELOCIDADE_INTERNA } = await import("../src/rendering/montagem");
  const fala = [{ cena: "sobre-obra" as const, duracaoS: 20 }];
  const fim = (passeio: "externo" | "interno" | "ambos") => {
    const { cenas, totalS } = roteiroDasFalas(fala, { passeio });
    const seg = duracoes(cenas, totalS);
    return cenas.map((c, i) => ({ c, s: seg[i] })).filter((x) => x.c.percurso);
  };
  it("externo: uma volta por fora de 8 s (40 % de 20 s); interno: por dentro, 10 s; ambos: fora 4,4 s e depois dentro 6,6 s (+ o respiro na última)", () => {
    const e = fim("externo"), i = fim("interno"), a = fim("ambos");
    expect(e.map((x) => [x.c.percurso, x.c.camera])).toEqual([["volta", "orbita"]]);
    expect(e[0].s).toBeCloseTo(8 + RESPIRO_S);
    expect(i.map((x) => [x.c.percurso, x.c.camera, x.c.rotulo])).toEqual([["interno", "drone", "Por dentro"]]);
    expect(i[0].s).toBeCloseTo(10 + RESPIRO_S);
    expect(a.map((x) => x.c.percurso)).toEqual(["volta", "interno"]);
    expect(a[0].s).toBeCloseTo(11 * 0.4);
    expect(a[1].s).toBeCloseTo(11 * 0.6 + RESPIRO_S);
    // total sempre = falas + respiro + marca
    for (const p of ["externo", "interno", "ambos"] as const) expect(roteiroDasFalas(fala, { passeio: p }).totalS).toBe(20 + RESPIRO_S + MARCA_S);
  });
  it("câmera contínua: segue a obra, sem salto entre falas, e a volta por fora começa onde ela parou (ADR-41)", () => {
    const e = { centro: [0, 0, 0] as [number, number, number], raio: 10 };
    const graus = (r: number) => (r * 180) / Math.PI;
    // a mesma obra dá a mesma pose, em qualquer cena: fim de uma fala = começo da seguinte
    const fimA = poseDaCena("continua", e, 1, undefined, [0, 0.4]);
    const iniB = poseDaCena("continua", e, 0, undefined, [0.4, 1]);
    expect(iniB).toEqual(fimA);
    expect(graus(poseDaCena("continua", e, 0, undefined, [0, 1]).az)).toBeCloseTo(CONTINUA.azIni);
    const fim = poseDaCena("continua", e, 1, undefined, [0, 1]);
    expect(graus(fim.az)).toBeCloseTo(CONTINUA.azFim);
    // gira sempre no mesmo sentido, devagar: 60° em toda a obra
    expect(CONTINUA.azFim - CONTINUA.azIni).toBe(60);
    const volta0 = poseDaCena("orbita", e, 0, "volta"), volta1 = poseDaCena("orbita", e, 1, "volta");
    expect(graus(volta0.az)).toBeCloseTo(CONTINUA.azFim);
    // sem degrau: a volta começa na altura em que a contínua terminou
    expect(graus(volta0.el)).toBeCloseTo(CONTINUA.elFim);
    expect(graus(volta0.el)).toBeCloseTo(graus(fim.el));
    expect(volta1.az).toBeGreaterThan(volta0.az);
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

describe("sequência do vídeo (ADR-34)", async () => {
  const { montarFalas } = await import("../src/app/falas");
  const { MARCA_S: MARCA, RESPIRO_S: RESPIRO } = await import("../src/rendering/montagem");
  type Arq = [string, { nome: string; blob: Blob; duracaoS: number; largura: number; altura: number }];
  const video = (nome: string, duracaoS: number): Arq => [nome.toLowerCase(), { nome, blob: new Blob([nome]), duracaoS, largura: 1080, altura: 1920 }];
  const audio = (nome: string, duracaoS: number): Arq => [nome.toLowerCase(), { nome, blob: new Blob([nome]), duracaoS, largura: 0, altura: 0 }];
  const foto = (nome: string, obra: number | null) => ({ nome, blob: new Blob([nome]), obra, data: "10/03/2026", etapa: "Fundação", descricao: "Sapatas" });
  const linha = (ordem: number, arquivo: string) => ({ ordem, arquivo, assunto: "", cena: "sobre-obra" as const, recorte: "ia" as const });

  it("narração que a aba Falas não cita entra depois das falas, sem a pessoa; vídeo não citado continua de fora", () => {
    const r = montarFalas([linha(1, "a.mp4")], new Map([video("a.mp4", 10), audio("narra.mp3", 6), video("extra.mp4", 4)]));
    expect(r.itens.map((i) => [i.tipo, i.nome])).toEqual([["fala", "a.mp4"], ["narracao", "narra.mp3"]]);
    expect(r.naoCitados).toEqual(["extra.mp4"]);
    expect(r.linhaDoTempo.map((t) => !!t.semVideo)).toEqual([false, true]);
    expect(r.totalS).toBeCloseTo(16 + RESPIRO + MARCA);
    // a pessoa (camada) só existe com vídeo de fala
    expect(r.cfg?.largura).toBe(1080);
    expect(montarFalas([], new Map([audio("so.mp3", 5)])).cfg).toBeNull();
  });

  it("fotos pela data entre as vozes, com lacuna em silêncio e cena de foto na obra do dia dela", () => {
    const r = montarFalas([], new Map([video("a.mp4", 10), video("b.mp4", 10)]), {}, "externo", { fotos: [foto("tarde.jpg", 0.9), foto("cedo.jpg", 0.3)] });
    expect(r.itens.map((i) => i.nome)).toEqual(["a.mp4", "cedo.jpg", "b.mp4", "tarde.jpg"]);
    expect(r.linhaDoTempo.map((t) => [t.arquivo === null, t.fimS - t.inicioS])).toEqual([[false, 10], [true, 3], [false, 10], [true, 3]]);
    expect(r.totalS).toBeCloseTo(26 + RESPIRO + MARCA);
    const cenasFoto = r.cenas.filter((c) => c.tipo === "foto");
    expect(cenasFoto.map((c) => [c.foto, c.obra[0], c.camera])).toEqual([[0, 0.3, "isometrica"], [1, 0.9, "isometrica"]]);
    expect(r.fotos.map((f) => f.nome)).toEqual(["cedo.jpg", "tarde.jpg"]);
  });

  it("ordem salva e duração da foto valem; sem voz, a obra em silêncio pelo tempo da aba Vídeo; trilhas com o segundo em que entram", () => {
    const r = montarFalas([], new Map(), {}, "externo", {
      fotos: [foto("f.jpg", 0.5)],
      ordem: ["foto:f.jpg", "obra"],
      duracoesFoto: { "foto:f.jpg": 5 },
      trilhas: [{ nome: "abre.mp3", blob: new Blob(["a"]), duracaoS: 30 }, { nome: "fecha.mp3", blob: new Blob(["f"]), duracaoS: 30 }],
      semVozS: 15,
    });
    expect(r.itens.map((i) => [i.id, i.duracaoS])).toEqual([["foto:f.jpg", 5], ["obra", 15]]);
    expect(r.totalS).toBeCloseTo(20 + RESPIRO + MARCA);
    // final = 8 s antes do fim dos itens (20 s) = 12 s
    expect(r.trilhas.map((t) => [t.nome, t.entra, t.iniS])).toEqual([["abre.mp3", "inicio", 0], ["fecha.mp3", "final", 12]]);
    expect(r.linhaDoTempo.every((t) => t.arquivo === null)).toBe(true);
  });

  it("nada enviado: sem itens (o assistente usa o roteiro sem pessoa)", () => {
    expect(montarFalas([], new Map()).itens).toEqual([]);
  });
});
