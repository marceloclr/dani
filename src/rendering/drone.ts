// Voo de drone e passeio pela obra pronta (ADR-23). Puro, sem Three.js: testável no Node.
// Primeira parte do vídeo: a obra é montada enquanto o drone voa em volta, entra pela porta e sai.
// Segunda parte: obra concluída e humanizada; o drone gira pelas fachadas, entra, sobe e desce a escada.
import {
  ALTURA_OLHOS,
  caixaDe,
  caminho,
  celula,
  comprimento,
  dentro,
  escadas,
  gradeDoPavimento,
  indice,
  livreEm,
  arredondar,
  semVaivem,
  maisDistante,
  visada,
  pontoEm,
  portas,
  suavizar,
  type Caixa2D,
  type Escada,
  type Grade,
  type P2,
  type P3,
  type Porta,
  type Solido,
} from "./navegacao";

export interface QuadroCamera {
  pos: P3;
  alvo: P3;
  fov: number;
  /** Portas abertas neste instante do voo automático: abertura (0 a 1) e lado do giro. */
  portas?: Map<string, EstadoPorta>;
}

export interface EstadoPorta {
  abertura: number;
  lado: 1 | -1;
}

/** Fração (antes de igualar a velocidade) em que a obra termina de ser montada. */
export const FRACAO_CONSTRUCAO = 0.5;
/** Parte final do voo parada na vista da fachada frontal (ADR-25). */
export const PARADA_FINAL = 0.06;
/**
 * Velocidade do voo automático na viewport, em m/s (ADR-25): a duração sai do comprimento do voo,
 * e não de um tempo fixo (antes, 30 s para qualquer voo: acima de 10 m/s nos modelos maiores).
 */
export const VELOCIDADE_VOO = 2.5;
/** Duração do voo automático na viewport: comprimento ÷ velocidade, mais a parada final. */
export const duracaoDoVooAutomatico = (comprimento: number) => comprimento / VELOCIDADE_VOO / (1 - PARADA_FINAL);

/** Dia da obra no instante u (0..1) do voo: a obra é montada até `fim` (Voo.fimConstrucao) e fica pronta. */
export function diaDoVoo(u: number, diasDeObra: number, fim = FRACAO_CONSTRUCAO): number {
  if (u >= fim) return diasDeObra - 1e-6;
  return (u / fim) * diasDeObra;
}

/**
 * Velocidade constante: refaz o tempo do voo pelo comprimento percorrido pela câmera, para o drone
 * andar sempre na mesma velocidade (sem acelerar em transições, órbitas ou dentro da casa).
 */
function velocidadeConstante(bruto: (u: number) => QuadroCamera, marcas: number[]): { quadro: (u: number) => QuadroCamera; marcas: number[]; comprimento: number } {
  const N = 8000;
  const acum = new Float64Array(N + 1);
  let ant = bruto(0).pos;
  for (let i = 1; i <= N; i++) {
    const p = bruto(i / N).pos;
    acum[i] = acum[i - 1] + Math.hypot(p[0] - ant[0], p[1] - ant[1], p[2] - ant[2]);
    ant = p;
  }
  const total = acum[N] || 1;
  const quadro = (u: number) => {
    const alvo = Math.min(Math.max(u, 0), 1) * total;
    let lo = 0, hi = N;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (acum[m] < alvo) lo = m;
      else hi = m;
    }
    const t = acum[hi] > acum[lo] ? (alvo - acum[lo]) / (acum[hi] - acum[lo]) : 0;
    return bruto((lo + t) / N);
  };
  return { quadro, marcas: marcas.map((m) => acum[Math.round(m * N)] / total), comprimento: total };
}

interface Trecho {
  peso: number; // duração relativa
  quadro(u: number): QuadroCamera;
}

export interface Voo {
  /** Câmera no instante u (0..1) do voo. */
  quadro(u: number): QuadroCamera;
  /** Pontos do passeio (para depuração e testes). */
  passeio: P3[];
  temEscada: boolean;
  entrada: Porta | null;
  resumo: string;
  /** Onde ficam as pessoas da obra humanizada (posição no piso e direção do olhar). */
  pessoas: { pos: P3; olhar: P2 }[];
  /** Portas que abrem quando o drone chega perto. */
  folhas: Folha[];
  /** Instante (0..1) em que a obra fica pronta, com a velocidade constante. */
  fimConstrucao: number;
  /** Comprimento do voo, em metros (velocidade = comprimento ÷ duração do vídeo). */
  comprimento: number;
  /** Instantes (0..1) das fases do voo, para o ciclo do dia (ADR-26). */
  marcas: { fimConstrucao: number; inicioInterno: number; inicioVoltaFinal: number; fimMovimento: number };
  /** Centro da casa (em volta do qual o drone gira). */
  centro: P3;
}

