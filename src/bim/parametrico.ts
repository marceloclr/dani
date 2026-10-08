// Modo paramétrico (§27, §28, ADR-12): casa simplificada gerada a partir de parâmetros,
// com as mesmas classes IFC do modo BIM. Determinístico e sem DOM (roda no Node).
// Coordenadas da cena: x para a direita, y para cima, frente da casa em z = 0 e fundo em z = −profundidade.
import type { ElementoMeta } from "../types";
import type { MalhaElemento, ModeloLido } from "./parseIfc";

export type Cobertura = "plana" | "uma-agua" | "duas-aguas";

export interface ParametrosCasa {
  terrenoLargura: number;
  terrenoComprimento: number;
  area: number; // área construída total, m²
  pavimentos: 1 | 2;
  peDireito: number;
  cobertura: Cobertura;
}

export const PARAMETROS_PADRAO: ParametrosCasa = { terrenoLargura: 12, terrenoComprimento: 30, area: 120, pavimentos: 1, peDireito: 2.8, cobertura: "duas-aguas" };

export const NOME_COBERTURA: Record<Cobertura, string> = {
  plana: "Laje plana com platibanda",
  "uma-agua": "Telhado de uma água",
  "duas-aguas": "Telhado de duas águas",
};

export const RECUOS = { frente: 5, fundo: 3, lateral: 1.5 };
const ESP = 0.15; // parede
const LAJE = 0.12;
const ALTURA_DEGRAU = 0.18;
const PISO_DEGRAU = 0.28;

export class ErroParametro extends Error {}

type V3 = [number, number, number];
type Quad = [V3, V3, V3, V3];
type RGBA = [number, number, number, number];

const COR: Record<string, RGBA> = {
  terreno: [0.54, 0.44, 0.3, 1],
  concreto: [0.62, 0.62, 0.6, 1],
  bloco: [0.71, 0.4, 0.22, 1],
  telha: [0.55, 0.27, 0.18, 1],
  impermeabilizacao: [0.42, 0.48, 0.55, 1],
  madeira: [0.55, 0.36, 0.17, 1],
  vidro: [0.56, 0.72, 0.82, 0.45],
  piso: [0.85, 0.82, 0.76, 1],
  granito: [0.36, 0.35, 0.34, 1],
  pedra: [0.62, 0.57, 0.5, 1],
  calcada: [0.66, 0.64, 0.6, 1],
  grama: [0.36, 0.52, 0.24, 1],
};
const MATERIAL: Record<string, string> = {
  terreno: "Terreno natural",
  concreto: "Concreto armado",
  bloco: "Bloco cerâmico",
  telha: "Telha cerâmica",
  impermeabilizacao: "Manta impermeabilizante",
  madeira: "Madeira",
  vidro: "Vidro",
  piso: "Porcelanato",
  granito: "Granito cinza (peitoril e soleira)",
  pedra: "Pedra natural (revestimento de fachada)",
  calcada: "Concreto desempenado (calçada)",
  grama: "Grama esmeralda (jardim)",
};

