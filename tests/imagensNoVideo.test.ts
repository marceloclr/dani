// Vídeo de imagens (INC-19): ambientes, seleção pela duração, plano de tempos, movimento e títulos.
import { describe, expect, it } from "vitest";
import {
  DISSOLVE_S,
  IMAGEM_MIN_S,
  TITULO_S,
  VOZ_INICIO_S,
  ZOOM_MOVIMENTO,
  ambientesDe,
  camadasNoTempo,
  duracaoPelaNarracao,
  imagensQueCabem,
  movimentoDa,
  planoDoVideo,
  recorteNoTempo,
  recorteQueCobre,
  selecionarPelaDuracao,
  tituloNoTempo,
  type ImagemDoVideo,
} from "../src/rendering/imagensNoVideo";

const img = (titulo = "", marcada = true, largura = 2133, altura = 1200): ImagemDoVideo => ({ largura, altura, titulo, marcada });
// 3 ambientes: sala (4 imagens), cozinha (2), suíte (6)
const PROJETO = [img("Sala"), img(), img(), img(), img("Cozinha"), img(), img("Suíte"), img(), img(), img(), img(), img()];

describe("ambientes", () => {
  it("cada título abre um ambiente; sem título, continua o anterior", () => {
    expect(ambientesDe(PROJETO).map((a) => [a.titulo, a.indices.length])).toEqual([["Sala", 4], ["Cozinha", 2], ["Suíte", 6]]);
    expect(ambientesDe([img(), img("Sala")]).map((a) => a.titulo)).toEqual([null, "Sala"]);
  });
});

describe("seleção pela duração", () => {
  it("quantas cabem: 3 s cada, com a dissolução sobrepondo", () => {
    expect(imagensQueCabem(15)).toBe(6); // (15 − 0,6) ÷ 2,4
    expect(imagensQueCabem(60)).toBe(24);
    expect(imagensQueCabem(15, IMAGEM_MIN_S)).toBe(10);
  });
  it("15 s: 6 imagens, ao menos uma por ambiente, proporcional ao tamanho, a primeira de cada ambiente", () => {
    const m = selecionarPelaDuracao(PROJETO, 15);
    expect(m.filter(Boolean)).toHaveLength(6);
    const porAmb = ambientesDe(PROJETO).map((a) => a.indices.filter((i) => m[i]).length);
    expect(porAmb).toEqual([2, 1, 3]);
    expect([m[0], m[4], m[6]]).toEqual([true, true, true]);
  });
  it("duração maior que o total: marca todas", () => {
    expect(selecionarPelaDuracao(PROJETO, 60).every(Boolean)).toBe(true);
  });
  it("menos imagens que ambientes: uma de ambientes espalhados", () => {
    const muitos = Array.from({ length: 10 }, (_, i) => img(`A${i}`));
    const m = selecionarPelaDuracao(muitos, 5); // cabem 1
    expect(m.filter(Boolean)).toHaveLength(1);
  });
});

describe("plano de tempos", () => {
  it("as marcadas dividem a duração, sobrepostas pela dissolução, e o título vai na 1ª de cada ambiente", () => {
    const imgs = PROJETO.map((im, i) => ({ ...im, marcada: [0, 2, 4, 6, 9].includes(i) }));
    const p = planoDoVideo(imgs, 15, 1080, 1920);
    expect(p.itens.map((x) => x.indice)).toEqual([0, 2, 4, 6, 9]);
    expect(p.itens[0].ini).toBe(0);
    expect(p.itens[4].fim).toBeCloseTo(15, 6);
    expect(p.itens[1].ini).toBeCloseTo(p.itens[0].fim - DISSOLVE_S, 6);
    expect(p.itens.map((x) => x.titulo)).toEqual(["Sala", null, "Cozinha", "Suíte", null]);
    expect(p.aviso).toBeNull();
  });
  it("o título numa imagem desmarcada vale para a primeira marcada do ambiente", () => {
    const imgs = PROJETO.map((im, i) => ({ ...im, marcada: i === 1 || i === 7 }));
    expect(planoDoVideo(imgs, 10, 1920, 1080).itens.map((x) => x.titulo)).toEqual(["Sala", "Suíte"]);
  });
  it("avisa quando as marcadas não cabem e quando ficam tempo demais", () => {
    expect(planoDoVideo(PROJETO, 15, 1920, 1080).aviso).toMatch(/12 imagens não cabem em 15 s: cabem até 10/);
    expect(planoDoVideo([img("Sala")], 15, 1920, 1080).aviso).toMatch(/fica 15,0 s/);
    expect(planoDoVideo([img("", false)], 15, 1920, 1080).aviso).toMatch(/Marque/);
  });
  it("duração pela narração: vinheta + voz + respiro + encerramento", () => {
    expect(duracaoPelaNarracao(37.2)).toBeCloseTo(41.4, 6);
  });
});