/** Há laje ou piso logo abaixo dos pés (até 35 cm)? Evita pessoa flutuando fora da casa. */
function temPiso(pisos: Solido[], x: number, z: number, y: number): boolean {
  for (const s of pisos) {
    const p = s.posicoes, ix = s.indices;
    for (let t = 0; t + 2 < ix.length; t += 3) {
      const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
      const ya = p[a + 1], yb = p[b + 1], yc = p[c + 1];
      const ym = (ya + yb + yc) / 3;
      if (ym > y + 0.1 || ym < y - 0.35 || Math.max(ya, yb, yc) - Math.min(ya, yb, yc) > 0.05) continue;
      // ponto dentro do triângulo, em planta
      const d1 = (x - p[b]) * (p[a + 2] - p[b + 2]) - (p[a] - p[b]) * (z - p[b + 2]);
      const d2 = (x - p[c]) * (p[b + 2] - p[c + 2]) - (p[b] - p[c]) * (z - p[c + 2]);
      const d3 = (x - p[a]) * (p[c + 2] - p[a + 2]) - (p[c] - p[a]) * (z - p[a + 2]);
      if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return true;
    }
  }
  return false;
}

/** Ponto livre perto de `perto`, visível do passeio (entre 1,2 e 3,5 m dele) sem ficar no caminho. */
function lugarDePessoa(g: Grade, passeio: P3[], perto: P2, y: number, pisos: Solido[]): { pos: P3; olhar: P2 } | null {
  const casados = passeio.filter((p) => Math.abs(p[1] - (y + ALTURA_OLHOS)) < 0.5);
  if (!casados.length) return null;
  let melhor: { pos: P3; olhar: P2 } | null = null, nota = Infinity;
  for (let x = perto[0] - 5; x <= perto[0] + 5; x += 0.3)
    for (let z = perto[1] - 5; z <= perto[1] + 5; z += 0.3) {
      // folga de meio metro em volta do corpo
      if (![[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]].every(([dx, dz]) => livreEm(g, x + dx, z + dz))) continue;
      if (!temPiso(pisos, x, z, y)) continue;
      let dMin = Infinity, maisPerto: P3 = casados[0];
      for (const p of casados) {
        const d = Math.hypot(p[0] - x, p[2] - z);
        if (d < dMin) {
          dMin = d;
          maisPerto = p;
        }
      }
      if (dMin < 1.2 || dMin > 3.5) continue;
      const n = Math.hypot(x - perto[0], z - perto[1]);
      if (n < nota) {
        nota = n;
        const d = Math.hypot(maisPerto[0] - x, maisPerto[2] - z) || 1;
        melhor = { pos: [x, y, z], olhar: [(maisPerto[0] - x) / d, (maisPerto[2] - z) / d] };
      }
    }
  return melhor;
}

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const suave = (u: number) => u * u * (3 - 2 * u);
const grau = (g: number) => (g * Math.PI) / 180;

/** Câmera em volta do centro: azimute 0 = frente (+z). */
function orbital(c: P3, az: number, el: number, dist: number, alvoY = c[1]): QuadroCamera {
  return {
    pos: [c[0] + dist * Math.cos(el) * Math.sin(az), c[1] + dist * Math.sin(el), c[2] + dist * Math.cos(el) * Math.cos(az)],
    alvo: [c[0], alvoY, c[2]],
    fov: 50,
  };
}

/** Trecho que segue uma polilinha olhando adiante (como quem anda ou pilota). */
function seguir(pts: P3[], fov: number, olharAdiante = 2.2, baixar = 0.15): Trecho {
  const total = Math.max(comprimento(pts), 0.01);
  return {
    peso: total,
    quadro: (u) => {
      const pos = pontoEm(pts, u);
      const adiante = pontoEm(pts, u + olharAdiante / total);
      // no fim do trecho, continua olhando na direção do último segmento
      if (Math.hypot(adiante[0] - pos[0], adiante[2] - pos[2]) < 0.3 && pts.length > 1) {
        const a = pts[pts.length - 2], b = pts[pts.length - 1];
        const d = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
        return { pos, alvo: [pos[0] + ((b[0] - a[0]) / d) * 2, pos[1] - baixar, pos[2] + ((b[2] - a[2]) / d) * 2], fov };
      }
      return { pos, alvo: [adiante[0], adiante[1] - baixar, adiante[2]], fov };
    },
  };
}

/** Transição suave entre dois quadros; sem peso, dura o equivalente à distância percorrida. */
function transicao(a: QuadroCamera, b: QuadroCamera, peso?: number): Trecho {
  return {
    peso: peso ?? Math.max(1, Math.hypot(b.pos[0] - a.pos[0], b.pos[1] - a.pos[1], b.pos[2] - a.pos[2]) * 1.5),
    quadro: (u) => {
      const s = suave(u);
      const m = (x: P3, y: P3): P3 => [lerp(x[0], y[0], s), lerp(x[1], y[1], s), lerp(x[2], y[2], s)];
      return { pos: m(a.pos, b.pos), alvo: m(a.alvo, b.alvo), fov: lerp(a.fov, b.fov, s) };
    },
  };
}

