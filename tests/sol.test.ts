// Sol real (ADR-26): posição do sol em Fortaleza, nascer e pôr, convenção do norte e fachada ao sol.
import { describe, expect, it } from "vitest";
import { FORTALEZA, direcaoNaCena, fachadaAoSol, hora, nascerEPor, posicaoDoSol, rumo } from "../src/rendering/sol";
import { diaCivil } from "../src/fourd/tempo";

const d = (a: number, m: number, x: number) => diaCivil(a, m, x)!;

describe("sol em Fortaleza", () => {
  it("ao meio-dia solar: 90 − |lat − declinação| (junho ao norte, dezembro ao sul)", () => {
    const jun = nascerEPor(FORTALEZA, d(2026, 6, 21)), dez = nascerEPor(FORTALEZA, d(2026, 12, 21));
    const pj = posicaoDoSol(FORTALEZA, d(2026, 6, 21), jun.meioDia), pd = posicaoDoSol(FORTALEZA, d(2026, 12, 21), dez.meioDia);
    expect(pj.elevacao).toBeCloseTo(90 - Math.abs(-3.71664 - 23.44), 0);
    expect(Math.min(pj.azimute, 360 - pj.azimute)).toBeLessThan(2); // norte
    expect(pd.elevacao).toBeCloseTo(90 - Math.abs(-3.71664 + 23.44), 0);
    expect(Math.abs(pd.azimute - 180)).toBeLessThan(2); // sul
  });
  it("nasce por volta das 5h30 e se põe por volta das 17h30 o ano todo", () => {
    for (const [m, x] of [[3, 21], [6, 21], [9, 23], [12, 21]]) {
      const e = nascerEPor(FORTALEZA, d(2026, m, x));
      expect(e.nascer).toBeGreaterThan(5 * 60 + 5);
      expect(e.nascer).toBeLessThan(5 * 60 + 45);
      expect(e.por).toBeGreaterThan(17 * 60 + 10);
      expect(e.por).toBeLessThan(17 * 60 + 50);
      // no nascer, o sol está no horizonte: geométrico a −0,833°, aparente (com refração) em torno de −0,4°
      expect(Math.abs(posicaoDoSol(FORTALEZA, d(2026, m, x), e.nascer).elevacao + 0.5)).toBeLessThan(0.4);
    }
  });
  it("nasce a lés-nordeste em junho e a lés-sudeste em dezembro", () => {
    const j = posicaoDoSol(FORTALEZA, d(2026, 6, 21), nascerEPor(FORTALEZA, d(2026, 6, 21)).nascer);
    const z = posicaoDoSol(FORTALEZA, d(2026, 12, 21), nascerEPor(FORTALEZA, d(2026, 12, 21)).nascer);
    expect(j.azimute).toBeCloseTo(66.4, 0);
    expect(z.azimute).toBeCloseTo(113.6, 0);
    expect(rumo(j.azimute)).toBe("lés-nordeste");
  });
  it("à noite o sol fica abaixo do horizonte", () => {
    expect(posicaoDoSol(FORTALEZA, d(2026, 11, 26), 22 * 60).elevacao).toBeLessThan(-30);
  });
});

describe("orientação da casa", () => {
  it("frente para o norte, sol a leste: o sol fica em −x (à esquerda de quem olha a fachada)", () => {
    const v = direcaoNaCena({ azimute: 90, elevacao: 0 }, 0);
    expect(v[0]).toBeCloseTo(-1);
    expect(v[2]).toBeCloseTo(0);
  });
  it("frente para o oeste, sol do pôr: o sol fica de frente (+z) e bate na fachada frontal", () => {
    const v = direcaoNaCena({ azimute: 270, elevacao: 0 }, 270);
    expect(v[2]).toBeCloseTo(1);
    expect(fachadaAoSol(270, 270).fachada).toBe("frontal");
  });
  it("frente para o norte: sol a oeste bate na lateral direita; ao sul, nos fundos", () => {
    expect(fachadaAoSol(270, 0).fachada).toBe("lateral direita");
    expect(fachadaAoSol(180, 0).fachada).toBe("fundos");
    expect(fachadaAoSol(90, 0).fachada).toBe("lateral esquerda");
    expect(fachadaAoSol(270, 0).azCena).toBeCloseTo(Math.PI / 2);
  });
  it("formata hora", () => {
    expect(hora(5 * 60 + 9.6)).toBe("05:10");
    expect(hora(17 * 60 + 25)).toBe("17:25");
  });
});

describe("sol direto nas fachadas (como no modulus)", () => {
  it("DNI de Meinel: zero rente ao horizonte, cerca de 1 kW/m² com o sol alto", async () => {
    const { dni } = await import("../src/rendering/sol");
    expect(dni(1)).toBe(0);
    expect(dni(90)).toBeCloseTo(1353 * 0.7, 0);
    expect(dni(30)).toBeLessThan(dni(60));
  });
  it("rumo das fachadas: com a frente para o norte, a lateral esquerda olha para o leste", async () => {
    const { rumoDaFachada } = await import("../src/rendering/sol");
    expect(rumoDaFachada("frontal", 0)).toBe(0);
    expect(rumoDaFachada("lateral esquerda", 0)).toBe(90);
    expect(rumoDaFachada("fundos", 0)).toBe(180);
    expect(rumoDaFachada("lateral direita", 0)).toBe(270);
  });
  it("em Fortaleza, em junho o sol passa ao norte: norte > leste e oeste > sul; em dezembro, o sul > norte", async () => {
    const { radiacaoNaFachada } = await import("../src/rendering/sol");
    const j = d(2026, 6, 21);
    const n = radiacaoNaFachada(FORTALEZA, j, 0), l = radiacaoNaFachada(FORTALEZA, j, 90), s = radiacaoNaFachada(FORTALEZA, j, 180), o = radiacaoNaFachada(FORTALEZA, j, 270);
    expect(n).toBeGreaterThan(l);
    expect(l).toBeGreaterThan(s);
    expect(o).toBeGreaterThan(s);
    expect(l).toBeGreaterThan(1);
    expect(n).toBeLessThan(6);
    const z = d(2026, 12, 21);
    expect(radiacaoNaFachada(FORTALEZA, z, 180)).toBeGreaterThan(radiacaoNaFachada(FORTALEZA, z, 0));
  });
});

describe("local e norte no IFC", () => {
  it("o sobrado de exemplo traz Fortaleza e a frente voltada para 70° (lés-nordeste)", async () => {
    const { readFileSync } = await import("node:fs");
    const { IfcAPI } = await import("web-ifc");
    const { lerIfc, rumoDaFrente, anguloComposto } = await import("../src/bim/parseIfc");
    const api = new IfcAPI();
    await api.Init(undefined, true);
    const m = lerIfc(api, new Uint8Array(readFileSync("public/modelos/sobrado-exemplo.ifc")));
    expect(m.geo.lat).toBeCloseTo(-3.71664, 4);
    expect(m.geo.lon).toBeCloseTo(-38.5423, 4);
    expect(m.geo.norteGraus).toBeCloseTo(70, 3);
    // convenção: norte = +Y do IFC → a frente (−Y) olha para o sul
    expect(rumoDaFrente(0, 1)).toBeCloseTo(180);
    expect(rumoDaFrente(1, 0)).toBeCloseTo(90);
    expect(anguloComposto([-3, -42, -59, -904000])).toBeCloseTo(-3.71664, 4);
  });
});
