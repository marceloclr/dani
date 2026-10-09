// avcC do H.264: o registro estragado do Firefox no Windows (cabeçalho da NAL repetido) é refeito.
import { describe, expect, it } from "vitest";
import { avcCValido, comoBytes, consertarAvcC, lerAvcC, montarAvcC, parametrosNoQuadro } from "../src/rendering/avcc";

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((x) => parseInt(x, 16)));
const comTamanho = (...nals: Uint8Array[]) => {
  const out: number[] = [];
  for (const n of nals) out.push(0, 0, n.length >> 8, n.length & 0xff, ...n);
  return Uint8Array.from(out);
};

// tirados de um MP4 1080 × 1920 gerado no Firefox (Windows, 09/10/2026)
const SPS_FIREFOX = hex("67674d4028965602201e3cbc20000003002000000781b41108a7");
const PPS_FIREFOX = hex("6868ce3c80");
const SPS = SPS_FIREFOX.subarray(1), PPS = PPS_FIREFOX.subarray(1);
const AVCC_FIREFOX = montarAvcC({ sps: [SPS_FIREFOX], pps: [PPS_FIREFOX], tamanhoNal: 4 });
AVCC_FIREFOX.set([0x4d, 0x40, 0x28], 1); // o Firefox grava o perfil certo no cabeçalho do registro
// e um gerado no Edge, correto
const AVCC_EDGE = montarAvcC({ sps: [hex("674d002895b81100f1e5f0110000030001000003003c8da1c32e")], pps: [hex("68ee3c80")], tamanhoNal: 4 });

describe("avcC", () => {
  it("o do Edge é válido e o do Firefox não (o SPS começa por 67 67)", () => {
    expect(avcCValido(AVCC_EDGE)).toBe(true);
    expect(avcCValido(AVCC_FIREFOX)).toBe(false);
    expect(consertarAvcC(AVCC_EDGE)).toBeNull();
  });
  it("lê e monta de volta o mesmo registro", () => {
    const r = lerAvcC(AVCC_EDGE)!;
    expect(r.tamanhoNal).toBe(4);
    expect(montarAvcC(r)).toEqual(AVCC_EDGE);
    expect(lerAvcC(AVCC_EDGE.subarray(0, 10))).toBeNull();
  });
  it("conserta pelo SPS e PPS do quadro-chave (Main, nível 4.0)", () => {
    const quadro = comTamanho(hex("0910"), SPS, PPS, hex("06051234"), hex("65888400"));
    expect(parametrosNoQuadro(quadro)).toEqual({ sps: [SPS], pps: [PPS] });
    const novo = consertarAvcC(AVCC_FIREFOX, quadro)!;
    expect(avcCValido(novo)).toBe(true);
    expect([...novo.subarray(1, 4)]).toEqual([0x4d, 0x40, 0x28]);
    expect(lerAvcC(novo)).toEqual({ sps: [SPS], pps: [PPS], tamanhoNal: 4 });
  });
  it("sem SPS no quadro, tira o cabeçalho repetido", () => {
    const novo = consertarAvcC(AVCC_FIREFOX, comTamanho(hex("65888400")))!;
    expect(lerAvcC(novo)).toEqual({ sps: [SPS], pps: [PPS], tamanhoNal: 4 });
  });
});

describe("bytes do registro no navegador", () => {
  it("funciona sem SharedArrayBuffer (só existe em páginas isoladas; a falta dele deixava o vídeo do Firefox sem conserto)", () => {
    const g = globalThis as { SharedArrayBuffer?: unknown };
    const guardado = g.SharedArrayBuffer;
    delete g.SharedArrayBuffer;
    try {
      const buf = new Uint8Array([9, 1, 2, 3, 9]);
      expect([...comoBytes(buf.buffer)]).toEqual([9, 1, 2, 3, 9]);
      expect([...comoBytes(buf.subarray(1, 4))]).toEqual([1, 2, 3]);
      expect([...comoBytes(new DataView(buf.buffer, 2, 2))]).toEqual([2, 3]);
    } finally {
      g.SharedArrayBuffer = guardado;
    }
  });
});