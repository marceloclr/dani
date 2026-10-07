import { describe, expect, it } from "vitest";
import { materialRealista, uvsPorProjecao } from "../src/rendering/aparencia";
import { aleatorio } from "../src/rendering/texturas";

describe("material realista (ADR-21)", () => {
  it("pelo nome do material IFC", () => {
    expect(materialRealista("Bloco cerâmico", "IfcWall", "base").textura).toBe("tijolo");
    expect(materialRealista("Telha cerâmica", "IfcSlab", "base").textura).toBe("telha-ceramica");
    expect(materialRealista("Telha metálica termoacústica", "IfcSlab", "base")).toMatchObject({ textura: "telha-metalica", metalico: 0.6 });
    expect(materialRealista("Concreto armado", "IfcColumn", "base").textura).toBe("concreto");
    expect(materialRealista("Madeira", "IfcDoor", "base").textura).toBe("madeira");
    expect(materialRealista("Vidro", "IfcWindow", "base")).toMatchObject({ textura: "liso", opacidade: 0.32 });
    expect(materialRealista("Porcelanato", "IfcCovering", "base").textura).toBe("porcelanato");
    expect(materialRealista("Grama", "IfcGeographicElement", "base").textura).toBe("grama");
    expect(materialRealista("Terreno natural", "IfcGeographicElement", "base").textura).toBe("terra");
  });
  it("acabamento concluído muda a parede: reboco e depois pintura", () => {
    expect(materialRealista("Bloco cerâmico", "IfcWall", "reboco").textura).toBe("reboco");
    expect(materialRealista("Bloco cerâmico", "IfcWall", "pintura").textura).toBe("pintura");
    expect(materialRealista("Concreto armado", "IfcColumn", "pintura").textura).toBe("pintura"); // estrutura também
    expect(materialRealista("Concreto armado", "IfcSlab", "pintura").textura).toBe("concreto"); // lajes não
  });
  it("sem material: pela classe IFC; sem pista: liso com a cor do IFC", () => {
    expect(materialRealista(null, "IfcWall", "base").textura).toBe("tijolo");
    expect(materialRealista(null, "IfcSlab", "base").textura).toBe("concreto");
    expect(materialRealista(null, "IfcGeographicElement", "base", "PAISAGISMO").textura).toBe("grama");
    expect(materialRealista("XPTO-123", "IfcFurniture", "base")).toMatchObject({ textura: "liso", usarCorIfc: true });
  });
});

describe("coordenadas de textura por projeção em caixa", () => {
  it("usa o plano perpendicular ao eixo dominante da normal, em metros", () => {
    const pos = new Float32Array([2, 3, 4, 2, 3, 4, 2, 3, 4]);
    const nor = new Float32Array([0, 1, 0, 1, 0, 0, 0, 0, -1]); // piso, parede x, parede z
    expect([...uvsPorProjecao(pos, nor)]).toEqual([2, 4, 4, 3, 2, 3]);
  });
});

describe("texturas determinísticas", () => {
  it("o gerador pseudoaleatório repete a sequência para a mesma semente", () => {
    const a = aleatorio(11), b = aleatorio(11), c = aleatorio(12);
    const sa = Array.from({ length: 5 }, a), sb = Array.from({ length: 5 }, b);
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(Array.from({ length: 5 }, c));
    expect(sa.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});