function encadear(trechos: Trecho[]): (u: number) => QuadroCamera {
  const total = trechos.reduce((s, t) => s + t.peso, 0) || 1;
  return (u) => {
    let x = Math.min(Math.max(u, 0), 1) * total;
    for (const t of trechos) {
      if (x <= t.peso) return t.quadro(t.peso > 0 ? x / t.peso : 1);
      x -= t.peso;
    }
    const ult = trechos[trechos.length - 1];
    return ult.quadro(1);
  };
}

// ------------------------------------------------------------------ portas que abrem

/** Folha de porta que gira na dobradiça quando o drone chega perto. */
export interface Folha {
  guid: string;
  centro: P3; // centro da folha, no piso
  dobradica: P2; // x, z do eixo vertical
  eixo: "x" | "z"; // direção da folha fechada
  lado: 1 | -1; // para que lado (na direção da normal) ela abre
  largura: number;
  /** O drone passa por ela? Só essas abrem; as outras ficam fechadas. */
  atravessada: boolean;
  /** Dobradiça na ponta de coordenada maior (a folha sai dela no sentido negativo). */
  inversa?: boolean;
}

/**
 * Quanto a porta está aberta (0 a 1) com a câmera em `cam`. Só abre a porta por onde o drone passa,
 * e só com ele no corredor de passagem (de frente para o vão): começa a 3,2 m e abre toda a 1,4 m.
 */
export function aberturaDaPorta(f: Folha, cam: P3 | null): number {
  if (!cam || !f.atravessada || Math.abs(cam[1] - (f.centro[1] + ALTURA_OLHOS)) > 1.6) return 0;
  const ao = f.eixo === "x" ? 0 : 2, n = f.eixo === "x" ? 2 : 0;
  if (Math.abs(cam[ao] - f.centro[ao]) > f.largura / 2 + 0.3) return 0; // ao lado da porta, não na frente
  const d = Math.abs(cam[n] - f.centro[n]);
  const u = Math.min(Math.max((3.2 - d) / (3.2 - 1.4), 0), 1);
  return suave(u);
}

/** Giro da folha em torno de Y (radianos) para a abertura dada; 90° com a porta toda aberta. */
export function anguloDaPorta(f: Folha, abertura: number, lado: 1 | -1 = f.lado): number {
  return (f.eixo === "x" ? -lado : lado) * (f.inversa ? -1 : 1) * (Math.PI / 2) * abertura;
}

/** Ponto da folha depois do giro (mesma convenção do Three.js para rotation.y). */
export function girarNaDobradica(f: Folha, abertura: number, p: P3, lado: 1 | -1 = f.lado): P3 {
  const t = anguloDaPorta(f, abertura, lado), c = Math.cos(t), s = Math.sin(t);
  const x = p[0] - f.dobradica[0], z = p[2] - f.dobradica[1];
  return [f.dobradica[0] + x * c + z * s, p[1], f.dobradica[1] - x * s + z * c];
}

/** Folhas de todas as portas; cada uma abre para o lado em que o drone a atravessa primeiro (para dentro, se nunca). */
function folhas(lista: Porta[], caminhos: P3[][]): Folha[] {
  return lista.map((p) => {
    const eixo: "x" | "z" = p.max[0] - p.min[0] >= p.max[2] - p.min[2] ? "x" : "z";
    const dobradica: P2 = eixo === "x" ? [p.min[0], p.centro[2]] : [p.centro[0], p.min[2]];
    const n = eixo === "x" ? 2 : 0; // coordenada perpendicular à folha
    const ao = eixo === "x" ? 0 : 2; // coordenada ao longo da folha
    let lado: 1 | -1 = p.externa ? (Math.sign(-(eixo === "x" ? p.normal[1] : p.normal[0])) >= 0 ? 1 : -1) : 1;
    let atravessada = false;
    procura: for (const pts of caminhos)
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const da = a[n] - p.centro[n], db = b[n] - p.centro[n];
        if (da * db > 0 || da === db) continue;
        const t = da / (da - db);
        const ao2 = a[ao] + (b[ao] - a[ao]) * t, y = a[1] + (b[1] - a[1]) * t;
        if (Math.abs(ao2 - p.centro[ao]) > p.largura / 2 + 0.1 || Math.abs(y - (p.centro[1] + ALTURA_OLHOS)) > 1) continue;
        lado = db - da > 0 ? 1 : -1; // empurra: abre para o lado em que o drone segue
        atravessada = true;
        break procura;
      }
    return { guid: p.guid, centro: p.centro, dobradica, eixo, lado, largura: p.largura, atravessada };
  });
}

