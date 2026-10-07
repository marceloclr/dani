// Navegação dentro da obra (ADR-23): mapa de ocupação a partir da geometria do IFC, portas, escadas e
// caminhos por A*. Matemática pura, sem Three.js nem DOM: testável no Node com qualquer modelo.
// Convenção da cena: Y para cima; planta no plano XZ.

export type P2 = [number, number]; // x, z
export type P3 = [number, number, number];

export interface Solido {
  guid: string;
  ifcType: string;
  nome?: string;
  posicoes: Float32Array; // x, y, z em coordenadas da cena
  indices: ArrayLike<number>;
}

export interface Caixa2D {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export interface Grade {
  x0: number;
  z0: number;
  passo: number;
  nx: number;
  nz: number;
  /** 1 = livre para passar; 0 = obstáculo (já com a folga do corpo). */
  livre: Uint8Array;
  /** Distância, em metros, de cada célula ao obstáculo mais próximo (sem a folga). */
  distancia: Float32Array;
}

/** Classes que não barram a passagem: portas ficam abertas; lajes e pisos são o chão. */
const NAO_BARRAM = new Set(["IfcDoor", "IfcSlab", "IfcCovering", "IfcSpace", "IfcOpeningElement", "IfcGeographicElement", "IfcBeam", "IfcRoof", "IfcSite"]);
export const ALTURA_OLHOS = 1.6;

// ------------------------------------------------------------------ caixas e fatias

export function caixaDe(s: Solido): { min: P3; max: P3 } {
  const min: P3 = [Infinity, Infinity, Infinity], max: P3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < s.posicoes.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = s.posicoes[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

/** Segmentos (em planta) onde os triângulos do sólido cortam o plano horizontal y. */
export function fatiar(s: Solido, y: number): [P2, P2][] {
  const out: [P2, P2][] = [];
  const p = s.posicoes, ix = s.indices;
  const v = (i: number): P3 => [p[i * 3], p[i * 3 + 1], p[i * 3 + 2]];
  for (let t = 0; t + 2 < ix.length; t += 3) {
    const tri = [v(ix[t]), v(ix[t + 1]), v(ix[t + 2])];
    const pts: P2[] = [];
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3];
      if ((a[1] - y) * (b[1] - y) < 0) {
        const u = (y - a[1]) / (b[1] - a[1]);
        pts.push([a[0] + (b[0] - a[0]) * u, a[2] + (b[2] - a[2]) * u]);
      }
    }
    if (pts.length === 2) out.push([pts[0], pts[1]]);
  }
  return out;
}

// ------------------------------------------------------------------ grade de ocupação

export const indice = (g: Grade, i: number, j: number) => j * g.nx + i;
export const celula = (g: Grade, x: number, z: number): [number, number] => [Math.floor((x - g.x0) / g.passo), Math.floor((z - g.z0) / g.passo)];
export const centro = (g: Grade, i: number, j: number): P2 => [g.x0 + (i + 0.5) * g.passo, g.z0 + (j + 0.5) * g.passo];
export const dentro = (g: Grade, i: number, j: number) => i >= 0 && j >= 0 && i < g.nx && j < g.nz;
export const livreEm = (g: Grade, x: number, z: number) => {
  const [i, j] = celula(g, x, z);
  return dentro(g, i, j) && g.livre[indice(g, i, j)] === 1;
};

/**
 * Mapa de ocupação de um pavimento: corta os obstáculos à altura do joelho e do peito acima do piso
 * e alarga cada obstáculo pela folga do corpo (o "drone" não raspa nas paredes).
 */
export function gradeDoPavimento(solidos: Solido[], piso: number, area: Caixa2D, passo = 0.1, folga = 0.3): Grade {
  const nx = Math.max(1, Math.ceil((area.x1 - area.x0) / passo));
  const nz = Math.max(1, Math.ceil((area.z1 - area.z0) / passo));
  const g: Grade = { x0: area.x0, z0: area.z0, passo, nx, nz, livre: new Uint8Array(nx * nz).fill(1), distancia: new Float32Array(nx * nz) };
  const ocupado = new Uint8Array(nx * nz);
  const porta = new Uint8Array(nx * nz); // folhas fechadas: não barram, mas o caminho mantém distância delas
  const marcar = (x: number, z: number, alvo = ocupado) => {
    const [i, j] = celula(g, x, z);
    if (dentro(g, i, j)) alvo[indice(g, i, j)] = 1;
  };
  for (const s of solidos) {
    if (s.ifcType === "IfcDoor")
      for (const [a, b] of fatiar(s, piso + 1.2)) {
        const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (passo / 2)));
        for (let k = 0; k <= n; k++) marcar(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n, porta);
      }
    if (NAO_BARRAM.has(s.ifcType)) continue;
    for (const y of [piso + 0.5, piso + 1.2]) {
      for (const [a, b] of fatiar(s, y)) {
        const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (passo / 2)));
        for (let k = 0; k <= n; k++) marcar(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n);
      }
    }
  }
  // distância ao obstáculo (chanfro 3-4), para o caminho preferir o meio dos cômodos
  const INF = 1e9;
  const dd = new Float32Array(nx * nz);
  for (let k = 0; k < nx * nz; k++) dd[k] = ocupado[k] || porta[k] ? 0 : INF;
  const relaxar = (i: number, j: number, di: number, dj: number, c: number) => {
    const ni = i + di, nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) return;
    const v = dd[nj * nx + ni] + c;
    if (v < dd[j * nx + i]) dd[j * nx + i] = v;
  };
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) (relaxar(i, j, -1, 0, 3), relaxar(i, j, 0, -1, 3), relaxar(i, j, -1, -1, 4), relaxar(i, j, 1, -1, 4));
  for (let j = nz - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) (relaxar(i, j, 1, 0, 3), relaxar(i, j, 0, 1, 3), relaxar(i, j, 1, 1, 4), relaxar(i, j, -1, 1, 4));
  for (let k = 0; k < nx * nz; k++) g.distancia[k] = Math.min(dd[k], INF) * (passo / 3);
  // folga: disco de raio `folga` em volta de cada célula ocupada
  const r = Math.ceil(folga / passo);
  const disco: [number, number][] = [];
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) if (di * di + dj * dj <= r * r) disco.push([di, dj]);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      if (!ocupado[indice(g, i, j)]) continue;
      for (const [di, dj] of disco) if (dentro(g, i + di, j + dj)) g.livre[indice(g, i + di, j + dj)] = 0;
    }
  return g;
}

