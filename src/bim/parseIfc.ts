// Leitura de IFC com web-ifc: metadados (§11) e uma malha por elemento (ADR-01).
// Roda no Web Worker do app e no Node (testes); não toca em Three.js nem no DOM.
import * as W from "web-ifc";
import type { ElementoMeta } from "../types";

/** Geometria de um elemento, já com as transformações aplicadas (coordenadas da cena, Y para cima). */
export interface MalhaElemento {
  guid: string;
  posicoes: Float32Array;
  normais: Float32Array;
  indices: Uint32Array;
  cor: [number, number, number, number];
}

/** Local e orientação do IFC (ADR-26); ausentes quando o arquiteto não informou. */
export interface GeoIfc {
  lat?: number;
  lon?: number;
  /** Rumo da bússola (graus, do norte no sentido horário) para onde a fachada frontal (+z da cena) olha. */
  norteGraus?: number;
}

export interface ModeloLido {
  esquema: string;
  elementos: ElementoMeta[];
  malhas: MalhaElemento[];
  geo: GeoIfc;
}

/** Ângulo composto do IFC (graus, minutos, segundos, milionésimos) em graus decimais. */
export function anguloComposto(partes: number[]): number {
  const [g = 0, m = 0, s = 0, mi = 0] = partes;
  return g + m / 60 + s / 3600 + mi / 3.6e9;
}

/**
 * Rumo da fachada frontal a partir do TrueNorth (vetor do norte no plano XY do IFC). A cena tem +z = −Y
 * do IFC (o web-ifc gira Z para cima), e a frente da casa é +z: o rumo é o ângulo, no sentido horário,
 * do norte até −Y.
 */
export function rumoDaFrente(norteX: number, norteY: number): number {
  const g = (-Math.atan2(-norteX, -norteY) * 180) / Math.PI;
  return ((g % 360) + 360) % 360;
}

function geoDoIfc(api: W.IfcAPI, modelo: number): GeoIfc {
  const geo: GeoIfc = {};
  // o web-ifc entrega listas como { value: [...] } (ângulo composto) ou como [{ _representationValue }] (IfcReal)
  const numero = (v: unknown) => {
    const o = v as { _representationValue?: unknown; value?: unknown } | number;
    return Number(typeof o === "object" && o !== null ? (o._representationValue ?? o.value) : o);
  };
  const numeros = (x: unknown): number[] | null => {
    const l = Array.isArray(x) ? x : Array.isArray((x as { value?: unknown })?.value) ? ((x as { value: unknown[] }).value) : null;
    return l ? l.map(numero) : null;
  };
  try {
    for (const id of idsDe(api, modelo, W.IFCSITE)) {
      const s = api.GetLine(modelo, id, false);
      const la = numeros(s.RefLatitude), lo = numeros(s.RefLongitude);
      if (la && lo && la.length && lo.length) {
        geo.lat = anguloComposto(la);
        geo.lon = anguloComposto(lo);
        break;
      }
    }
    for (const id of idsDe(api, modelo, W.IFCGEOMETRICREPRESENTATIONCONTEXT)) {
      const c = api.GetLine(modelo, id, false);
      const ref = (c.TrueNorth as { value?: number } | null)?.value;
      if (!ref) continue;
      const d = numeros(api.GetLine(modelo, ref, false).DirectionRatios);
      if (d && d.length >= 2 && Math.hypot(d[0], d[1]) > 1e-9) {
        geo.norteGraus = rumoDaFrente(d[0], d[1]);
        break;
      }
    }
  } catch {
    /* sem geo: o app usa o município e a bússola */
  }
  return geo;
}

export class ErroIfc extends Error {
  constructor(mensagem: string, readonly detalhes?: string) {
    super(mensagem);
  }
}

const val = (x: unknown): string | null => {
  const v = (x as { value?: unknown } | null | undefined)?.value;
  return v === undefined || v === null || v === "" ? null : String(v);
};

/** Confere a assinatura STEP antes de entregar os bytes ao web-ifc. */
export function conferirCabecalho(bytes: Uint8Array): void {
  const inicio = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  if (!/ISO-10303-21\s*;/.test(inicio) || !/FILE_SCHEMA/i.test(inicio)) {
    throw new ErroIfc(
      "O arquivo não parece ser um modelo IFC.",
      `Cabeçalho esperado "ISO-10303-21;" com FILE_SCHEMA. Início do arquivo: ${JSON.stringify(inicio.slice(0, 80))}`,
    );
  }
}

function idsDe(api: W.IfcAPI, modelo: number, tipo: number): number[] {
  const v = api.GetLineIDsWithType(modelo, tipo);
  const out: number[] = [];
  for (let i = 0; i < v.size(); i++) out.push(v.get(i));
  return out;
}

