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
  roteiroDeTempos,
  tempoDoRoteiro,
  vooNoTempo,
  transicoesDoPlano,
  recomendacaoDeImagens,
  textoDaRecomendacao,
  selecionarPelaDuracao,
  tituloNoTempo,
  type ImagemDoVideo,
} from "../src/rendering/imagensNoVideo";
import { CORTINA, antesDepoisNoTempo, imagensDoPlano } from "../src/rendering/imagensNoVideo";

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
    expect(imagensQueCabem(15, IMAGEM_MIN_S)).toBe(7); // 2,5 s no mínimo
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
    expect(planoDoVideo(PROJETO, 15, 1920, 1080).aviso).toMatch(/12 imagens marcadas não cabem em 15 s sem passar rápido demais: entram 7 \(2,5 s cada/);
    expect(planoDoVideo([img("Sala")], 15, 1920, 1080).aviso).toMatch(/fica 15,0 s/);
    expect(planoDoVideo([img("", false)], 15, 1920, 1080).aviso).toMatch(/Marque/);
  });
  it("duração pela narração: vinheta + voz + respiro + encerramento", () => {
    expect(duracaoPelaNarracao(37.2)).toBeCloseTo(41.4, 6);
  });
});

describe("imagens nunca passam rápido demais", () => {
  it("40 imagens marcadas em 41,4 s (o vídeo de 09/10 trocava a cada 1 s): entram as que cabem a 2,5 s, espalhadas", () => {
    const muitas = Array.from({ length: 40 }, (_, i) => img(i % 5 ? "" : `Ambiente ${i / 5}`));
    const p = planoDoVideo(muitas, 41.4, 1080, 1920);
    expect(p.porImagemS).toBeGreaterThanOrEqual(IMAGEM_MIN_S);
    expect(p.itens).toHaveLength(21);
    expect(p.foraDoVideo).toBe(19);
    expect(p.aviso).toMatch(/entram 21 .* 19 ficam de fora/);
    // os 8 ambientes continuam no vídeo, cada um com o seu título
    expect(p.itens.filter((x) => x.titulo).map((x) => x.titulo)).toEqual(Array.from({ length: 8 }, (_, k) => `Ambiente ${k}`));
    expect(p.itens.at(-1)!.fim).toBeCloseTo(41.4, 6);
  });
});