/** Célula livre mais próxima de um ponto (busca em anéis), ou null. */
export function livreMaisProximo(g: Grade, p: P2, raioMax = 2): P2 | null {
  const [ci, cj] = celula(g, p[0], p[1]);
  const R = Math.ceil(raioMax / g.passo);
  let melhor: P2 | null = null, dMelhor = Infinity;
  for (let dj = -R; dj <= R; dj++)
    for (let di = -R; di <= R; di++) {
      const i = ci + di, j = cj + dj;
      if (!dentro(g, i, j) || !g.livre[indice(g, i, j)]) continue;
      const d = di * di + dj * dj;
      if (d < dMelhor) {
        dMelhor = d;
        melhor = centro(g, i, j);
      }
    }
  return melhor;
}

// ------------------------------------------------------------------ A*

/** Caminho livre de `de` até `para` (A* em 8 direções), já simplificado por linha de visada. Null se não houver. */
export function caminho(g: Grade, de: P2, para: P2): P2[] | null {
  const a = livreMaisProximo(g, de), b = livreMaisProximo(g, para);
  if (!a || !b) return null;
  const [ai, aj] = celula(g, a[0], a[1]), [bi, bj] = celula(g, b[0], b[1]);
  const inicio = indice(g, ai, aj), fim = indice(g, bi, bj);
  const custo = new Float32Array(g.nx * g.nz).fill(Infinity);
  const veio = new Int32Array(g.nx * g.nz).fill(-1);
  const fechado = new Uint8Array(g.nx * g.nz);
  const h = (i: number, j: number) => {
    const dx = Math.abs(i - bi), dz = Math.abs(j - bj);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  // fila de prioridade (heap binário) de [f, índice]
  const heap: [number, number][] = [];
  const push = (f: number, k: number) => {
    heap.push([f, k]);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (heap[p][0] <= heap[c][0]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = () => {
    const topo = heap[0], ult = heap.pop()!;
    if (heap.length) {
      heap[0] = ult;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1, r = l + 1;
        let m = c;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c], heap[m]];
        c = m;
      }
    }
    return topo;
  };
  custo[inicio] = 0;
  push(h(ai, aj), inicio);
  const viz = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.length) {
    const [, k] = pop();
    if (fechado[k]) continue;
    fechado[k] = 1;
    if (k === fim) break;
    const i = k % g.nx, j = (k - i) / g.nx;
    for (const [di, dj, c] of viz) {
      const ni = i + di, nj = j + dj;
      if (!dentro(g, ni, nj)) continue;
      const nk = indice(g, ni, nj);
      if (!g.livre[nk] || fechado[nk]) continue;
      // diagonal só se as duas vizinhas retas estiverem livres (não corta quina)
      if (di && dj && (!g.livre[indice(g, i + di, j)] || !g.livre[indice(g, i, j + dj)])) continue;
      // perto de parede e móvel custa mais: o caminho segue pelo meio, a até ~0,9 m deles
      const novo = custo[k] + c * (1 + 1.2 * Math.max(0, 0.9 - g.distancia[nk]));
      if (novo < custo[nk]) {
        custo[nk] = novo;
        veio[nk] = k;
        push(novo + h(ni, nj), nk);
      }
    }
  }
  if (!fechado[fim]) return null;
  const cel: P2[] = [];
  for (let k = fim; k !== -1; k = veio[k]) {
    const i = k % g.nx;
    cel.push(centro(g, i, (k - i) / g.nx));
  }
  cel.reverse();
  return simplificar(g, cel);
}