/**
 * Portas no voo automático: cada passagem por um vão é localizada no tempo; a porta começa a abrir
 * 2,6 m antes, está toda aberta a 1,2 m do vão e fecha depois, sempre girando para o lado em que o
 * drone segue naquela passagem (ele empurra a porta). Nada abre de repente perto da câmera.
 */
function comPortas(quadro: (u: number) => QuadroCamera, comprimento: number, lista: Folha[]): (u: number) => QuadroCamera {
  const N = 6000;
  const passagens: { guid: string; u: number; lado: 1 | -1 }[] = [];
  let ant = quadro(0).pos;
  for (let i = 1; i <= N; i++) {
    const u = i / N, p = quadro(u).pos;
    for (const f of lista) {
      const n = f.eixo === "x" ? 2 : 0, ao = f.eixo === "x" ? 0 : 2;
      const da = ant[n] - f.centro[n], db = p[n] - f.centro[n];
      if (da * db >= 0) continue;
      const t = da / (da - db);
      if (Math.abs(ant[ao] + (p[ao] - ant[ao]) * t - f.centro[ao]) > f.largura / 2 + 0.1) continue;
      if (Math.abs(ant[1] + (p[1] - ant[1]) * t - (f.centro[1] + ALTURA_OLHOS)) > 1.2) continue;
      passagens.push({ guid: f.guid, u, lado: db > da ? 1 : -1 });
    }
    ant = p;
  }
  // dobradiça do lado oposto ao que o drone segue depois do vão: a folha aberta fica longe dele
  for (const f of lista) {
    const ao = f.eixo === "x" ? 0 : 2;
    let voto = 0;
    for (const x of passagens.filter((y) => y.guid === f.guid)) {
      const depois = quadro(Math.min(x.u + 1.8 / comprimento, 1)).pos;
      voto += Math.sign(depois[ao] - f.centro[ao]);
    }
    if (voto < 0) {
      // drone vai para o lado do mínimo: dobradiça na outra ponta da folha
      if (f.eixo === "x") f.dobradica = [2 * f.centro[0] - f.dobradica[0], f.dobradica[1]];
      else f.dobradica = [f.dobradica[0], 2 * f.centro[2] - f.dobradica[1]];
      f.inversa = true;
    }
  }
  return (u) => {
    const q = quadro(u);
    const portas = new Map<string, EstadoPorta>();
    for (const x of passagens) {
      const d = Math.abs(u - x.u) * comprimento; // metros até o vão, pelo caminho
      const a = suave(Math.min(Math.max((2.6 - d) / (2.6 - 1.2), 0), 1));
      if (a > (portas.get(x.guid)?.abertura ?? 0)) portas.set(x.guid, { abertura: a, lado: x.lado });
    }
    return { ...q, portas };
  };
}

/** Une as partes num voo só, cada parte ocupando a fração de tempo dada. */
function porFracoes(partes: { fracao: number; quadro: (u: number) => QuadroCamera }[]): (u: number) => QuadroCamera {
  return (u) => {
    let ini = 0;
    for (const p of partes) {
      if (u <= ini + p.fracao || p === partes[partes.length - 1]) return p.quadro(Math.min(Math.max((u - ini) / p.fracao, 0), 1));
      ini += p.fracao;
    }
    return partes[partes.length - 1].quadro(1);
  };
}

const no = (p: P2, y: number): P3 => [p[0], y, p[1]];

/** Bloqueia na grade um retângulo (vão da escada no pavimento de cima). */
function bloquear(g: Grade, x0: number, z0: number, x1: number, z1: number) {
  const [i0, j0] = celula(g, Math.min(x0, x1), Math.min(z0, z1));
  const [i1, j1] = celula(g, Math.max(x0, x1), Math.max(z0, z1));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (dentro(g, i, j)) g.livre[indice(g, i, j)] = 0;
}

/** Ligação de dois pontos por um caminho livre, na altura dos olhos; se não houver, linha reta. */
/** Caminho livre na altura y, ou null se não houver (nunca uma reta através das paredes). */
function ligar(g: Grade, a: P2, b: P2, y: number, vaos: Porta[] = []): P3[] | null {
  const c = caminho(g, a, b);
  return c ? pelosCentros(suavizarSeguro(g, c.map((p) => no(p, y))), vaos) : null;
}

/**
 * Ida e volta sem parar: no fim do caminho, faz meia-volta numa curva (raio 0,5 m) para o lado livre
 * e volta pelo mesmo caminho. Sem espaço para a curva, volta direto.
 */
