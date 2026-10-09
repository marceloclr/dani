// Sequência do vídeo (ADR-34): ordem padrão, ordem salva, mover e trilhas.
import { describe, expect, it } from "vitest";
import { FINAL_ANTES_S, aplicarOrdem, fotosRecomendadas, aplicarTrilhas, inicioDaTrilha, iniciosDasTrilhas, mover, sequenciaPadrao, trilhasPadrao, type ItemSequencia } from "../src/app/sequencia";

const voz = (nome: string, duracaoS: number, tipo: "fala" | "narracao" = "fala"): ItemSequencia => ({ id: `voz:${nome}`, tipo, nome, duracaoS });
const foto = (nome: string, obra: number | null): ItemSequencia => ({ id: `foto:${nome}`, tipo: "foto", nome, duracaoS: 3, obra });

describe("ordem padrão", () => {
  it("fotos entram pela data, depois da voz em que a obra passa do dia delas; sem data, no fim", () => {
    const vozes = [voz("a", 10), voz("b", 10), voz("c", 20)]; // avanço ao fim de cada: 0,25 · 0,5 · 1
    const fotos = [foto("tarde", 0.9), foto("cedo", 0.1), foto("meio", 0.4), foto("sem", null), foto("zero", 0)];
    expect(sequenciaPadrao(vozes, fotos).map((i) => i.nome)).toEqual(["zero", "a", "cedo", "b", "meio", "c", "tarde", "sem"]);
  });
  it("sem vozes, as fotos ficam em ordem de data", () => {
    expect(sequenciaPadrao([], [foto("b", 0.5), foto("a", 0.2)]).map((i) => i.nome)).toEqual(["a", "b"]);
  });
});

describe("ordem salva e mover", () => {
  const padrao = [voz("a", 5), foto("f", 0.5), voz("b", 5), voz("c", 5)];
  it("os salvos ficam na ordem salva; um item novo entra depois do vizinho anterior da ordem padrão", () => {
    // salvo antes de "c" existir; "f" foi para o fim
    expect(aplicarOrdem(padrao, ["voz:b", "voz:a", "foto:f"]).map((i) => i.id)).toEqual(["voz:b", "voz:c", "voz:a", "foto:f"]);
    // id salvo que não existe mais é ignorado
    expect(aplicarOrdem(padrao, ["voz:x", "voz:c"]).map((i) => i.id)[0]).toBe("voz:a");
  });
  it("mover", () => {
    expect(mover(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(mover(["a", "b", "c"], "a", 9)).toEqual(["b", "c", "a"]);
    expect(mover(["a", "b"], "x", 0)).toEqual(["a", "b"]);
  });
});

describe("trilhas", () => {
  const itens = [voz("a", 10), foto("f", 0.3), voz("b", 10), voz("c", 10), voz("d", 10)];
  it("uma: no início; duas: início e final; quatro: início, duas no meio (antes de vozes) e final", () => {
    expect(trilhasPadrao(["t1"], itens).map((t) => t.entra)).toEqual(["inicio"]);
    expect(trilhasPadrao(["t1", "t2"], itens).map((t) => t.entra)).toEqual(["inicio", "final"]);
    const quatro = trilhasPadrao(["t1", "t2", "t3", "t4"], itens).map((t) => t.entra);
    expect(quatro[0]).toBe("inicio");
    expect(quatro[3]).toBe("final");
    expect(quatro.slice(1, 3).every((e) => e.startsWith("voz:"))).toBe(true);
    expect(new Set(quatro).size).toBe(4);
  });
  it("instante de entrada: início = 0, antes de um item = começo dele, final = 8 s antes do fim", () => {
    expect(inicioDaTrilha("inicio", itens)).toBe(0);
    expect(inicioDaTrilha("voz:b", itens)).toBe(13);
    expect(inicioDaTrilha("final", itens)).toBe(43 - FINAL_ANTES_S);
  });
  it("vídeo curto: início e final não se atropelam (a final vai para o meio do caminho)", () => {
    const curto = [voz("a", 5.3)];
    const t = [{ nome: "abre", entra: "inicio", volume: 70 }, { nome: "fecha", entra: "final", volume: 70 }];
    expect(iniciosDasTrilhas(t, curto)).toEqual([0, 2.65]);
    // sem atropelo, ficam onde estão
    expect(iniciosDasTrilhas(t, itens)).toEqual([0, 35]);
  });
  it("a configuração salva vale pelo nome; entrada que aponta para item que saiu volta à padrão; volume de 0 a 100", () => {
    const t = aplicarTrilhas(["t1", "t2"], itens, [{ nome: "T2", entra: "voz:sumiu", volume: 140 }, { nome: "t1", entra: "voz:c", volume: 30 }]);
    expect(t).toEqual([{ nome: "t1", entra: "voz:c", volume: 30 }, { nome: "t2", entra: "final", volume: 100 }]);
  });
});

describe("fotos que combinam com a voz (vídeo da obra)", () => {
  it("até 20 % do tempo de voz, 3 s por foto; ao menos 1; sem voz, até 3", () => {
    expect(fotosRecomendadas(45).ideal).toBe(3);
    expect(fotosRecomendadas(10).ideal).toBe(1);
    expect(fotosRecomendadas(120).ideal).toBe(8);
    expect(fotosRecomendadas(0).ideal).toBe(3);
    expect(fotosRecomendadas(45).texto).toMatch(/Com 45 s de voz, o ideal são até 3 fotos/);
  });
});