const distanciaEm = (g: Grade, x: number, z: number) => {
  const [i, j] = celula(g, x, z);
  return dentro(g, i, j) ? g.distancia[indice(g, i, j)] : 0;
};

/**
 * Há linha de visada livre entre dois pontos? (amostragem a cada meio passo). Com `margem`, a reta
 * também não pode chegar mais perto dos obstáculos do que isso (nem do que as próprias pontas chegam).
 */
export function visada(g: Grade, a: P2, b: P2, margem = 0): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (g.passo / 2)));
  const m = Math.min(margem, distanciaEm(g, a[0], a[1]), distanciaEm(g, b[0], b[1]));
  for (let k = 0; k <= n; k++) {
    const x = a[0] + ((b[0] - a[0]) * k) / n, z = a[1] + ((b[1] - a[1]) * k) / n;
    if (!livreEm(g, x, z) || distanciaEm(g, x, z) < m - 1e-6) return false;
  }
  return true;
}

/** Remove os pontos intermediários quando há visada direta (caminho de "corda esticada"). */
export function simplificar(g: Grade, pts: P2[]): P2[] {
  if (pts.length <= 2) return pts;
  const out: P2[] = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !visada(g, pts[i], pts[j], 0.7)) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

/** Ponto livre mais distante (pelo caminho) de `de`, dentro de `limite`: o fundo da casa, o quarto mais afastado. */
export function maisDistante(g: Grade, de: P2, limite?: Caixa2D, evitar: P2[] = [], raio = 1.8, folgaMinima = 0): P2 | null {
  const a = livreMaisProximo(g, de);
  if (!a) return null;
  const [ai, aj] = celula(g, a[0], a[1]);
  const dist = new Int32Array(g.nx * g.nz).fill(-1);
  const fila = [indice(g, ai, aj)];
  dist[fila[0]] = 0;
  let ultimo = fila[0];
  for (let q = 0; q < fila.length; q++) {
    const k = fila[q];
    // o ponto de parada não fica junto de uma porta (a folha abre ali)
    const [cx, cz] = centro(g, k % g.nx, Math.floor(k / g.nx));
    if (!evitar.some((p) => Math.hypot(p[0] - cx, p[1] - cz) < raio) && g.distancia[k] >= folgaMinima) ultimo = k;
    const i = k % g.nx, j = (k - i) / g.nx;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj;
      if (!dentro(g, ni, nj)) continue;
      const nk = indice(g, ni, nj);
      if (limite) {
        const [x, z] = centro(g, ni, nj);
        if (x < limite.x0 || x > limite.x1 || z < limite.z0 || z > limite.z1) continue;
      }
      if (g.livre[nk] && dist[nk] < 0) {
        dist[nk] = dist[k] + 1;
        fila.push(nk);
      }
    }
  }
  const i = ultimo % g.nx;
  return centro(g, i, (ultimo - i) / g.nx);
}

