import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { FaixaDoObjeto, GravadorBlender, COLUNAS_LUZ, matrizAfim } from "../src/rendering/gravadorBlender";
import type { Cena } from "../src/rendering/Cena";

const I = matrizAfim(new THREE.Matrix4().elements);

describe("faixa de um objeto (INC-23)", () => {
  it("grava só as mudanças, com a matriz só quando ela muda", () => {
    const f = new FaixaDoObjeto();
    f.registrar(0, false, -1, []);
    f.registrar(1, false, -1, []);
    f.registrar(2, true, 0, I);
    f.registrar(3, true, 0, I);
    f.registrar(4, true, 1, I);
    const m = matrizAfim(new THREE.Matrix4().makeScale(1, 0.5, 1).elements);
    f.registrar(5, true, 1, m);
    f.registrar(6, false, -1, []);
    f.registrar(7, true, 1, m);
    expect(f.linhas).toEqual([[0, 0, 0], [2, 1, 0, ...I], [4, 1, 1], [5, 1, 1, ...m], [6, 0, 1], [7, 1, 1]]);
  });

  it("a matriz afim sai por colunas, sem a última linha", () => {
    const m = new THREE.Matrix4().makeTranslation(1, 2, 3);
    expect(matrizAfim(m.elements)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 2, 3]);
  });
});

/** Cena mínima: duas malhas do IFC e uma árvore do entorno, sem WebGL. */
function cenaFalsa() {
  const scene = new THREE.Scene();
  const mat = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
  const a = new THREE.Mesh(new THREE.BoxGeometry(), mat[0]);
  const b = new THREE.Mesh(new THREE.BoxGeometry(), mat[0]);
  const ambiente = new THREE.Group(), pessoas = new THREE.Group(), lampadas = new THREE.Group();
  const arv = new THREE.Mesh(new THREE.BoxGeometry(), mat[1]);
  ambiente.add(arv);
  const luz = new THREE.PointLight(0xffffff, 0, 8);
  luz.userData.base = 10;
  lampadas.add(luz);
  scene.add(a, b, ambiente, pessoas, lampadas);
  const sol = { dir: [0, 1, 0] as [number, number, number], elevacao: 40 };
  const cena = {
    scene,
    paraOBlender: () => ({ raizes: [{ prefixo: "amb", raiz: ambiente }, { prefixo: "pes", raiz: pessoas }, { prefixo: "lum", raiz: lampadas }], malhas: new Map([["A", a], ["B", b]]), lampadas: [luz], grupoLampadas: lampadas }),
    liberarVista: () => {},
    get estadoSol() {
      return sol;
    },
  } as unknown as Cena;
  return { cena, a, b, luz, lampadas, sol, mat };
}

describe("gravador do pacote (INC-23)", () => {
  it("câmera por quadro, luz nas mudanças e a obra crescendo", () => {
    const { cena, a, b, luz, lampadas, sol, mat } = cenaFalsa();
    const g = new GravadorBlender(cena, 4);
    const cam = new THREE.PerspectiveCamera(45, 9 / 16, 0.05, 4000);
    b.visible = false;
    lampadas.visible = false;
    g.quadro(0, cam);
    a.scale.set(1, 0.5, 1);
    g.quadro(1, cam);
    b.visible = true;
    b.material = mat[1];
    sol.elevacao = -10;
    lampadas.visible = true;
    luz.intensity = 10;
    g.quadro(2, cam);
    const f = g.faixasDoPacote({ assinatura: "abcd1234", origem: "obra", nome: "t", fps: 30, largura: 1080, altura: 1920 });
    expect(f.objetos).toEqual(["o0", "o1", "o2"]);
    expect(f.camera.map((c) => (c ? c.length : null))).toEqual([19, 19, 19, null]);
    expect(f.luz.map((l) => l[0])).toEqual([0, 2]);
    expect(f.luz[0]).toHaveLength(COLUNAS_LUZ.length);
    expect(f.luz[1][COLUNAS_LUZ.indexOf("luminarias")]).toBe(1);
    // a: aparece com a matriz e cresce no quadro 1; b: escondido e depois com o segundo material
    expect(f.estados[0].map((l) => [l[0], l[1], l.length])).toEqual([[0, 1, 15], [1, 1, 15]]);
    expect(f.estados[1].map((l) => l.slice(0, 3))).toEqual([[0, 0, 0], [2, 1, 1]]);
    expect(f.materiais).toEqual(["m0", "m1"]);
    expect(f.lampadas).toEqual([{ pos: [0, 0, 0], forca: 10, alcance: 8 }]);
  });
});
