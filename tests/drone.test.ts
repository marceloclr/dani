// Voo de drone e passeio pela obra pronta (ADR-23) nos dois modelos de exemplo.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { IfcAPI } from "web-ifc";
import { lerIfc } from "../src/bim/parseIfc";
import { FRACAO_CONSTRUCAO, diaDoVoo, montarVoo } from "../src/rendering/drone";
import { caixaDe, gradeDoPavimento, livreEm, type Solido } from "../src/rendering/navegacao";

const api = new IfcAPI();
beforeAll(async () => {
  await api.Init(undefined, true);
});

function modelo(arquivo: string) {
  const m = lerIfc(api, new Uint8Array(readFileSync(arquivo)));
  const solidos: Solido[] = m.malhas.map((x, i) => ({ guid: x.guid, ifcType: m.elementos[i].ifcType, nome: m.elementos[i].nome, posicoes: x.posicoes, indices: x.indices }));
  const casa = solidos.filter((s) => s.ifcType !== "IfcGeographicElement");
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const s of casa) {
    const b = caixaDe(s);
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], b.min[k]);
      max[k] = Math.max(max[k], b.max[k]);
    }
  }
  const centro: [number, number, number] = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const raio = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
  return { solidos, caixa: { min, max }, centro, raio };
}

type Modelo = ReturnType<typeof modelo>;
type VooMontado = ReturnType<typeof montarVoo>;

describe("voo no sobrado de exemplo", () => {
  let s: Modelo, voo: VooMontado;
  beforeAll(() => {
    s = modelo("public/modelos/sobrado-exemplo.ifc");
    voo = montarVoo(s.solidos, s.caixa, s.centro, s.raio);
  });
  it("entra pela porta da frente e usa a escada", () => {
    expect(voo.entrada).not.toBeNull();
    expect(voo.temEscada).toBe(true);
    const ys = voo.passeio.map((p) => p[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(2.5); // sobe ao pavimento de cima
    expect(voo.passeio[voo.passeio.length - 1][1]).toBeLessThan(2); // e desce de novo
  });
  it("o passeio do térreo não atravessa paredes", () => {
    const g = gradeDoPavimento(s.solidos, 0, { x0: s.caixa.min[0] - 5, x1: s.caixa.max[0] + 5, z0: s.caixa.min[2] - 5, z1: s.caixa.max[2] + 5 }, 0.1, 0.1);
    const terreo = voo.passeio.filter((p) => p[1] < 1.7);
    const bloqueados = terreo.filter((p) => !livreEm(g, p[0], p[2]));
    expect(bloqueados.length).toBe(0);
  });
  it("termina dentro da casa, longe das paredes e dos móveis", () => {
    const fim = voo.passeio[voo.passeio.length - 1];
    expect(fim[0]).toBeGreaterThan(0.2);
    expect(fim[0]).toBeLessThan(7.8);
    expect(fim[2]).toBeLessThan(-0.2); // a frente da casa fica em z = 0 e o fundo em z = −12
    expect(fim[2]).toBeGreaterThan(-11.8);
    const g = gradeDoPavimento(s.solidos, 0, { x0: s.caixa.min[0] - 5, x1: s.caixa.max[0] + 5, z0: s.caixa.min[2] - 5, z1: s.caixa.max[2] + 5 });
    const terreo = voo.passeio.filter((p) => p[1] < 1.7 && p[2] < -1.5);
    const media = terreo.reduce((a, p) => a + (g.distancia[Math.floor((p[2] - g.z0) / g.passo) * g.nx + Math.floor((p[0] - g.x0) / g.passo)] ?? 0), 0) / terreo.length;
    expect(media).toBeGreaterThan(0.5);
  });
  it("a câmera é contínua", () => {
    let pior = 0;
    let a = voo.quadro(0);
    for (let i = 1; i <= 2000; i++) {
      const b = voo.quadro(i / 2000);
      const d = Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]);
      pior = Math.max(pior, d);
      a = b;
    }
    expect(pior).toBeLessThan(0.5);
  });
  it("humanizada: duas pessoas na frente e uma em cada pavimento", () => {
    expect(voo.pessoas.length).toBe(4);
    expect(voo.pessoas.filter((p) => p.pos[1] > 2)).toHaveLength(1);
  });
  it("a obra é montada na primeira metade e fica pronta na segunda", () => {
    expect(diaDoVoo(0, 270)).toBe(0);
    expect(diaDoVoo(FRACAO_CONSTRUCAO / 2, 270)).toBeCloseTo(135);
    expect(Math.floor(diaDoVoo(0.8, 270))).toBe(269);
  });
});

describe("voo na casa térrea da demonstração", () => {
  let voo: VooMontado;
  beforeAll(() => {
    const s = modelo("public/samples/demo.ifc");
    voo = montarVoo(s.solidos, s.caixa, s.centro, s.raio);
  });
  it("entra e passeia pelo térreo, sem escada", () => {
    expect(voo.entrada).not.toBeNull();
    expect(voo.temEscada).toBe(false);
    expect(voo.passeio.length).toBeGreaterThan(3);
  });
});
