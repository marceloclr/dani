// Voo de drone e passeio pela obra pronta (ADR-23) nos dois modelos de exemplo.
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { IfcAPI } from "web-ifc";
import { lerIfc } from "../src/bim/parseIfc";
import { FRACAO_CONSTRUCAO, aberturaDaPorta, diaDoVoo, girarNaDobradica, montarVoo } from "../src/rendering/drone";
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

// ------------------------------------------------------------------ colisões
type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const dot = (a: V, b: V) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a: V, b: V): V => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
function cruza(o: V, d: V, a: V, b: V, c: V) { // segmento o→o+d
  const e1 = sub(b,a), e2 = sub(c,a), p = cross(d,e2), det = dot(e1,p);
  if (Math.abs(det) < 1e-12) return false;
  const t0 = sub(o,a), u = dot(t0,p)/det; if (u<0||u>1) return false;
  const q = cross(t0,e1), v = dot(d,q)/det; if (v<0||u+v>1) return false;
  const t = dot(e2,q)/det; return t>=0 && t<=1;
}
function maisPerto(p: V, a: V, b: V, c: V): number {
  const ab = sub(b,a), ac = sub(c,a), ap = sub(p,a);
  const d1 = dot(ab,ap), d2 = dot(ac,ap);
  const dist = (q: V) => Math.hypot(p[0]-q[0], p[1]-q[1], p[2]-q[2]);
  if (d1 <= 0 && d2 <= 0) return dist(a);
  const bp = sub(p,b), d3 = dot(ab,bp), d4 = dot(ac,bp);
  if (d3 >= 0 && d4 <= d3) return dist(b);
  const vc = d1*d4 - d3*d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1/(d1-d3); return dist([a[0]+ab[0]*v, a[1]+ab[1]*v, a[2]+ab[2]*v]); }
  const cp = sub(p,c), d5 = dot(ab,cp), d6 = dot(ac,cp);
  if (d6 >= 0 && d5 <= d6) return dist(c);
  const vb = d5*d2 - d1*d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2/(d2-d6); return dist([a[0]+ac[0]*w, a[1]+ac[1]*w, a[2]+ac[2]*w]); }
  const va = d3*d6 - d5*d4;
  if (va <= 0 && d4-d3 >= 0 && d5-d6 >= 0) { const w = (d4-d3)/((d4-d3)+(d5-d6)); return dist([b[0]+(c[0]-b[0])*w, b[1]+(c[1]-b[1])*w, b[2]+(c[2]-b[2])*w]); }
  const den = 1/(va+vb+vc), v = vb*den, w = vc*den;
  return dist([a[0]+ab[0]*v+ac[0]*w, a[1]+ab[1]*v+ac[1]*w, a[2]+ab[2]*v+ac[2]*w]);
}

/** Percorre o voo e devolve onde a câmera atravessa a obra pronta (portas giradas como na cena) ou chega a menos de 0,3 m dela. */
function colisoes(s: Modelo, voo: VooMontado): string[] {
  const casa = s.solidos.filter((x) => x.ifcType !== "IfcGeographicElement");
  const tris: { a: V; b: V; c: V; guid: string; nome: string; porta: boolean }[] = [];
  for (const x of casa)
    for (let t = 0; t + 2 < x.indices.length; t += 3) {
      const v = (i: number): V => [x.posicoes[i * 3], x.posicoes[i * 3 + 1], x.posicoes[i * 3 + 2]];
      tris.push({ a: v(x.indices[t]), b: v(x.indices[t + 1]), c: v(x.indices[t + 2]), guid: x.guid, nome: `${x.ifcType} ${x.nome}`, porta: x.ifcType === "IfcDoor" });
    }
  const folha = new Map(voo.folhas.map((f) => [f.guid, f]));
  const out: string[] = [];
  const N = 3000;
  let antes = voo.quadro(0).pos as V;
  for (let i = 1; i <= N; i++) {
    const u = i / N, p = voo.quadro(u).pos as V, d = sub(p, antes);
    let menor = Infinity, perto = "";
    for (const t of tris) {
      let { a, b, c } = t;
      if (t.porta) {
        const f = folha.get(t.guid)!, ab = aberturaDaPorta(f, p);
        [a, b, c] = [girarNaDobradica(f, ab, a), girarNaDobradica(f, ab, b), girarNaDobradica(f, ab, c)];
      }
      if (cruza(antes, d, a, b, c)) out.push(`${u.toFixed(3)} atravessa ${t.nome}`);
      if (i % 5 === 0) {
        const dd = maisPerto(p, a, b, c);
        if (dd < menor) [menor, perto] = [dd, t.nome];
      }
    }
    if (menor < 0.3) out.push(`${u.toFixed(3)} a ${menor.toFixed(2)} m de ${perto}`);
    antes = p;
  }
  return out;
}

describe("o drone não atravessa paredes nem portas fechadas", () => {
  for (const arquivo of ["public/modelos/sobrado-exemplo.ifc", "public/samples/demo.ifc"])
    it(arquivo, () => {
      const s = modelo(arquivo);
      const voo = montarVoo(s.solidos, s.caixa, s.centro, s.raio);
      expect(colisoes(s, voo)).toEqual([]);
    });
});