// ------------------------------------------------------------------ portas e escadas

export interface Porta {
  guid: string;
  centro: P3; // no piso
  normal: P2; // para fora da casa
  largura: number;
  externa: boolean;
  /** Caixa da folha (para a dobradiça e a abertura). */
  min: P3;
  max: P3;
}

/** Portas do modelo, com a normal apontando para fora da casa (para longe do centro das paredes). */
export function portas(solidos: Solido[], casa: Caixa2D): Porta[] {
  const cx = (casa.x0 + casa.x1) / 2, cz = (casa.z0 + casa.z1) / 2;
  const out: Porta[] = [];
  for (const s of solidos) {
    if (s.ifcType !== "IfcDoor") continue;
    const b = caixaDe(s);
    const dx = b.max[0] - b.min[0], dz = b.max[2] - b.min[2];
    const c: P3 = [(b.min[0] + b.max[0]) / 2, b.min[1], (b.min[2] + b.max[2]) / 2];
    // a folha é fina na direção da normal
    let normal: P2 = dx < dz ? [Math.sign(c[0] - cx) || 1, 0] : [0, Math.sign(c[2] - cz) || 1];
    const fora: P2 = [c[0] + normal[0] * 1.2, c[2] + normal[1] * 1.2];
    const externa = fora[0] < casa.x0 || fora[0] > casa.x1 || fora[1] < casa.z0 || fora[1] > casa.z1;
    if (!externa) normal = dx < dz ? [1, 0] : [0, 1];
    out.push({ guid: s.guid, centro: c, normal, largura: Math.max(dx, dz), externa, min: b.min, max: b.max });
  }
  return out;
}

export interface Escada {
  guid: string;
  baixo: P3; // ponto de chegada embaixo, já fora do primeiro degrau
  alto: P3; // ponto de saída em cima
  pisoBaixo: number;
  pisoAlto: number;
  direcao: P2;
}

/** Escadas: o lado baixo e o alto pelos topos dos degraus; serve para subir e descer no passeio. */
export function escadas(solidos: Solido[]): Escada[] {
  const out: Escada[] = [];
  for (const s of solidos) {
    if (s.ifcType !== "IfcStair" && s.ifcType !== "IfcStairFlight") continue;
    const b = caixaDe(s);
    const yMin = b.min[1], yMax = b.max[1], alt = yMax - yMin;
    if (alt < 1) continue;
    // vértices acima da base (topos dos degraus e o fundo inclinado), separados em faixas baixa e alta
    const baixos: P2[] = [], altos: P2[] = [];
    for (let i = 0; i < s.posicoes.length; i += 3) {
      const y = s.posicoes[i + 1];
      if (y < yMin + 0.05) continue;
      if (y <= yMin + alt * 0.2) baixos.push([s.posicoes[i], s.posicoes[i + 2]]);
      if (y >= yMax - alt * 0.08) altos.push([s.posicoes[i], s.posicoes[i + 2]]);
    }
    if (!baixos.length || !altos.length) continue;
    const media = (l: P2[]): P2 => [l.reduce((a, p) => a + p[0], 0) / l.length, l.reduce((a, p) => a + p[1], 0) / l.length];
    const lb = media(baixos), la = media(altos);
    const d = Math.hypot(la[0] - lb[0], la[1] - lb[1]) || 1;
    const dir: P2 = [(la[0] - lb[0]) / d, (la[1] - lb[1]) / d];
    out.push({
      guid: s.guid,
      baixo: [lb[0] - dir[0] * 0.9, yMin, lb[1] - dir[1] * 0.9],
      alto: [la[0] + dir[0] * 0.9, yMax, la[1] + dir[1] * 0.9],
      pisoBaixo: yMin,
      pisoAlto: yMax,
      direcao: dir,
    });
  }
  return out;
}