/** Prisma de base quadrilátera: tampa A, tampa B (vértices correspondentes). Faces orientadas para fora. */
function prisma(a: Quad, b: Quad, pos: number[], nor: number[], idx: number[]): void {
  const todos = [...a, ...b];
  const c = todos.reduce((s, p) => [s[0] + p[0] / 8, s[1] + p[1] / 8, s[2] + p[2] / 8] as V3, [0, 0, 0] as V3);
  const faces: Quad[] = [a, b];
  for (let i = 0; i < 4; i++) faces.push([a[i], a[(i + 1) % 4], b[(i + 1) % 4], b[i]]);
  for (const f of faces) {
    const u = sub(f[2], f[0]);
    const v = sub(f[3], f[1]);
    let n = cruz(u, v);
    const len = Math.hypot(...n);
    if (len < 1e-9) continue; // face degenerada
    n = [n[0] / len, n[1] / len, n[2] / len];
    const fc: V3 = [(f[0][0] + f[1][0] + f[2][0] + f[3][0]) / 4, (f[0][1] + f[1][1] + f[2][1] + f[3][1]) / 4, (f[0][2] + f[1][2] + f[2][2] + f[3][2]) / 4];
    let q = f;
    if (dot(n, sub(fc, c)) < 0) {
      n = [-n[0], -n[1], -n[2]];
      q = [f[3], f[2], f[1], f[0]];
    }
    const base = pos.length / 3;
    for (const p of q) {
      pos.push(...p);
      nor.push(...n);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}
const sub = (p: V3, q: V3): V3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const cruz = (u: V3, v: V3): V3 => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const dot = (u: V3, v: V3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];

/** Caixa alinhada aos eixos. */
function caixa(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): [Quad, Quad] {
  const base: Quad = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]];
  const topo: Quad = [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
  return [base, topo];
}

interface Abertura {
  u0: number;
  u1: number;
  peitoril: number; // a partir do piso do pavimento
  topo: number;
  tipo: "porta" | "janela";
  nome: string;
}

/** Linha de parede: ao longo de x (z fixo) ou de z (x fixo); u é a distância ao longo do eixo (para z, u = −z). */
interface Linha {
  nome: string;
  eixo: "x" | "z";
  fixo: number;
  u0: number;
  u1: number;
  externa: boolean;
}

/** Caixa de uma faixa de parede entre u0 e u1, de y0 a y1. */
function faixa(l: Linha, u0: number, u1: number, y0: number, y1: number, esp = ESP, folga = 0): [Quad, Quad] {
  const h = esp / 2 + folga;
  return l.eixo === "x" ? caixa(u0, y0, l.fixo - h, u1, y1, l.fixo + h) : caixa(l.fixo - h, y0, -u1, l.fixo + h, y1, -u0);
}

export interface Dimensoes {
  largura: number;
  profundidade: number;
  areaPavimento: number;
}

/** Dimensões da casa no lote, ou erro explicando o que falta. */
export function dimensionar(p: ParametrosCasa): Dimensoes {
  if (p.peDireito < 2.5 || p.peDireito > 4.5) throw new ErroParametro("O pé-direito deve ficar entre 2,50 e 4,50 m.");
  if (p.area <= 0) throw new ErroParametro("Informe a área construída.");
  const maxL = p.terrenoLargura - 2 * RECUOS.lateral;
  const maxP = p.terrenoComprimento - RECUOS.frente - RECUOS.fundo;
  if (maxL < 5 || maxP < 5) {
    throw new ErroParametro(`O terreno é pequeno demais para os recuos (${RECUOS.frente} m na frente, ${RECUOS.fundo} m no fundo e ${RECUOS.lateral} m nas laterais): sobram ${fmt(Math.max(maxL, 0))} × ${fmt(Math.max(maxP, 0))} m.`);
  }
  const areaPav = p.area / p.pavimentos;
  if (areaPav < 25) throw new ErroParametro(`Cada pavimento ficaria com ${fmt(areaPav)} m²; o mínimo é 25 m².`);
  let l = Math.min(maxL, Math.sqrt(areaPav / 1.4));
  let d = areaPav / l;
  if (d > maxP) {
    l = maxL;
    d = areaPav / l;
  }
  if (d > maxP + 1e-9) {
    const cabe = maxL * maxP * p.pavimentos;
    throw new ErroParametro(
      `A casa não cabe no lote com os recuos: cabem ${fmt(cabe)} m² (${fmt(maxL)} × ${fmt(maxP)} m por pavimento) e faltam ${fmt(p.area - cabe)} m². Aumente o terreno, reduza a área ou use 2 pavimentos.`,
    );
  }
  l = Math.max(5, Math.round(l * 20) / 20);
  d = Math.round((areaPav / l) * 20) / 20;
  return { largura: l, profundidade: d, areaPavimento: l * d };
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

/** Portas da fachada frontal do térreo (a entrada, sob a varanda). */
const vaosFrontais = (W: number): Abertura[] => [{ u0: W * 0.62 - 0.5, u1: W * 0.62 + 0.5, peitoril: 0, topo: 2.2, tipo: "porta", nome: "Porta de entrada" }];

export function gerarCasa(p: ParametrosCasa): ModeloLido {
  const { largura: W, profundidade: D } = dimensionar(p);
  const pd = p.peDireito;
  const nivel = (k: number) => k * (pd + LAJE);
  const zT = Math.round(0.45 * D * 20) / 20; // parede transversal (u)
  const elementos: ElementoMeta[] = [];
  const malhas: MalhaElemento[] = [];
  let seq = 0;

  const add = (ifcType: string, predefinedType: string | null, nome: string, mat: keyof typeof COR, pecas: [Quad, Quad][], pavimento: string, objectType: string | null = null) => {
    const pos: number[] = [], nor: number[] = [], idx: number[] = [];
    for (const [a, b] of pecas) prisma(a, b, pos, nor, idx);
    const guid = `param-${String(++seq).padStart(4, "0")}`;
    elementos.push({ guid, expressId: seq, ifcType, predefinedType, objectType, nome, pavimento, material: MATERIAL[mat] });
    malhas.push({ guid, posicoes: new Float32Array(pos), normais: new Float32Array(nor), indices: new Uint32Array(idx), cor: COR[mat] });
  };

  // ---- escada (2 pavimentos): lance reto encostado na lateral direita, no fundo
  const alturaLance = pd + LAJE;
  const nDegraus = Math.ceil(alturaLance / ALTURA_DEGRAU);
  const espelho = alturaLance / nDegraus;
  const escX0 = W - ESP / 2 - 1.05, escX1 = W - ESP / 2;
  const escU0 = zT + 0.4, escU1 = escU0 + nDegraus * PISO_DEGRAU;
  if (p.pavimentos === 2 && escU1 > D - 0.3) {
    throw new ErroParametro(`A escada não cabe: precisa de ${fmt(escU1 + 0.3 - zT)} m livres no fundo da casa e há ${fmt(D - zT)} m. Aumente a área ou o comprimento do terreno.`);
  }

  // ---- terreno com a área da casa escavada (as fundações ficam visíveis)
  const lx0 = -(p.terrenoLargura - W) / 2, lx1 = W + (p.terrenoLargura - W) / 2;
  const lz0 = RECUOS.frente, lz1 = RECUOS.frente - p.terrenoComprimento;
  const g = 0.45;
  add(
    "IfcGeographicElement",
    "TERRAIN",
    "Terreno",
    "terreno",
    [caixa(lx0, -0.4, g, lx1, -0.1, lz0), caixa(lx0, -0.4, lz1, lx1, -0.1, -D - g), caixa(lx0, -0.4, -D - g, -g, -0.1, g), caixa(W + g, -0.4, -D - g, lx1, -0.1, g)],
    "Lote",
  );

  // ---- linhas de parede
  const linhas: Linha[] = [
    { nome: "fachada frontal", eixo: "x", fixo: 0, u0: 0, u1: W, externa: true },
    { nome: "fachada dos fundos", eixo: "x", fixo: -D, u0: 0, u1: W, externa: true },
    { nome: "lateral esquerda", eixo: "z", fixo: 0, u0: 0, u1: D, externa: true },
    { nome: "lateral direita", eixo: "z", fixo: W, u0: 0, u1: D, externa: true },
    { nome: "transversal", eixo: "x", fixo: -zT, u0: 0, u1: W, externa: false },
    { nome: "entre os quartos", eixo: "z", fixo: W / 2, u0: 0, u1: zT, externa: false },
  ];

  // ---- fundação
  for (const l of linhas) add("IfcFooting", "STRIP_FOOTING", `Viga baldrame: ${l.nome}`, "concreto", [faixa(l, l.u0 - ESP / 2, l.u1 + ESP / 2, -0.5, -0.1, 0.4)], "Térreo");
  add("IfcSlab", "BASESLAB", "Contrapiso", "concreto", [caixa(-ESP / 2, -0.1, ESP / 2, W + ESP / 2, 0, -D - ESP / 2)], "Térreo");

  // pilares: perímetro e encontros de paredes, a cada no máximo 4,5 m
  const divide = (n: number, extra: number[]) => {
    const k = Math.ceil(n / 4.5);
    return [...new Set([...Array.from({ length: k + 1 }, (_, i) => (i * n) / k), ...extra].map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);
  };
  const xs = divide(W, [W / 2]);
  const us = divide(D, [zT]);
  const pilares: [number, number][] = [];
  for (const x of xs)
    for (const u of us) {
      const naLinha = x === 0 || Math.abs(x - W) < 0.01 || u === 0 || Math.abs(u - D) < 0.01 || Math.abs(u - zT) < 0.01 || (Math.abs(x - W / 2) < 0.01 && u <= zT + 0.01);
      if (naLinha) pilares.push([x, u]);
    }
  for (const [x, u] of pilares) add("IfcFooting", "PAD_FOOTING", `Sapata P(${fmt(x)};${fmt(u)})`, "concreto", [caixa(x - 0.4, -1.1, -u + 0.4, x + 0.4, -0.5, -u - 0.4)], "Térreo");

  const nomePav = (k: number) => (k === 0 ? "Térreo" : "Pavimento superior");

  for (let k = 0; k < p.pavimentos; k++) {
    const y0 = nivel(k), y1 = y0 + pd;
    const terreo = k === 0;
    const pav = nomePav(k);

    // pilares e vigas
    for (const [x, u] of pilares) add("IfcColumn", "COLUMN", `Pilar P(${fmt(x)};${fmt(u)}) ${pav.toLowerCase()}`, "concreto", [caixa(x - 0.1, y0, -u + 0.1, x + 0.1, y1, -u - 0.1)], pav);
    for (const l of linhas) add("IfcBeam", "BEAM", `Viga: ${l.nome}, ${pav.toLowerCase()}`, "concreto", [faixa(l, l.u0 - ESP / 2, l.u1 + ESP / 2, y1 - 0.35, y1)], pav);

    // vãos de cada parede
    const larguraJanela = Math.min(1.5, W / 2 - 1.2);
    const fundo = D - zT;
    const vaos: Record<string, Abertura[]> = {
      // fachada frontal (ADR-31): no térreo, a entrada sob a varanda e uma janela larga; em cima, duas janelas
      "fachada frontal": terreo
        ? [
            { u0: W / 4 - larguraJanela / 2, u1: W / 4 + larguraJanela / 2, peitoril: 1.0, topo: 2.2, tipo: "janela", nome: "Janela do quarto esquerdo" },
            { u0: W * 0.62 - 0.5, u1: W * 0.62 + 0.5, peitoril: 0, topo: 2.2, tipo: "porta", nome: "Porta de entrada" },
            { u0: W * 0.86 - Math.min(0.75, W * 0.12), u1: W * 0.86 + Math.min(0.75, W * 0.12), peitoril: 0.9, topo: 2.2, tipo: "janela", nome: "Janela da frente, direita" },
          ]
        : [
            { u0: W / 4 - larguraJanela / 2, u1: W / 4 + larguraJanela / 2, peitoril: 1.0, topo: 2.2, tipo: "janela", nome: "Janela do quarto esquerdo" },
            { u0: (3 * W) / 4 - larguraJanela / 2, u1: (3 * W) / 4 + larguraJanela / 2, peitoril: 1.0, topo: 2.2, tipo: "janela", nome: "Janela do quarto direito" },
          ],
      "fachada dos fundos": terreo
        ? [
            { u0: W / 2 - 0.45, u1: W / 2 + 0.45, peitoril: 0, topo: 2.1, tipo: "porta", nome: "Porta dos fundos" },
            { u0: W * 0.2 - 0.75, u1: W * 0.2 + 0.75, peitoril: 1.1, topo: 2.2, tipo: "janela", nome: "Janela da cozinha" },
          ]
        : [{ u0: W / 2 - 0.75, u1: W / 2 + 0.75, peitoril: 1.0, topo: 2.2, tipo: "janela", nome: "Janela dos fundos" }],
      "lateral esquerda": [
        { u0: zT + 0.6, u1: zT + 1.8, peitoril: 1.0, topo: 2.2, tipo: "janela", nome: "Janela lateral esquerda" },
        { u0: zT + fundo * 0.65 - 0.6, u1: zT + fundo * 0.65 + 0.6, peitoril: 1.0, topo: 2.2, tipo: "janela", nome: "Janela da sala, esquerda" },
      ],
      "lateral direita": [{ u0: zT + fundo * 0.5 - 0.6, u1: zT + fundo * 0.5 + 0.6, peitoril: 1.4, topo: 2.2, tipo: "janela", nome: "Janela da sala, direita" }],
      transversal: [
        { u0: W / 4 - 0.45, u1: W / 4 + 0.45, peitoril: 0, topo: 2.1, tipo: "porta", nome: "Porta do quarto esquerdo" },
        { u0: (3 * W) / 4 - 0.45, u1: (3 * W) / 4 + 0.45, peitoril: 0, topo: 2.1, tipo: "porta", nome: "Porta do quarto direito" },
      ],
      "entre os quartos": [],
    };

    for (const l of linhas) {
      const abs = (vaos[l.nome] ?? []).filter((a) => a.u0 > l.u0 + 0.2 && a.u1 < l.u1 - 0.2).sort((a, b) => a.u0 - b.u0);
      const pecas: [Quad, Quad][] = [];
      let u = l.u0 - (l.externa ? ESP / 2 : 0);
      for (const a of abs) {
        pecas.push(faixa(l, u, a.u0, y0, y1));
        if (a.peitoril > 0) pecas.push(faixa(l, a.u0, a.u1, y0, y0 + a.peitoril));
        pecas.push(faixa(l, a.u0, a.u1, y0 + a.topo, y1));
        const folha = faixa(l, a.u0, a.u1, y0 + a.peitoril, y0 + a.topo, 0.04);
        if (a.tipo === "porta") add("IfcDoor", "DOOR", `${a.nome}, ${pav.toLowerCase()}`, "madeira", [folha], pav);
        else add("IfcWindow", "WINDOW", `${a.nome}, ${pav.toLowerCase()}`, "vidro", [folha], pav);
        // peitoril de granito (janela) ou soleira (porta) nas paredes externas, saindo 4 cm da parede (ADR-31)
        if (l.externa && (a.tipo === "janela" || terreo)) {
          const yP = y0 + a.peitoril;
          add("IfcCovering", "MOLDING", `${a.tipo === "janela" ? "Peitoril" : "Soleira"}: ${a.nome.toLowerCase()}, ${pav.toLowerCase()}`, "granito", [faixa(l, a.u0 - (a.tipo === "janela" ? 0.05 : 0), a.u1 + (a.tipo === "janela" ? 0.05 : 0), yP - 0.03, yP + 0.01, ESP, 0.04)], pav);
        }
        u = a.u1;
      }
      pecas.push(faixa(l, u, l.u1 + (l.externa ? ESP / 2 : 0), y0, y1));
      add("IfcWall", "SOLIDWALL", `Parede: ${l.nome}, ${pav.toLowerCase()}`, "bloco", pecas, pav);
    }

    // pisos (sobre o contrapiso ou a laje do pavimento de baixo)
    const h = ESP / 2;
    const comodos: [string, number, number, number, number][] = [
      ["Quarto esquerdo", 0, 0, W / 2, zT],
      ["Quarto direito", W / 2, 0, W, zT],
      ["Sala e cozinha", 0, zT, k > 0 ? escX0 - h : W, D],
    ];
    for (const [nome, x0, u0, x1, u1] of comodos) add("IfcCovering", "FLOORING", `Piso: ${nome.toLowerCase()}, ${pav.toLowerCase()}`, "piso", [caixa(x0 + h, y0, -u0 - h, x1 - h, y0 + 0.02, -u1 + h)], pav);

    // laje sobre o pavimento; a do térreo, em casa de 2 pavimentos, tem o vão da escada
    const yl0 = y1, yl1 = y1 + LAJE;
    const comVao = p.pavimentos === 2 && k === 0;
    const pecasLaje: [Quad, Quad][] = comVao
      ? [caixa(-h, yl0, h, escX0 - 0.1, yl1, -D - h), caixa(escX0 - 0.1, yl0, h, W + h, yl1, -escU0), caixa(escX0 - 0.1, yl0, -escU1, W + h, yl1, -D - h)]
      : [caixa(-h, yl0, h, W + h, yl1, -D - h)];
    add("IfcSlab", "FLOOR", k === p.pavimentos - 1 ? "Laje de forro" : "Laje do pavimento superior", "concreto", pecasLaje, pav);

    if (comVao) {
      const degraus: [Quad, Quad][] = [];
      for (let i = 0; i < nDegraus; i++) degraus.push(caixa(escX0, y0, -(escU0 + i * PISO_DEGRAU), escX1, y0 + (i + 1) * espelho, -(escU0 + (i + 1) * PISO_DEGRAU)));
      add("IfcStair", "STRAIGHT_RUN_STAIR", "Escada", "concreto", degraus, pav);
    }
  }

  // ---- varanda, barrado de pedra e calçada (ADR-31): profundidade e sombra na fachada frontal
  {
    const xv0 = W / 2, xv1 = W, prof = 2.2, beiralV = 0.3;
    const yAlto = pd - 0.02, yBaixo = yAlto - 0.15 * (prof + beiralV); // telhado com 15 % de caída para a frente
    add("IfcCovering", "FLOORING", "Piso da varanda", "piso", [caixa(xv0, -0.02, prof, xv1 + ESP / 2, 0.03, ESP / 2)], "Térreo");
    for (const x of [xv0 + 0.25, xv1 - 0.1]) add("IfcColumn", "USERDEFINED", `Pilar da varanda (${fmt(x)})`, "madeira", [caixa(x - 0.07, 0.03, prof - 0.1, x + 0.07, yBaixo + 0.15 * 0.4, prof - 0.24)], "Térreo", "PILAR DA VARANDA");
    const y = (z: number) => yAlto - 0.15 * Math.max(z - ESP / 2, 0);
    const baseV: Quad = [[xv0 - 0.1, y(ESP / 2), ESP / 2], [xv1 + beiralV, y(ESP / 2), ESP / 2], [xv1 + beiralV, y(prof + beiralV), prof + beiralV], [xv0 - 0.1, y(prof + beiralV), prof + beiralV]];
    add("IfcSlab", "ROOF", "Telhado da varanda", "telha", [[baseV, baseV.map((q) => [q[0], q[1] + 0.08, q[2]]) as Quad]], "Térreo");
    // barrado de pedra na base da fachada frontal, interrompido nas portas
    const portas = (vaosFrontais(W)).filter((a) => a.tipo === "porta").sort((a, b) => a.u0 - b.u0);
    const pecas: [Quad, Quad][] = [];
    let u = -ESP / 2;
    for (const a of portas) {
      if (a.u0 > u + 0.05) pecas.push(caixa(u, 0, ESP / 2 + 0.03, a.u0, 0.9, ESP / 2));
      u = a.u1;
    }
    pecas.push(caixa(u, 0, ESP / 2 + 0.03, W + ESP / 2, 0.9, ESP / 2));
    add("IfcCovering", "CLADDING", "Revestimento de pedra da fachada", "pedra", pecas, "Térreo");
    // calçada de 0,8 m em volta da casa (na frente, só onde não há varanda)
    const c = 0.8, yc0 = -0.1, yc1 = -0.02;
    add("IfcCovering", "FLOORING", "Calçada em volta da casa", "calcada", [
      caixa(-ESP / 2 - c, yc0, ESP / 2 + c, xv0, yc1, ESP / 2),
      caixa(-ESP / 2 - c, yc0, ESP / 2, -ESP / 2, yc1, -D - ESP / 2 - c),
      caixa(W + ESP / 2, yc0, ESP / 2, W + ESP / 2 + c, yc1, -D - ESP / 2 - c),
      caixa(-ESP / 2, yc0, -D - ESP / 2, W + ESP / 2, yc1, -D - ESP / 2 - c),
    ], "Térreo");
    // jardim no recuo da frente e caminho de pedra da calçada até a varanda (etapa de paisagismo)
    const zLote = RECUOS.frente, xPorta = W * 0.62, meioCaminho = 0.6;
    const lxa = -(p.terrenoLargura - W) / 2, lxb = W + (p.terrenoLargura - W) / 2;
    add("IfcGeographicElement", null, "Jardim da frente", "grama", [
      caixa(lxa, -0.1, zLote, xPorta - meioCaminho, -0.06, ESP / 2 + c),
      caixa(xPorta + meioCaminho, -0.1, zLote, lxb, -0.06, prof + 0.05),
    ], "Térreo", "PAISAGISMO");
    add("IfcCovering", "FLOORING", "Caminho de entrada", "pedra", [caixa(xPorta - meioCaminho, -0.1, zLote, xPorta + meioCaminho, -0.04, prof)], "Térreo");
  }

  // ---- cobertura sobre a laje de forro
  const topo = nivel(p.pavimentos - 1) + pd + LAJE;
  const pavTopo = nomePav(p.pavimentos - 1);
  const externas = linhas.filter((l) => l.externa);
  const beiral = 0.5;
  if (p.cobertura === "plana") {
    for (const l of externas) add("IfcWall", "PARAPET", `Platibanda: ${l.nome}`, "bloco", [faixa(l, l.u0 - ESP / 2, l.u1 + ESP / 2, topo, topo + 0.8)], pavTopo);
    add("IfcSlab", "ROOF", "Impermeabilização da laje", "impermeabilizacao", [caixa(ESP / 2, topo, -ESP / 2, W - ESP / 2, topo + 0.06, -D + ESP / 2)], pavTopo);
  } else if (p.cobertura === "uma-agua") {
    // cai da frente para o fundo, 15%
    const yFundo = topo + 0.3;
    const yU = (u: number) => yFundo + 0.15 * (D - u);
    const e = 0.08;
    const base: Quad = [[-beiral, yU(-beiral), beiral], [W + beiral, yU(-beiral), beiral], [W + beiral, yU(D + beiral), -D - beiral], [-beiral, yU(D + beiral), -D - beiral]];
    add("IfcSlab", "ROOF", "Telhado", "telha", [[base, base.map((q) => [q[0], q[1] + e, q[2]]) as Quad]], pavTopo);
    for (const x of [0, W]) {
      const lado: Quad = [[x - ESP / 2, topo, 0], [x - ESP / 2, topo, -D], [x - ESP / 2, yU(D), -D], [x - ESP / 2, yU(0), 0]];
      add("IfcWall", "SOLIDWALL", `Oitão ${x === 0 ? "esquerdo" : "direito"}`, "bloco", [[lado, lado.map((q) => [q[0] + ESP, q[1], q[2]]) as Quad]], pavTopo);
    }
    add("IfcWall", "SOLIDWALL", "Oitão frontal", "bloco", [caixa(-ESP / 2, topo, ESP / 2, W + ESP / 2, yU(0), -ESP / 2)], pavTopo);
    add("IfcWall", "SOLIDWALL", "Oitão dos fundos", "bloco", [caixa(-ESP / 2, topo, -D + ESP / 2, W + ESP / 2, yU(D), -D - ESP / 2)], pavTopo);
  } else {
    // duas águas, cumeeira no eixo x = W/2, 30%
    const yBeiral = topo + 0.2;
    const yX = (x: number) => yBeiral + 0.3 * (W / 2 - Math.abs(x - W / 2));
    const e = 0.08;
    for (const [xa, xb, nome] of [[-beiral, W / 2, "Telhado, água esquerda"], [W / 2, W + beiral, "Telhado, água direita"]] as [number, number, string][]) {
      const base: Quad = [[xa, yX(xa), beiral], [xb, yX(xb), beiral], [xb, yX(xb), -D - beiral], [xa, yX(xa), -D - beiral]];
      add("IfcSlab", "ROOF", nome, "telha", [[base, base.map((q) => [q[0], q[1] + e, q[2]]) as Quad]], pavTopo);
    }
    for (const [z, nome] of [[0, "Oitão frontal"], [-D, "Oitão dos fundos"]] as [number, string][]) {
      const pecas: [Quad, Quad][] = [];
      for (const [xa, xb] of [[-ESP / 2, W / 2], [W / 2, W + ESP / 2]]) {
        const q: Quad = [[xa, topo, z + ESP / 2], [xb, topo, z + ESP / 2], [xb, yX(xb), z + ESP / 2], [xa, yX(xa), z + ESP / 2]];
        pecas.push([q, q.map((v) => [v[0], v[1], v[2] - ESP]) as Quad]);
      }
      add("IfcWall", "SOLIDWALL", nome, "bloco", pecas, pavTopo);
    }
    for (const x of [0, W]) add("IfcWall", "SOLIDWALL", `Respaldo ${x === 0 ? "esquerdo" : "direito"}`, "bloco", [caixa(x - ESP / 2, topo, ESP / 2, x + ESP / 2, yBeiral, -D - ESP / 2)], pavTopo);
  }

  return { esquema: "PARAMETRICO", elementos, malhas, geo: {} };
}

export function descreverParametros(p: ParametrosCasa): string {
  const d = dimensionar(p);
  return `${fmt(d.largura)} × ${fmt(d.profundidade)} m, ${p.pavimentos} ${p.pavimentos === 1 ? "pavimento" : "pavimentos"}, ${fmt(p.area)} m², ${NOME_COBERTURA[p.cobertura].toLowerCase()}`;
}
