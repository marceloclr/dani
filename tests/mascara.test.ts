import { describe, expect, it } from "vitest";
import { COBERTURA_MINIMA, LimpezaDeMascara } from "../src/rendering/composicao";

const W = 40, H = 40;
/** Máscara com retângulos de confiança 1 (x0, y0, x1, y1 exclusivos). */
function mascara(...rets: [number, number, number, number][]): Float32Array {
  const m = new Float32Array(W * H);
  for (const [x0, y0, x1, y1] of rets) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m[y * W + x] = 1;
  return m;
}
const soma = (m: Float32Array, x0: number, y0: number, x1: number, y1: number) => {
  let s = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) s += m[y * W + x];
  return s;
};

describe("limpeza da máscara da IA (ADR-31)", () => {
  it("fica só a pessoa: manchas pequenas soltas somem, partes grandes ficam", () => {
    const l = new LimpezaDeMascara(W, H, 0);
    // corpo 10×20, braço destacado 4×10 (40 % do... 40/200 = 20 % → some), mancha 3×3 longe (some)
    const { mascara: m } = l.limpar(mascara([10, 20, 20, 40], [30, 2, 33, 5], [24, 12, 28, 22]));
    expect(soma(m, 10, 20, 20, 40)).toBe(200);
    expect(soma(m, 30, 2, 33, 5)).toBe(0);
    // parte com ≥ 30 % da maior fica
    const l2 = new LimpezaDeMascara(W, H, 0);
    const { mascara: m2 } = l2.limpar(mascara([10, 20, 20, 40], [21, 22, 29, 30]));
    expect(soma(m2, 21, 22, 29, 30)).toBe(64);
  });

  it("objeto solto no meio do quadro não é a pessoa, mesmo maior que ela (ADR-31)", () => {
    const l = new LimpezaDeMascara(W, H, 0);
    // objeto 12×12 flutuando (144 px) e a pessoa 6×16 encostada na base (96 px)
    const { mascara: m } = l.limpar(mascara([2, 4, 14, 16], [26, 24, 32, 40]));
    expect(soma(m, 2, 4, 14, 16)).toBe(0);
    expect(soma(m, 26, 24, 32, 40)).toBe(96);
    // sem ninguém na base: a pessoa some
    expect(new LimpezaDeMascara(W, H, 0).limpar(mascara([2, 4, 14, 16])).presenca).toBe(0);
  });

  it("recorte pequeno demais ou o quadro inteiro: a pessoa some aos poucos, sem piscar", () => {
    const l = new LimpezaDeMascara(W, H, 0, 0.25);
    expect(l.limpar(mascara([10, 20, 20, 40])).presenca).toBe(1);
    const pequeno = mascara([0, 0, 3, 3]); // 9 px = 0,6 % < 2 %
    expect(9 / (W * H)).toBeLessThan(COBERTURA_MINIMA);
    const p = [1, 2, 3, 4].map(() => l.limpar(pequeno).presenca);
    expect(p).toEqual([0.75, 0.5, 0.25, 0]);
    const inteiro = new LimpezaDeMascara(W, H, 0);
    expect(inteiro.limpar(mascara([0, 0, 40, 40])).presenca).toBe(0);
  });

  it("fundo com pouca certeza da IA (uma escada atrás da pessoa) não vira pessoa (ADR-33)", () => {
    const fraca = mascara([10, 20, 20, 40]).map((v) => v * 0.6);
    expect(new LimpezaDeMascara(W, H, 0).limpar(fraca).presenca).toBe(0);
    const forte = mascara([10, 20, 20, 40]).map((v) => v * 0.9);
    expect(new LimpezaDeMascara(W, H, 0).limpar(forte).presenca).toBe(1);
  });

  it("a mancha que pula de lugar não é a pessoa: ela some aos poucos; depois de sair, pode voltar em outro lugar (ADR-33)", () => {
    const l = new LimpezaDeMascara(W, H, 0, 0.5);
    expect(l.limpar(mascara([4, 20, 12, 40])).presenca).toBe(1); // pessoa à esquerda
    const outra = mascara([28, 20, 36, 40]); // mancha do mesmo tamanho, à direita
    expect(l.limpar(outra).presenca).toBe(0.5);
    expect(l.limpar(outra).presenca).toBe(0);
    expect(l.limpar(outra).presenca).toBe(0.5); // fora de cena, ela volta no lugar novo
  });

  it("suaviza no tempo: metade do quadro anterior entra no seguinte", () => {
    const l = new LimpezaDeMascara(W, H, 0.5);
    l.limpar(mascara([10, 20, 20, 40]));
    const { mascara: m } = l.limpar(mascara([12, 20, 22, 40]));
    expect(m[30 * W + 11]).toBeCloseTo(0.5); // só no anterior
    expect(m[30 * W + 15]).toBeCloseTo(1); // nos dois
  });
});