// ------------------------------------------------------------------ polilinhas

/** Tira os recuos curtos (vaivém de menos de 0,6 m com virada de mais de 150°), que fariam a câmera parar e voltar. */
export function semVaivem(pts: P3[]): P3[] {
  let p = pts;
  for (let volta = 0; volta < 4; volta++) {
    const out: P3[] = [p[0]];
    for (let i = 1; i < p.length - 1; i++) {
      const a = out[out.length - 1], b = p[i], c = p[i + 1];
      const u: P3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v: P3 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
      const lu = Math.hypot(...u), lv = Math.hypot(...v);
      if (lu < 1e-6) continue;
      const cos = lv < 1e-6 ? 1 : (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv);
      if (cos < -0.866 && Math.min(lu, lv) < 0.6) continue;
      out.push(b);
    }
    out.push(p[p.length - 1]);
    if (out.length === p.length) return out;
    p = out;
  }
  return p;
}

/** Troca cada virada fechada (mais de 60°) por um arco curto de raio `r`: a câmera vira sem parar. */
export function arredondar(pts: P3[], r = 0.35): P3[] {
  if (pts.length < 3) return pts;
  const out: P3[] = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const u: P3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v: P3 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    const lu = Math.hypot(...u), lv = Math.hypot(...v);
    if (lu < 1e-6 || lv < 1e-6) continue;
    const cos = (u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (lu * lv);
    if (cos > 0.5) {
      out.push(b);
      continue;
    }
    const k = Math.min(r, lu / 2, lv / 2);
    const p0: P3 = [b[0] - (u[0] / lu) * k, b[1] - (u[1] / lu) * k, b[2] - (u[2] / lu) * k];
    const p1: P3 = [b[0] + (v[0] / lv) * k, b[1] + (v[1] / lv) * k, b[2] + (v[2] / lv) * k];
    // curva de Bézier quadrática com o vértice como controle
    for (let s = 0; s <= 6; s++) {
      const t = s / 6, w0 = (1 - t) * (1 - t), w1 = 2 * t * (1 - t), w2 = t * t;
      out.push([w0 * p0[0] + w1 * b[0] + w2 * p1[0], w0 * p0[1] + w1 * b[1] + w2 * p1[1], w0 * p0[2] + w1 * b[2] + w2 * p1[2]]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** Suaviza uma polilinha 3D (Chaikin), mantendo as pontas. */
export function suavizar(pts: P3[], vezes = 2): P3[] {
  let p = pts;
  for (let v = 0; v < vezes && p.length > 2; v++) {
    const q: P3[] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      q.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1], 0.75 * a[2] + 0.25 * b[2]]);
      q.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1], 0.25 * a[2] + 0.75 * b[2]]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

export const comprimento = (pts: P3[]) => {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
  return s;
};

/** Ponto a uma fração u (0..1) do comprimento da polilinha. */
export function pontoEm(pts: P3[], u: number): P3 {
  if (pts.length === 1) return [...pts[0]];
  const total = comprimento(pts);
  let alvo = Math.min(Math.max(u, 0), 1) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (alvo <= d || i === pts.length - 1) {
      const t = d > 0 ? Math.min(alvo / d, 1) : 0;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
    alvo -= d;
  }
  return [...pts[pts.length - 1]];
}