describe("camadas e títulos no tempo", () => {
  const p = planoDoVideo([img("Sala"), img(), img("Cozinha")], 9, 1920, 1080);
  it("fora da dissolução, uma imagem; dentro, a de cima com opacidade crescente", () => {
    expect(camadasNoTempo(p, 1).map((c) => c.item.indice)).toEqual([0]);
    const meio = p.itens[1].ini + DISSOLVE_S / 2;
    const c = camadasNoTempo(p, meio);
    expect(c.map((x) => x.item.indice)).toEqual([0, 1]);
    expect(c[1].opacidade).toBeCloseTo(0.5, 6);
    expect(camadasNoTempo(p, 9).at(-1)!.item.indice).toBe(2);
  });
  it("o primeiro título espera a vinheta; os outros entram na dissolução e saem em 2,4 s", () => {
    expect(tituloNoTempo(p, 0.5)).toBeNull();
    expect(tituloNoTempo(p, VOZ_INICIO_S + 1.5)?.texto).toBe("Sala");
    const ini = p.itens[2].ini + DISSOLVE_S / 2;
    expect(tituloNoTempo(p, ini + 1)?.texto).toBe("Cozinha");
    expect(tituloNoTempo(p, ini + 1)?.opacidade).toBe(1);
    expect(tituloNoTempo(p, ini + TITULO_S + 0.1)).toBeNull();
  });
});

describe("movimento", () => {
  it("o recorte que cobre tem a proporção do quadro e cabe na imagem", () => {
    const r = recorteQueCobre(2133, 1200, 1080, 1920);
    expect(r.w / r.h).toBeCloseTo(1080 / 1920, 6);
    expect(r.h).toBe(1200);
    expect(r.x).toBeCloseTo((2133 - r.w) / 2, 6);
  });
  it("render 16:9 num vídeo 9:16: percorre de um lado ao outro, alternando o sentido", () => {
    const a = movimentoDa(0, 2133, 1200, 1080, 1920), b = movimentoDa(1, 2133, 1200, 1080, 1920);
    expect(a.para.x).toBeGreaterThan(a.de.x + 500);
    expect(b.para.x).toBeLessThan(b.de.x - 500);
    expect(a.de.y).toBeCloseTo(a.para.y, 6);
  });
  it("mesma proporção: aproxima e afasta 8 %, sem sair da imagem", () => {
    const a = movimentoDa(0, 1920, 1080, 1920, 1080), b = movimentoDa(1, 1920, 1080, 1920, 1080);
    expect(a.de.w / a.para.w).toBeCloseTo(ZOOM_MOVIMENTO, 6);
    expect(b.para.w / b.de.w).toBeCloseTo(ZOOM_MOVIMENTO, 6);
    for (const m of [a, b]) for (const r of [m.de, m.para, recorteNoTempo(m, 0.5)]) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-9);
      expect(r.y).toBeGreaterThanOrEqual(-1e-9);
      expect(r.x + r.w).toBeLessThanOrEqual(1920 + 1e-9);
      expect(r.y + r.h).toBeLessThanOrEqual(1080 + 1e-9);
    }
  });
  it("o movimento começa e termina nos recortes e anda sempre para a frente", () => {
    const m = movimentoDa(0, 2133, 1200, 1080, 1920);
    expect(recorteNoTempo(m, 0)).toEqual(m.de);
    expect(recorteNoTempo(m, 1).x).toBeCloseTo(m.para.x, 6);
    let ant = -Infinity;
    for (let u = 0; u <= 1; u += 0.05) {
      const x = recorteNoTempo(m, u).x;
      expect(x).toBeGreaterThan(ant);
      ant = x;
    }
  });
});