describe("título não passa para a imagem seguinte", () => {
  it("imagens de 2,5 s: o título sai até a imagem seguinte entrar", () => {
    const p = planoDoVideo([img("Lavabo"), img("Suíte"), img()], 6.2, 1080, 1920); // 2,5 s cada
    const seguinte = p.itens[1].ini;
    expect(tituloNoTempo(p, seguinte + 0.3)?.texto).not.toBe("Lavabo");
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
  it("com capa longa, o primeiro ambiente que já acabou fica sem título (não rotula o seguinte)", () => {
    const curto = planoDoVideo([img("Sala"), img("Lavabo"), img("Cozinha")], 9, 1920, 1080); // 3,4 s cada
    expect(tituloNoTempo(curto, 4.8, 4.6)?.texto).not.toBe("Sala");
    expect(tituloNoTempo(curto, 2.5)?.texto).toBe("Sala"); // sem capa, entra a tempo
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

describe("roteiro de tempos", () => {
  it("tempo no formato m:ss,d", () => {
    expect(tempoDoRoteiro(7.24)).toBe("0:07,2");
    expect(tempoDoRoteiro(65)).toBe("1:05,0");
  });
  it("janela da voz, ambientes com tempo e quantidade, e cada imagem", () => {
    const imgs = [img("Sala"), img(), img("Cozinha"), img("Suíte"), img()];
    const p = planoDoVideo(imgs, 15, 1080, 1920);
    const r = roteiroDeTempos(p, ["p. 2", "p. 3", "p. 21", "p. 43", "p. 44"], "Casa JP&M", { largura: 1080, altura: 1920 });
    expect(r).toContain("ROTEIRO DE NARRAÇÃO — Casa JP&M");
    expect(r).toContain("Vídeo: 0:15,0 · 5 imagens · 1080 × 1920");
    expect(r).toContain("Fale entre 0:01,2 e 0:12,0 (10,8 s de voz).");
    expect(r).toMatch(/0:00,0 – 0:0\d,\d {2}Sala \(2 imagens\)/);
    expect(r).toMatch(/Cozinha \(1 imagem\)/);
    expect(r).toMatch(/ 5\. 0:1\d,\d – 0:15,0 {2}p\. 44/);
  });
});
describe("voo do drone no vídeo de imagens (INC-20)", () => {
  const imgs = [img("Sala"), img(), img("Cozinha"), img()];
  it("abertura e encerramento de 8 s: as imagens dividem o meio, dissolvendo com os voos", () => {
    const p = planoDoVideo(imgs, 30, 1080, 1920, { aberturaS: 8, encerramentoS: 8 });
    expect(p.voos).toEqual([{ parte: "abertura", ini: 0, fim: 8 }, { parte: "encerramento", ini: 22, fim: 30 }]);
    expect(p.itens[0].ini).toBeCloseTo(8 - DISSOLVE_S, 6);
    expect(p.itens.at(-1)!.fim).toBeCloseTo(22 + DISSOLVE_S, 6);
    expect(p.aviso).toBeNull();
  });
  it("duração do voo entre 6 e 12 s e no máximo 40 % de um vídeo curto", () => {
    expect(planoDoVideo(imgs, 60, 1920, 1080, { aberturaS: 20 }).voos[0].fim).toBe(12);
    expect(planoDoVideo(imgs, 60, 1920, 1080, { aberturaS: 3 }).voos[0].fim).toBe(6);
    expect(planoDoVideo(imgs, 15, 1920, 1080, { encerramentoS: 8 }).voos[0].ini).toBe(9);
    expect(planoDoVideo(imgs, 15, 1920, 1080).voos).toEqual([]);
  });
  it("no voo puro não há imagem; a primeira dissolve sobre a abertura; o encerramento entra por cima", () => {
    const p = planoDoVideo(imgs, 30, 1080, 1920, { aberturaS: 8, encerramentoS: 8 });
    expect(camadasNoTempo(p, 3)).toEqual([]);
    expect(vooNoTempo(p, 3)).toMatchObject({ parte: "abertura", opacidade: 1, porCima: false });
    expect(camadasNoTempo(p, 7.7)[0].opacidade).toBeCloseTo(0.5, 6);
    expect(vooNoTempo(p, 15)).toBeNull();
    expect(vooNoTempo(p, 22.3)).toMatchObject({ parte: "encerramento", porCima: true });
    expect(vooNoTempo(p, 22.3)!.opacidade).toBeCloseTo(0.5, 6);
    expect(camadasNoTempo(p, 29)).toEqual([]);
    expect(vooNoTempo(p, 30)?.u).toBe(1);
  });
  it("o primeiro título entra com a primeira imagem, depois do voo de abertura", () => {
    const p = planoDoVideo(imgs, 30, 1080, 1920, { aberturaS: 8 });
    expect(tituloNoTempo(p, 5)).toBeNull();
    expect(tituloNoTempo(p, 8.5)?.texto).toBe("Sala");
  });
  it("aviso fala do tempo que sobra dos voos; o roteiro traz os voos", () => {
    const muitas = Array.from({ length: 12 }, (_, i) => img(i % 3 ? "" : `A${i}`));
    expect(planoDoVideo(muitas, 30, 1080, 1920, { aberturaS: 8, encerramentoS: 8 }).aviso).toMatch(/nos 15,2 s que sobram dos voos/);
    const r = roteiroDeTempos(planoDoVideo(imgs, 30, 1080, 1920, { aberturaS: 8, encerramentoS: 8 }), ["a", "b", "c", "d"], "", { largura: 1080, altura: 1920 });
    expect(r).toMatch(/0:00,0 – 0:08,0 {2}Voo do drone pela casa \(abertura\)/);
    expect(r).toMatch(/0:22,0 – 0:30,0 {2}Voo do drone pela casa \(encerramento\)/);
  });
});
describe("transições variadas", () => {
  it("troca de ambiente: empurrar, varrer e círculo em rodízio; dentro: dissolver, aproximar e uma marcante a cada três", () => {
    const muda = [true, false, false, false, true, true];
    expect(transicoesDoPlano(muda).map((x) => x.transicao)).toEqual(["empurrar", "dissolver", "aproximar", "varrer", "circulo", "empurrar"]);
  });
  it("vídeo sem títulos (nenhuma troca de ambiente) também varia", () => {
    const tr = transicoesDoPlano(Array(6).fill(false)).map((x) => x.transicao);
    expect(new Set(tr).size).toBeGreaterThanOrEqual(3);
    expect(tr).toEqual(["dissolver", "aproximar", "empurrar", "dissolver", "aproximar", "varrer"]);
  });
  it("o sentido de empurrar e varrer alterna", () => {
    const s = transicoesDoPlano([true, true, true, true]).filter((x) => x.transicao !== "circulo").map((x) => x.sentido);
    expect(s).toEqual([1, -1, 1]);
  });
  it("só dissolver: todas dissolvem; no plano, a primeira imagem sempre dissolve", () => {
    expect(new Set(transicoesDoPlano([true, false, true], "dissolver").map((x) => x.transicao))).toEqual(new Set(["dissolver"]));
    const p = planoDoVideo([img("Sala"), img("Cozinha"), img()], 12, 1920, 1080);
    expect(p.itens.map((x) => x.transicao)).toEqual(["dissolver", "empurrar", "dissolver"]);
  });
});
describe("recomendação de imagens pela duração", () => {
  it("41,4 s (narração de 37 s): ideal 17, de 12 (calmo) a 21 (dinâmico)", () => {
    const r = recomendacaoDeImagens(41.4);
    expect([r.ideal, r.min, r.max]).toEqual([17, 12, 21]);
    expect(textoDaRecomendacao(r)).toBe("41,4 s de imagens → o ideal são 17 imagens (3 s cada); de 12 (ritmo calmo, 4 s cada) a 21 (dinâmico, 2,5 s cada, o mínimo).");
  });
  it("os voos saem do tempo das imagens", () => {
    const r = recomendacaoDeImagens(30, { aberturaS: 8, encerramentoS: 8 });
    expect(r.tempoS).toBeCloseTo(15.2, 6);
    expect(r.ideal).toBe(6);
  });
});

describe("antes e depois (INC-21)", () => {
  const par = (marcadaDepois = true): ImagemDoVideo[] => [img("Sala"), { ...img("Cozinha"), antes: true }, img("", marcadaDepois), img("Suíte")];

  it("o par vira um item que vale por duas imagens, e o tempo continua fechando", () => {
    const p = planoDoVideo(par(), 12, 1080, 1920);
    expect(p.itens.length).toBe(3);
    expect(imagensDoPlano(p)).toBe(4);
    const it = p.itens[1];
    expect(it.indice).toBe(1);
    expect(it.depois).toBe(2);
    expect(it.movimentoDepois).toBeDefined();
    // o par dura 2d − dissolução; o vídeo inteiro fecha em 12 s
    expect(it.fim - it.ini).toBeCloseTo(2 * p.porImagemS - DISSOLVE_S, 6);
    expect(p.itens[2].fim).toBeCloseTo(12, 6);
    expect(p.itens[2].ini).toBeCloseTo(it.fim - DISSOLVE_S, 6);
    // o título do ambiente vem do antes; o item seguinte abre o próprio ambiente
    expect(it.titulo).toBe("Cozinha");
    expect(p.itens[2].titulo).toBe("Suíte");
    expect(p.aviso).toBeNull();
  });

  it("par com só uma das imagens marcada: não vira par e avisa", () => {
    const p = planoDoVideo(par(false), 12, 1080, 1920);
    expect(p.itens.some((x) => x.depois !== undefined)).toBe(false);
    expect(p.itens.map((x) => x.indice)).toEqual([0, 1, 3]);
    expect(p.aviso).toContain("antes e depois");
  });

  it("o antes na última posição não forma par", () => {
    const p = planoDoVideo([img("Sala"), { ...img(), antes: true }], 15, 1080, 1920);
    expect(p.itens.every((x) => x.depois === undefined)).toBe(true);
  });

  it("imagens demais: o par conta duas vagas e nada passa do mínimo", () => {
    const muitas: ImagemDoVideo[] = Array.from({ length: 12 }, (_, k) => ({ ...img(k % 3 === 0 ? `A${k}` : ""), antes: k % 4 === 0 }));
    const p = planoDoVideo(muitas, 15, 1080, 1920);
    expect(imagensDoPlano(p)).toBeLessThanOrEqual(imagensQueCabem(15, IMAGEM_MIN_S));
    expect(p.porImagemS).toBeGreaterThanOrEqual(IMAGEM_MIN_S);
    expect(p.foraDoVideo).toBe(12 - imagensDoPlano(p));
    expect(p.aviso).toContain("ficam de fora");
  });

  it("cortina e rótulos ao longo do item", () => {
    expect(antesDepoisNoTempo(0.2)).toMatchObject({ cortina: 0, depois: 0 });
    expect(antesDepoisNoTempo(0.2).antes).toBe(1);
    expect(antesDepoisNoTempo(CORTINA.ini).cortina).toBe(0);
    expect(antesDepoisNoTempo((CORTINA.ini + CORTINA.fim) / 2).cortina).toBeCloseTo(0.5, 6);
    const fim = antesDepoisNoTempo(0.8);
    expect(fim.cortina).toBe(1);
    expect(fim.antes).toBe(0);
    expect(fim.depois).toBe(1);
    expect(antesDepoisNoTempo(0).antes).toBe(0); // entra junto com a imagem
  });

  it("roteiro: o par aparece como antes e depois e conta duas imagens", () => {
    const p = planoDoVideo(par(), 12, 1080, 1920);
    const txt = roteiroDeTempos(p, ["sala.jpg", "velha.jpg", "nova.jpg", "suite.jpg"], "", { largura: 1080, altura: 1920 });
    expect(txt).toContain("4 imagens");
    expect(txt).toContain("Antes e depois: velha.jpg → nova.jpg");
    expect(txt).toMatch(/Cozinha \(2 imagens\)/);
  });
});