function idaEVolta(g: Grade, ida: P3[]): P3[] {
  const volta = [...ida].reverse().slice(1);
  if (ida.length < 2) return [...ida, ...volta];
  const e = ida[ida.length - 1], a = ida[ida.length - 2];
  const d = Math.hypot(e[0] - a[0], e[2] - a[2]) || 1;
  const dir: P2 = [(e[0] - a[0]) / d, (e[2] - a[2]) / d];
  for (const r of [0.5, 0.35, 0.25])
  for (const lado of [1, -1]) {
    const perp: P2 = [-dir[1] * lado, dir[0] * lado];
    const c: P2 = [e[0] + perp[0] * r, e[2] + perp[1] * r];
    const arco: P3[] = [];
    for (let k = 1; k <= 8; k++) {
      // de e (ângulo de −perp) a e + 2r·perp, passando pela frente (dir)
      const t = (k / 8) * Math.PI;
      const vx = -perp[0] * Math.cos(t) + dir[0] * Math.sin(t), vz = -perp[1] * Math.cos(t) + dir[1] * Math.sin(t);
      arco.push([c[0] + vx * r, e[1], c[1] + vz * r]);
    }
    const ok = arco.every((p) => livreEm(g, p[0], p[2])) && (!volta.length || visada(g, [arco[7][0], arco[7][2]], [volta[0][0], volta[0][2]]));
    if (ok) return [...ida, ...arco, ...volta];
  }
  return [...ida, ...volta];
}

/** Passa pelo meio de cada vão de porta atravessado, longe dos batentes e da folha aberta. */
function pelosCentros(pts: P3[], vaos: Porta[]): P3[] {
  const out: P3[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    for (const p of vaos) {
      const fx = p.max[0] - p.min[0] >= p.max[2] - p.min[2];
      const n = fx ? 2 : 0, ao = fx ? 0 : 2;
      const da = a[n] - p.centro[n], db = b[n] - p.centro[n];
      if (da * db >= 0) continue;
      const t = da / (da - db);
      if (Math.abs(a[ao] + (b[ao] - a[ao]) * t - p.centro[ao]) > p.largura / 2 + 0.2) continue;
      const s = Math.sign(db - da), y = a[1];
      const antes: P3 = [p.centro[0], y, p.centro[2]], depois: P3 = [p.centro[0], y, p.centro[2]];
      // sem passar dos pontos vizinhos (senão a câmera iria e voltaria)
      antes[n] -= s * Math.min(1.0, Math.abs(da) * 0.9);
      depois[n] += s * Math.min(1.0, Math.abs(db) * 0.9);
      out.push(antes, depois);
    }
    out.push(b);
  }
  return out;
}

/** Cópia da grade só com o interior livre: o caminho passa por dentro da casa, nunca a contorna. */
function soInterior(g: Grade, c: Caixa2D): Grade {
  const livre = g.livre.slice();
  for (let j = 0; j < g.nz; j++)
    for (let i = 0; i < g.nx; i++) {
      const x = g.x0 + (i + 0.5) * g.passo, z = g.z0 + (j + 0.5) * g.passo;
      if (x < c.x0 || x > c.x1 || z < c.z0 || z > c.z1) livre[indice(g, i, j)] = 0;
    }
  return { ...g, livre };
}

/** Suaviza as curvas só onde a curva suavizada também fica livre (a suavização corta quinas). */
function suavizarSeguro(g: Grade, pts: P3[]): P3[] {
  const s = suavizar(pts, 2);
  for (let i = 1; i < s.length; i++) if (!visada(g, [s[i - 1][0], s[i - 1][2]], [s[i][0], s[i][2]])) return pts;
  return s;
}

/**
 * Monta o voo para um modelo. `caixa` é a caixa da casa (sem o terreno); `centro` e `raio` o enquadramento.
 * Sem porta externa, o drone só voa por fora; sem escada, o passeio percorre o térreo.
 */