describe("volume da fala (ADR-31)", async () => {
  const { ganhoDeNormalizacao, ALVO_RMS_DB, PICO_MAXIMO_DB } = await import("../src/rendering/composicao");
  const tom = (amp: number, s: number, taxa = 8000) => Float32Array.from({ length: s * taxa }, (_, i) => amp * Math.sin((2 * Math.PI * 440 * i) / taxa));
  it("voz baixa sobe até o alvo; o pico limita", () => {
    const g = ganhoDeNormalizacao([tom(0.05, 2)], 8000);
    // senoide: rms = amp/√2 → −29 dBFS; pico −26 dBFS → o limite do pico (−1) permite +25 dB, o alvo pede +11 dB
    expect(20 * Math.log10(g.ganho)).toBeCloseTo(ALVO_RMS_DB - g.rmsDb, 1);
  });
  it("voz com picos altos (estalos) é limitada pelo pico: −1 dBFS", () => {
    const sinal = tom(0.1, 2);
    for (let i = 0; i < sinal.length; i += 4000) sinal[i] = 0.999;
    const g = ganhoDeNormalizacao([sinal], 8000);
    expect(g.picoDb + 20 * Math.log10(g.ganho)).toBeCloseTo(PICO_MAXIMO_DB, 1);
  });
  it("silêncio não é amplificado", () => {
    expect(ganhoDeNormalizacao([new Float32Array(16000)], 8000).ganho).toBe(1);
  });
});

describe("entorno não tampa a obra (ADR-31)", async () => {
  const THREE = await import("three");
  const { tampamAVista } = await import("../src/rendering/ambiente");
  const casa = new THREE.Vector3(0, 3, 0);
  const caixa = (x0: number, z0: number, x1: number, z1: number, h = 6) => new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, h, z1));
  it("some o vizinho entre a câmera e a casa, e o que contém a câmera; os outros ficam", () => {
    const cam = new THREE.Vector3(0, 4, 40);
    const r = tampamAVista(cam, [casa], [caixa(-4, 18, 4, 26), caixa(20, -5, 28, 5), caixa(-3, 37, 3, 43)]);
    expect(r).toEqual([true, false, true]);
  });
  it("vizinho atrás da casa não some", () => {
    expect(tampamAVista(new THREE.Vector3(0, 4, 40), [casa], [caixa(-4, -26, 4, -18)])).toEqual([false]);
  });
});

describe("divisas do lote: mureta com gradil na frente (ADR-33)", async () => {
  const { trechosDoMuro, VAO_PORTAO } = await import("../src/rendering/ambiente");
  const lote = { x0: -6, x1: 6, z0: -12, z1: 6 };
  const t = trechosDoMuro(lote, { zFachada: 1, xPorta: 1 });
  it("muro alto só atrás da fachada; na frente e no recuo, mureta", () => {
    for (const m of t.filter((m) => m.tipo === "alto")) expect(m.z1).toBeLessThanOrEqual(1);
    const laterais = t.filter((m) => m.tipo === "baixo" && m.z1 - m.z0 > 1);
    expect(laterais.map((m) => [m.z0, m.z1])).toEqual([[1, 6], [1, 6]]);
  });
  it("portão aberto no eixo da porta de entrada", () => {
    const frente = t.filter((m) => m.tipo === "baixo" && m.z0 === 6).sort((a, b) => a.x0 - b.x0);
    expect(frente).toHaveLength(2);
    expect(frente[0].x1).toBeCloseTo(1 - VAO_PORTAO / 2);
    expect(frente[1].x0).toBeCloseTo(1 + VAO_PORTAO / 2);
  });
  it("casa encostada no alinhamento: laterais inteiras em muro alto", () => {
    expect(trechosDoMuro(lote, { zFachada: 7, xPorta: null }).filter((m) => m.tipo === "baixo" && m.z1 - m.z0 > 1)).toHaveLength(0);
  });
});

describe("casas do outro lado da rua não fazem sombra na rua (ADR-33)", async () => {
  const THREE = await import("three");
  const { montarEntorno } = await import("../src/rendering/ambiente");
  it("só as casas atrás da câmera (em frente ao lote) ficam sem sombra; as dos lados e do fundo têm", () => {
    const lote = { x0: -6, x1: 6, z0: -12, z1: 6 };
    const g = montarEntorno(new Map(), lote, 0, [0, 2, -3], 8, { zFachada: 1, xPorta: 0 });
    const casas: { z: number; sombra: boolean }[] = [];
    g.traverse((o) => {
      if (o.userData.ocultavel && o instanceof THREE.Group && o.children.every((m) => m instanceof THREE.Mesh)) {
        const m = o.children[0] as InstanceType<typeof THREE.Mesh>;
        casas.push({ z: m.position.z, sombra: m.castShadow });
      }
    });
    const emFrente = casas.filter((c) => c.z > lote.z1 + 10), outras = casas.filter((c) => c.z <= lote.z1 + 10);
    expect(emFrente.length).toBeGreaterThan(5);
    expect(emFrente.every((c) => !c.sombra)).toBe(true);
    expect(outras.length).toBeGreaterThan(5);
    expect(outras.every((c) => c.sombra)).toBe(true);
  });
});
