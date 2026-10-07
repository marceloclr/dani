// Aparência realista (ADR-21): escolha do material e coordenadas de textura. Puro, sem DOM nem Three.js.
import type { TipoTextura } from "./texturas";

export type Aparencia3D = "realista" | "tecnica";

export interface MaterialRealista {
  textura: TipoTextura;
  rugosidade: number;
  metalico: number;
  /** Opacidade própria (vidro); undefined = a do IFC. */
  opacidade?: number;
  /** Tinge a textura neutra com a cor do IFC (material desconhecido). */
  usarCorIfc?: boolean;
  /** Relevo (bump) a partir da própria textura. */
  relevo: number;
}

const M = (textura: TipoTextura, rugosidade: number, metalico = 0, relevo = 0.02, extra: Partial<MaterialRealista> = {}): MaterialRealista => ({ textura, rugosidade, metalico, relevo, ...extra });

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Material realista de um elemento. Ordem: acabamento concluído (reboco, pintura) nas paredes,
 * depois o nome do material IFC, depois a classe IFC; sem pista, textura lisa com a cor do IFC.
 */
export function materialRealista(material: string | null, ifcType: string, acabamento: string, objectType: string | null = null): MaterialRealista {
  const parede = ifcType === "IfcWall" || ifcType === "IfcWallStandardCase";
  // pilares e vigas também são rebocados e pintados junto com as paredes
  const revestivel = parede || ifcType === "IfcColumn" || ifcType === "IfcBeam";
  if (revestivel && acabamento === "pintura") return M("pintura", 0.85, 0, 0.004, { usarCorIfc: false });
  if (revestivel && acabamento === "reboco") return M("reboco", 0.95, 0, 0.015);

  const n = norm(material ?? "");
  if (/vidro|glass/.test(n)) return M("liso", 0.05, 0, 0, { opacidade: 0.32, usarCorIfc: true });
  if (/telha metal|metalica|aco|steel|zinco|aluminio/.test(n)) return M("telha-metalica", 0.45, 0.6, 0.01);
  if (/telha|ceramica de cobertura|roof tile/.test(n)) return M("telha-ceramica", 0.8, 0, 0.03);
  if (/manta|impermeab/.test(n)) return M("concreto", 0.7, 0, 0.01);
  if (/bloco|tijolo|ceramic|alvenaria|brick|masonry/.test(n)) return M("tijolo", 0.92, 0, 0.03);
  if (/concreto|concrete|cimento/.test(n)) return M("concreto", 0.9, 0, 0.02);
  if (/madeira|wood|timber/.test(n)) return M("madeira", 0.7, 0, 0.01);
  if (/porcelanato|ceramica|piso|tile|granito|marmore/.test(n)) return M("porcelanato", 0.35, 0, 0.005);
  if (/louca|porcelain|sanit/.test(n)) return M("liso", 0.15, 0, 0, { usarCorIfc: true });
  if (/grama|grass|gramado/.test(n)) return M("grama", 1, 0, 0.03);
  if (/copa|folha|arvore|tree|veget/.test(n)) return M("folhagem", 1, 0, 0.03);
  if (/terreno|terra|solo|soil/.test(n)) return M("terra", 1, 0, 0.03);
  if (/pvc|polietileno|plastic/.test(n)) return M("liso", 0.5, 0, 0, { usarCorIfc: true });

  // pela classe IFC
  if (parede) return M("tijolo", 0.92, 0, 0.03);
  if (/IfcSlab|IfcColumn|IfcBeam|IfcFooting|IfcPile|IfcStair/.test(ifcType)) return M("concreto", 0.9, 0, 0.02);
  if (ifcType === "IfcCovering") return M("porcelanato", 0.35, 0, 0.005);
  if (ifcType === "IfcDoor") return M("madeira", 0.7, 0, 0.01);
  if (ifcType === "IfcWindow") return M("liso", 0.05, 0, 0, { opacidade: 0.32, usarCorIfc: true });
  if (ifcType === "IfcGeographicElement") return objectType === "PAISAGISMO" ? M("grama", 1, 0, 0.03) : M("terra", 1, 0, 0.03);
  return M("liso", 0.6, 0, 0, { usarCorIfc: true });
}

/**
 * Coordenadas de textura por projeção em caixa: cada vértice usa o plano perpendicular ao eixo
 * dominante da sua normal, em metros. Assim tijolo, telha e piso ficam em escala real em qualquer face.
 * Cena com Y para cima: normal em Y → (x, z); em X → (z, y); em Z → (x, y).
 */
export function uvsPorProjecao(posicoes: Float32Array, normais: Float32Array): Float32Array {
  const n = posicoes.length / 3;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = posicoes[i * 3], y = posicoes[i * 3 + 1], z = posicoes[i * 3 + 2];
    const ax = Math.abs(normais[i * 3]), ay = Math.abs(normais[i * 3 + 1]), az = Math.abs(normais[i * 3 + 2]);
    if (ay >= ax && ay >= az) {
      uv[i * 2] = x;
      uv[i * 2 + 1] = z;
    } else if (ax >= az) {
      uv[i * 2] = z;
      uv[i * 2 + 1] = y;
    } else {
      uv[i * 2] = x;
      uv[i * 2 + 1] = y;
    }
  }
  return uv;
}