/** Pavimento (ou sítio) e material de cada elemento, a partir das relações IFC. */
function relacoes(api: W.IfcAPI, modelo: number) {
  const contido = new Map<number, string>();
  for (const id of idsDe(api, modelo, W.IFCRELCONTAINEDINSPATIALSTRUCTURE)) {
    const r = api.GetLine(modelo, id, false);
    const estrutura = api.GetLine(modelo, r.RelatingStructure.value, false);
    const nome = val(estrutura.Name) ?? val(estrutura.LongName) ?? "";
    for (const e of r.RelatedElements ?? []) contido.set(e.value, nome);
  }
  // partes de agregados (ex.: lajes de um IfcRoof) herdam o pavimento do conjunto
  for (const id of idsDe(api, modelo, W.IFCRELAGGREGATES)) {
    const r = api.GetLine(modelo, id, false);
    const pai = contido.get(r.RelatingObject.value);
    if (pai === undefined) continue;
    for (const p of r.RelatedObjects ?? []) if (!contido.has(p.value)) contido.set(p.value, pai);
  }
  const material = new Map<number, string>();
  for (const id of idsDe(api, modelo, W.IFCRELASSOCIATESMATERIAL)) {
    const r = api.GetLine(modelo, id, false);
    const m = api.GetLine(modelo, r.RelatingMaterial.value, false);
    const nome = val(m.Name) ?? val(m.LayerSetName) ?? api.GetNameFromTypeCode(m.type);
    for (const o of r.RelatedObjects ?? []) material.set(o.value, nome);
  }
  return { contido, material };
}

/** Lê o IFC. `api` já deve estar inicializada (Init). */
export function lerIfc(api: W.IfcAPI, bytes: Uint8Array, progresso: (fracao: number, etapa: string) => void = () => {}): ModeloLido {
  conferirCabecalho(bytes);
  progresso(0.05, "Abrindo o modelo");
  let modelo: number;
  try {
    modelo = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: false });
  } catch (e) {
    throw new ErroIfc("Não foi possível abrir o modelo IFC.", String((e as Error)?.stack ?? e));
  }
  if (modelo < 0) throw new ErroIfc("Não foi possível abrir o modelo IFC.", `OpenModel retornou ${modelo}.`);

  try {
    const esquema = api.GetModelSchema(modelo);
    progresso(0.1, "Lendo relações");
    const { contido, material } = relacoes(api, modelo);

    const elementos: ElementoMeta[] = [];
    const malhas: MalhaElemento[] = [];
    api.StreamAllMeshes(modelo, (malha, indice, total) => {
      const linha = api.GetLine(modelo, malha.expressID, false);
      const guid = val(linha.GlobalId) ?? `#${malha.expressID}`;
      elementos.push({
        guid,
        expressId: malha.expressID,
        ifcType: api.GetNameFromTypeCode(linha.type),
        predefinedType: val(linha.PredefinedType),
        objectType: val(linha.ObjectType),
        nome: val(linha.Name) ?? api.GetNameFromTypeCode(linha.type),
        pavimento: contido.get(malha.expressID) ?? null,
        material: material.get(malha.expressID) ?? null,
      });
      malhas.push(juntarGeometrias(api, modelo, malha, guid));
      if (indice % 8 === 0 || indice === total - 1) progresso(0.1 + 0.9 * ((indice + 1) / Math.max(total, 1)), "Gerando geometria");
    });
    if (!malhas.length) throw new ErroIfc("O modelo IFC não tem nenhum elemento com geometria.", `Esquema ${esquema}.`);
    return { esquema, elementos, malhas, geo: geoDoIfc(api, modelo) };
  } finally {
    api.CloseModel(modelo);
  }
}

/** Junta as geometrias de um elemento numa só malha, aplicando cada transformação. */
function juntarGeometrias(api: W.IfcAPI, modelo: number, malha: W.FlatMesh, guid: string): MalhaElemento {
  const partes: { v: Float32Array; i: Uint32Array; m: number[] }[] = [];
  let nv = 0;
  let ni = 0;
  let cor: [number, number, number, number] = [0.7, 0.7, 0.7, 1];
  for (let g = 0; g < malha.geometries.size(); g++) {
    const pg = malha.geometries.get(g);
    if (g === 0) cor = [pg.color.x, pg.color.y, pg.color.z, pg.color.w];
    const geo = api.GetGeometry(modelo, pg.geometryExpressID);
    const v = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
    const i = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
    partes.push({ v: new Float32Array(v), i: new Uint32Array(i), m: pg.flatTransformation });
    nv += v.length / 6;
    ni += i.length;
    geo.delete();
  }
  const posicoes = new Float32Array(nv * 3);
  const normais = new Float32Array(nv * 3);
  const indices = new Uint32Array(ni);
  let ov = 0;
  let oi = 0;
  for (const { v, i, m } of partes) {
    const n = v.length / 6;
    for (let k = 0; k < n; k++) {
      const x = v[k * 6], y = v[k * 6 + 1], z = v[k * 6 + 2];
      const a = v[k * 6 + 3], b = v[k * 6 + 4], c = v[k * 6 + 5];
      const o = (ov + k) * 3;
      // matriz 4×4 em ordem de coluna
      posicoes[o] = m[0] * x + m[4] * y + m[8] * z + m[12];
      posicoes[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      posicoes[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      const nx = m[0] * a + m[4] * b + m[8] * c;
      const ny = m[1] * a + m[5] * b + m[9] * c;
      const nz = m[2] * a + m[6] * b + m[10] * c;
      const len = Math.hypot(nx, ny, nz) || 1;
      normais[o] = nx / len;
      normais[o + 1] = ny / len;
      normais[o + 2] = nz / len;
    }
    for (let k = 0; k < i.length; k++) indices[oi + k] = i[k] + ov;
    ov += n;
    oi += i.length;
  }
  return { guid, posicoes, normais, indices, cor };
}