export function montarVoo(solidos: Solido[], caixa: { min: P3; max: P3 }, centro: P3, raio: number): Voo {
  const casa: Caixa2D = { x0: caixa.min[0], x1: caixa.max[0], z0: caixa.min[2], z1: caixa.max[2] };
  const area: Caixa2D = { x0: casa.x0 - 5, x1: casa.x1 + 5, z0: casa.z0 - 5, z1: casa.z1 + 5 };
  const paredes = solidos.filter((s) => s.ifcType === "IfcWall" || s.ifcType === "IfcWallStandardCase");
  const piso = paredes.length ? Math.min(...paredes.map((s) => caixaDe(s).min[1])) : caixa.min[1];
  // interior: a caixa das paredes (sem beirais), um pouco recolhida
  const interior: Caixa2D = paredes.length
    ? {
        x0: Math.min(...paredes.map((s) => caixaDe(s).min[0])) + 0.2,
        x1: Math.max(...paredes.map((s) => caixaDe(s).max[0])) - 0.2,
        z0: Math.min(...paredes.map((s) => caixaDe(s).min[2])) + 0.2,
        z1: Math.max(...paredes.map((s) => caixaDe(s).max[2])) - 0.2,
      }
    : casa;
  const olho = piso + ALTURA_OLHOS;
  const R = Math.max(raio, 3);

  const todasPortas = portas(solidos, casa);
  const listaPortas = todasPortas.filter((p) => Math.abs(p.centro[1] - piso) < 0.6);
  const externas = listaPortas.filter((p) => p.externa);
  // a porta da frente: a que mais olha para +z (frente da casa)
  const entrada = [...externas].sort((a, b) => b.normal[1] - a.normal[1] || b.centro[2] - a.centro[2])[0] ?? null;
  const saida = entrada ? externas.filter((p) => p !== entrada).sort((a, b) => a.normal[1] - b.normal[1])[0] ?? null : null;
  const escada: Escada | null = escadas(solidos).filter((e) => Math.abs(e.pisoBaixo - piso) < 0.6).sort((a, b) => b.pisoAlto - a.pisoAlto)[0] ?? null;

  const gTerreo = soInterior(gradeDoPavimento(solidos, piso, area), interior);
  const centrosT: P2[] = listaPortas.map((p) => [p.centro[0], p.centro[2]]);
  const fora = (p: Porta, d: number): P2 => [p.centro[0] + p.normal[0] * d, p.centro[2] + p.normal[1] * d];
  const dentroDa = (p: Porta, d: number): P2 => [p.centro[0] - p.normal[0] * d, p.centro[2] - p.normal[1] * d];
  /** Azimute (a partir do centro) de quem está diante da porta: as transições ficam do mesmo lado da fachada. */
  const azDe = (p: Porta | null, reserva: number) => {
    if (!p) return reserva;
    const f = fora(p, 4);
    return Math.atan2(f[0] - centro[0], f[1] - centro[2]);
  };
  const azEntrada = azDe(entrada, grau(40));
  let azSaida = azDe(saida ?? entrada, grau(20));

  // ---------------------------------------------------------------- 1) obra sendo montada
  const construcao: Trecho[] = [];
  // espiral descendo e terminando de frente para a porta de entrada
  const voo1 = (u: number) => orbital(centro, lerp(azEntrada - grau(110), azEntrada, u), lerp(grau(48), grau(14), suave(u)), R * lerp(2.3, 1.35, suave(u)));
  construcao.push({ peso: 3, quadro: voo1 });
  let passagem: P3[] = [];
  if (entrada) {
    // entra pela porta da frente, atravessa por dentro e sai pela dos fundos (ou volta)
    const fundo = maisDistante(gTerreo, dentroDa(entrada, 0.8), interior, centrosT, 1.8, 0.9) ?? dentroDa(entrada, 2);
    const atravessa = saida ? ligar(gTerreo, dentroDa(entrada, 0.8), dentroDa(saida, 0.8), olho, listaPortas) : null;
    const dentroIda = atravessa ?? ligar(gTerreo, dentroDa(entrada, 0.8), fundo, olho, listaPortas) ?? [no(dentroDa(entrada, 0.8), olho)];
    const ida = [no(fora(entrada, 4), olho), no(fora(entrada, 0.4), olho), ...dentroIda, ...(atravessa ? [no(fora(saida!, 0.4), olho), no(fora(saida!, 3), olho)] : [])];
    passagem = arredondar(semVaivem(atravessa ? ida : idaEVolta(gTerreo, ida)));
    const p0 = passagem[0];
    construcao.push(transicao(voo1(1), { pos: p0, alvo: no(fora(entrada, 0), olho), fov: 60 }, 1.2));
    construcao.push({ ...seguir(passagem, 62, 2.5, 0.3), peso: 2.6 });
    if (!atravessa) azSaida = azEntrada; // voltou e saiu pela porta da frente
    const ultimo = seguir(passagem, 62, 2.5, 0.3).quadro(1);
    // sobe do lado da porta por onde saiu e continua girando alto
    const subir = orbital(centro, azSaida, grau(38), R * 1.6, centro[1]);
    construcao.push(transicao(ultimo, subir, 1.4));
    construcao.push({ peso: 2.2, quadro: (u) => orbital(centro, azSaida + grau(160) * u, grau(lerp(38, 30, u)), R * lerp(1.6, 1.5, u)) });
  } else {
    construcao.push({ peso: 5, quadro: (u) => orbital(centro, grau(40) + grau(280) * u, grau(lerp(14, 35, suave(u))), R * lerp(1.35, 1.6, u)) });
  }

  // ---------------------------------------------------------------- 2) obra pronta: fachadas
  const fimConstrucao = encadear(construcao)(1);
  const azFim = Math.atan2(fimConstrucao.pos[0] - centro[0], fimConstrucao.pos[2] - centro[2]);
  const distFachada = R * 1.25;
  const yFachada = Math.max(olho + 0.8, centro[1] - R * 0.15);
  const volta = (u: number): QuadroCamera => {
    // uma volta inteira (ou um pouco mais), terminando de frente para a porta de entrada
    const giro = 2 * Math.PI + ((((azEntrada - azFim) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
    const az = azFim + giro * u;
    const q = orbital(centro, az, 0, distFachada, lerp(centro[1], centro[1] - R * 0.1, u));
    q.pos[1] = lerp(fimConstrucao.pos[1], yFachada, suave(Math.min(u * 4, 1)));
    return q;
  };
  const fachadas: Trecho[] = [transicao(fimConstrucao, volta(0), 0.6), { peso: 4, quadro: volta }];

  // ---------------------------------------------------------------- 3) passeio pela obra pronta
  let passeio: P3[] = [];
  const pontos: P3[][] = [];
  const ancoras: { g: Grade; perto: P2; y: number }[] = [];
  if (entrada) {
    const porta = fora(entrada, 3.5);
    const interno = dentroDa(entrada, 1.2);
    pontos.push([no(porta, olho), no(fora(entrada, 0.3), olho), no(interno, olho)]);
    if (escada) {
      const baixo: P2 = [escada.baixo[0], escada.baixo[2]];
      const alto: P2 = [escada.alto[0], escada.alto[2]];
      pontos.push(ligar(gTerreo, interno, baixo, olho, listaPortas) ?? []);
      // subir: a câmera acompanha a escada até o pavimento de cima
      const olhoAlto = escada.pisoAlto + ALTURA_OLHOS;
      const subida: P3[] = [];
      for (let k = 0; k <= 8; k++) {
        const u = k / 8;
        subida.push([lerp(escada.baixo[0], escada.alto[0], u), lerp(olho, olhoAlto, suave(u)), lerp(escada.baixo[2], escada.alto[2], u)]);
      }
      pontos.push(subida);
      const portasCima = todasPortas.filter((p) => Math.abs(p.centro[1] - escada.pisoAlto) < 0.6);
      const gCima = soInterior(gradeDoPavimento(solidos, escada.pisoAlto, area), interior);
      const fx = [escada.baixo[0], escada.alto[0]], fz = [escada.baixo[2], escada.alto[2]];
      bloquear(gCima, Math.min(...fx) - 0.2, Math.min(...fz) - 0.2, Math.max(...fx) + 0.2, Math.max(...fz) + 0.2);
      const desembarque = alto;
      const quarto = maisDistante(gCima, desembarque, interior, portasCima.map((p) => [p.centro[0], p.centro[2]] as P2), 1.8, 0.9) ?? desembarque;
      ancoras.push({ g: gCima, perto: quarto, y: escada.pisoAlto });
      const ida = ligar(gCima, desembarque, quarto, olhoAlto, portasCima) ?? [no(desembarque, olhoAlto)];
      pontos.push(idaEVolta(gCima, ida));
      pontos.push([...subida].reverse());
      const sala = maisDistante(gTerreo, baixo, interior, centrosT, 1.8, 0.9) ?? interno;
      ancoras.push({ g: gTerreo, perto: sala, y: piso });
      pontos.push(ligar(gTerreo, baixo, sala, olho, listaPortas) ?? []);
    } else {
      const fundo = maisDistante(gTerreo, interno, interior, centrosT, 1.8, 0.9) ?? interno;
      ancoras.push({ g: gTerreo, perto: fundo, y: piso });
      pontos.push(ligar(gTerreo, interno, fundo, olho, listaPortas) ?? []);
    }
    // sai pela porta da frente para a última volta por fora
    const ultimoDentro = pontos.flat().at(-1);
    if (ultimoDentro) {
      const de: P2 = [ultimoDentro[0], ultimoDentro[2]];
      pontos.push(ligar(gTerreo, de, dentroDa(entrada, 0.8), olho, listaPortas) ?? [no(dentroDa(entrada, 0.8), olho)]);
      pontos.push([no(fora(entrada, 0.4), olho), no(fora(entrada, 3.5), olho)]);
    }
    passeio = arredondar(semVaivem(pontos.flat().filter((p, i, l) => i === 0 || Math.hypot(p[0] - l[i - 1][0], p[1] - l[i - 1][1], p[2] - l[i - 1][2]) > 0.05)));
  }
  const interno: Trecho[] = [];
  if (passeio.length > 1) {
    interno.push(transicao(volta(1), { pos: passeio[0], alvo: no(fora(entrada!, 0), olho - 0.1), fov: 62 }));
    interno.push(seguir(passeio, 68));
  } else {
    interno.push({ peso: 1, quadro: (u) => orbital(centro, grau(lerp(0, -40, u)), grau(lerp(4, 20, u)), R * lerp(1.25, 1.1, u)) });
  }

  // ---------------------------------------------------------------- 4) última volta por fora
  // mais uma volta inteira pelas fachadas, subindo um pouco, e para de frente para a fachada frontal
  // (como o preset Frontal: a câmera em +z, olhando a casa inteira)
  const fimInterno = encadear(interno)(1);
  const azSaidaFinal = Math.atan2(fimInterno.pos[0] - centro[0], fimInterno.pos[2] - centro[2]);
  const giroFinal = 2 * Math.PI + ((((0 - azSaidaFinal) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
  const distFrontal = R * 1.7;
  const ultimaVolta = (u: number): QuadroCamera => {
    const q = orbital(centro, azSaidaFinal + giroFinal * suave(u), lerp(grau(10), grau(7), u), lerp(distFachada, distFrontal, suave(u)), lerp(centro[1] - R * 0.1, centro[1], u));
    q.fov = 50;
    return q;
  };
  const externoFinal: Trecho[] = [transicao(fimInterno, ultimaVolta(0), 1), { peso: 4, quadro: ultimaVolta }];

  const pronto = porFracoes([
    { fracao: 0.3, quadro: encadear(fachadas) },
    { fracao: 0.45, quadro: encadear(interno) },
    { fracao: 0.25, quadro: encadear(externoFinal) },
  ]);
  const bruto = porFracoes([
    { fracao: FRACAO_CONSTRUCAO, quadro: encadear(construcao) },
    { fracao: 1 - FRACAO_CONSTRUCAO, quadro: pronto },
  ]);
  // marcas das fases no tempo bruto: a obra pronta ocupa a segunda metade, e nela as fachadas 30 %,
  // o interior 45 % e a volta final 25 %
  const R2 = 1 - FRACAO_CONSTRUCAO;
  const vc = velocidadeConstante(bruto, [FRACAO_CONSTRUCAO, FRACAO_CONSTRUCAO + R2 * 0.3, FRACAO_CONSTRUCAO + R2 * 0.75]);
  // parada final: o tempo de PARADA_FINAL fica na vista da fachada frontal (o voo anda no resto)
  const andando = 1 - PARADA_FINAL;
  const comParada = (u: number) => vc.quadro(Math.min(u / andando, 1));
  const resumo = [
    "volta completa por fora",
    entrada ? "entra pela porta da frente" : "sem porta externa: voo só por fora",
    escada ? "sobe e desce a escada" : "sem escada: passeio pelo térreo",
    entrada ? "sai e dá outra volta por fora" : "",
    "termina parado de frente para a fachada",
  ].filter(Boolean).join("; ");
  const pessoas: { pos: P3; olhar: P2 }[] = [];
  if (entrada) {
    // duas pessoas conversando na frente da casa, ao lado do caminho da porta
    const lado: P2 = [-entrada.normal[1], entrada.normal[0]];
    const f = fora(entrada, 4.2);
    const a: P2 = [f[0] + lado[0] * 1.7, f[1] + lado[1] * 1.7], b: P2 = [f[0] + lado[0] * 2.5, f[1] + lado[1] * 2.5];
    const ab: P2 = [b[0] - a[0], b[1] - a[1]];
    const k = Math.hypot(ab[0], ab[1]) || 1;
    pessoas.push({ pos: no(a, piso), olhar: [ab[0] / k, ab[1] / k] }, { pos: no(b, piso), olhar: [-ab[0] / k, -ab[1] / k] });
  } else {
    pessoas.push({ pos: [centro[0] - 1, piso, caixa.max[2] + 3], olhar: [0, -1] }, { pos: [centro[0] + 0.2, piso, caixa.max[2] + 3.3], olhar: [-0.7, -0.7] });
  }
  const pisos = solidos.filter((s) => s.ifcType === "IfcSlab" || s.ifcType === "IfcCovering");
  for (const an of ancoras) {
    const lugar = lugarDePessoa(an.g, passeio, an.perto, an.y, pisos);
    if (lugar) pessoas.push(lugar);
  }
  const listaFolhas = folhas(todasPortas, [passagem, passeio]);
  const quadro = comPortas(comParada, vc.comprimento / andando, listaFolhas); // metros por unidade de u (com a parada)
  const marcas = { fimConstrucao: vc.marcas[0] * andando, inicioInterno: vc.marcas[1] * andando, inicioVoltaFinal: vc.marcas[2] * andando, fimMovimento: andando };
  return { quadro, passeio, temEscada: !!escada, entrada, resumo, pessoas, folhas: listaFolhas, fimConstrucao: marcas.fimConstrucao, comprimento: vc.comprimento, marcas, centro };
}
