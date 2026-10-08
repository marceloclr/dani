// Montagem em cenas (ADR-25): o vídeo vira uma sequência de cenas com cortes secos sobre a fala
// contínua da apresentadora, como nos Reels de arquitetura. Puro, sem DOM: testado no Node.
import { poseDoPreset, type Enquadramento, type Pose, type Preset } from "./cameras";

export type TipoCena = "fala" | "revelacao" | "obra" | "marca";
export type CameraCena = "drone" | Preset;
export type PessoaNaCena = "cheia" | "recortada" | "oculta";

export interface Cena {
  id: string;
  tipo: TipoCena;
  /** Parte do vídeo que cabe à cena: as durações acompanham a duração do vídeo (e da fala). */
  peso: number;
  camera: CameraCena;
  /** Avanço da obra (0 = terreno, 1 = pronta) no começo e no fim da cena. */
  obra: [number, number];
  /** Como a apresentadora aparece: o quadro original inteiro, recortada no canto ou fora. */
  pessoa: PessoaNaCena;
}

export const NOME_CENA: Record<TipoCena, string> = { fala: "Fala no terreno", revelacao: "Revelação", obra: "Obra", marca: "Marca" };

/** Duração mínima de uma cena, em segundos. */
export const MINIMO_CENA_S = 0.8;

const cena = (id: string, tipo: TipoCena, peso: number, camera: CameraCena, obra: [number, number], pessoa: PessoaNaCena): Cena => ({ id, tipo, peso, camera, obra, pessoa });

/**
 * Roteiro Reels. Com a fala: abertura com ela no terreno, revelação do projeto atrás dela (a obra sobe
 * do terreno à pronta), passeio do drone pela obra pronta, volta dela em primeiro plano e a marca.
 * Sem a fala: a obra se monta, o drone passeia e a marca fecha.
 */
export function roteiroReels(temFala: boolean, passeioInterno = true): Cena[] {
  const passeio: CameraCena = passeioInterno ? "drone" : "orbita";
  return temFala
    ? [
        cena("abertura", "fala", 0.15, "frontal", [0, 0], "cheia"),
        cena("revelacao", "revelacao", 0.25, "frontal", [0, 1], "cheia"),
        cena("passeio", "obra", 0.4, passeio, [1, 1], "oculta"),
        cena("volta", "obra", 0.12, "orbita", [1, 1], "recortada"),
        cena("marca", "marca", 0.08, "frontal", [1, 1], "oculta"),
      ]
    : [
        cena("montagem", "obra", 0.4, "isometrica", [0, 1], "oculta"),
        cena("passeio", "obra", 0.5, passeio, [1, 1], "oculta"),
        cena("marca", "marca", 0.1, "frontal", [1, 1], "oculta"),
      ];
}

/**
 * Deixa a lista pronta para gerar: só cenas possíveis (sem fala, nada de `fala`/`revelacao` nem pessoa),
 * pesos positivos com pelo menos 0,8 s por cena, e uma única `marca`, a última.
 */
export function normalizar(cenas: Cena[], total: number, temFala: boolean): Cena[] {
  let l = cenas.filter((c) => temFala || (c.tipo !== "fala" && c.tipo !== "revelacao")).map((c) => ({ ...c, pessoa: temFala ? c.pessoa : "oculta", peso: Math.max(0, c.peso) || 0 }));
  const marcas = l.filter((c) => c.tipo === "marca");
  l = l.filter((c) => c.tipo !== "marca");
  if (marcas.length) l.push(marcas[marcas.length - 1]);
  if (!l.length) return roteiroReels(temFala);
  const minimo = Math.min(1 / l.length, MINIMO_CENA_S / Math.max(total, 1e-6));
  let soma = l.reduce((s, c) => s + c.peso, 0);
  if (!(soma > 0)) {
    l.forEach((c) => (c.peso = 1));
    soma = l.length;
  }
  // garante o mínimo e redistribui o resto proporcionalmente
  const frac = l.map((c) => c.peso / soma);
  const curtas = frac.map((f) => f < minimo);
  const resto = 1 - minimo * curtas.filter(Boolean).length;
  const somaLongas = frac.reduce((s, f, i) => (curtas[i] ? s : s + f), 0);
  return l.map((c, i) => ({ ...c, peso: curtas[i] ? minimo : (frac[i] / (somaLongas || 1)) * resto }));
}

export interface PontoNaMontagem {
  indice: number;
  cena: Cena;
  /** Começo e fim da cena, em segundos. */
  inicio: number;
  fim: number;
  /** Posição dentro da cena (0 a 1). */
  u: number;
}

/** Em que cena está o segundo `t` de um vídeo de `total` segundos (o último instante cai na última cena). */
export function cenaNoTempo(cenas: Cena[], t: number, total: number): PontoNaMontagem {
  const soma = cenas.reduce((s, c) => s + c.peso, 0) || 1;
  let inicio = 0;
  for (let i = 0; i < cenas.length; i++) {
    const fim = i === cenas.length - 1 ? total : inicio + (cenas[i].peso / soma) * total;
    if (t < fim || i === cenas.length - 1) {
      const u = fim > inicio ? Math.min(1, Math.max(0, (t - inicio) / (fim - inicio))) : 1;
      return { indice: i, cena: cenas[i], inicio, fim, u };
    }
    inicio = fim;
  }
  throw new Error("montagem sem cenas");
}

/** Segundos de cada cena (para a faixa da interface). */
export function duracoes(cenas: Cena[], total: number): number[] {
  const soma = cenas.reduce((s, c) => s + c.peso, 0) || 1;
  return cenas.map((c) => (c.peso / soma) * total);
}

/** Avanço da obra dentro da cena, com início e fim suaves. */
export function obraNaCena(c: Cena, u: number): number {
  const s = u * u * (3 - 2 * u);
  return c.obra[0] + (c.obra[1] - c.obra[0]) * s;
}

/** Largura da borda suave da cortina, em fração da altura. */
export const BORDA_CORTINA = 0.12;

/**
 * Opacidade do fundo real na altura `y` do quadro (0 = embaixo, 1 = em cima) quando a revelação está em
 * `u`: a obra **sobe**, então o fundo some de baixo para cima, com borda suave. 1 em u = 0 (fundo
 * inteiro), 0 em u = 1 (só a obra atrás da pessoa). Mesma conta do shader.
 */
export function cortinaRevelacao(u: number, y: number): number {
  const b = BORDA_CORTINA;
  const frente = -b + u * (1 + 2 * b); // a frente da obra vai de abaixo do quadro a acima dele
  const t = Math.min(1, Math.max(0, (y - frente + b) / (2 * b)));
  return t * t * (3 - 2 * t);
}

/**
 * Câmera de uma cena com vista (não drone): o preset com movimento lento, como num Reels: a órbita
 * anda 15 % da volta; as outras vistas se aproximam 8 % e giram 3,4°.
 */
export function poseDaCena(camera: Preset, e: Enquadramento, u: number): Pose {
  if (camera === "orbita") return poseDoPreset("orbita", e, 0.15 * u);
  const p = poseDoPreset(camera, e);
  return { ...p, az: p.az + 0.06 * u, dist: p.dist * (1 - 0.08 * u) };
}

/** Trecho do voo do drone (0 a 1) numa cena: a montagem até `fimConstrucao`, o passeio pela obra pronta depois. */
export function trechoDoVoo(c: Cena, u: number, fimConstrucao: number): number {
  return c.obra[0] >= 1 ? fimConstrucao + u * (1 - fimConstrucao) : u * fimConstrucao;
}

/** Onde cada fala da planilha entra (ADR-30): no terreno (abertura e revelação), sobre a obra (recortada) ou só a voz. */
export type CenaDaFala = "terreno" | "sobre-obra" | "voz";

/** Duração da cena da marca, que fecha o vídeo depois da última fala. */
export const MARCA_S = 2.5;
/** Duração aproximada de cada tomada sobre a obra: cortes a cada 3 a 4 s, como nos Reels. */
export const TOMADA_S = 3.5;
/** Câmeras das tomadas sobre a obra, em rodízio. */
// sem a vista de cima: de cima, por dentro, a obra vira um piso branco sem leitura (ADR-31)
export const CAMERAS_TOMADA: Preset[] = ["externa", "isometrica", "frontal", "orbita", "lateral"];

/**
 * Roteiro a partir das falas da planilha (ADR-30). As cenas seguem as falas, na ordem e com a duração de cada
 * uma, e a marca fecha o vídeo (`MARCA_S`). Total = soma das falas + `MARCA_S`.
 * - **terreno**: o quadro original dela (45 %) e a revelação, com a obra pronta subindo atrás dela (55 %);
 * - **sobre a obra** / **só a voz**: tomadas de ~3,5 s em rodízio de câmeras, com a obra se formando ao longo de
 *   todas essas falas (do terreno à pronta), com ela recortada no canto ou fora do quadro;
 * - a última fala sobre a obra, se tiver 6 s ou mais, termina com o passeio do drone pela obra pronta (40 %, até 10 s).
 */
export function roteiroDasFalas(falas: { cena: CenaDaFala; duracaoS: number }[], opcoes: { passeioInterno?: boolean } = {}): { cenas: Cena[]; totalS: number } {
  // casa paramétrica (sem IFC) não tem interior que valha o passeio: a última tomada vira uma volta por fora
  const cameraPasseio: CameraCena = opcoes.passeioInterno === false ? "orbita" : "drone";
  const soma = falas.reduce((s, f) => s + Math.max(0, f.duracaoS), 0);
  if (!falas.length || !(soma > 0)) return { cenas: roteiroReels(false), totalS: 30 };
  const totalS = soma + MARCA_S;
  const brutas: { tipo: TipoCena; s: number; camera: CameraCena; obra: [number, number]; pessoa: PessoaNaCena }[] = [];
  // a última fala sobre a obra guarda o fim para o passeio pela obra pronta
  let ultimaObra = -1;
  falas.forEach((f, i) => (f.cena !== "terreno" ? (ultimaObra = i) : undefined));
  const passeioS = ultimaObra >= 0 && falas[ultimaObra].duracaoS >= 6 ? Math.min(10, falas[ultimaObra].duracaoS * 0.4) : 0;
  const tempoObra = falas.reduce((s, f) => (f.cena === "terreno" ? s : s + f.duracaoS), 0) - passeioS;
  let progresso = 0, rodizio = 0;
  falas.forEach((f, i) => {
    const d = Math.max(0, f.duracaoS);
    if (!(d > 0)) return;
    if (f.cena === "terreno") {
      brutas.push({ tipo: "fala", s: d * 0.45, camera: "frontal", obra: [0, 0], pessoa: "cheia" });
      brutas.push({ tipo: "revelacao", s: d * 0.55, camera: "frontal", obra: [0, 1], pessoa: "cheia" });
      return;
    }
    const pessoa: PessoaNaCena = f.cena === "voz" ? "oculta" : "recortada";
    const montagemS = i === ultimaObra ? d - passeioS : d;
    const n = Math.max(1, Math.round(montagemS / TOMADA_S));
    for (let k = 0; k < n && montagemS > 0; k++) {
      const s = montagemS / n;
      const ini = progresso, fim = tempoObra > 0 ? Math.min(1, progresso + s / tempoObra) : 1;
      brutas.push({ tipo: "obra", s, camera: CAMERAS_TOMADA[rodizio++ % CAMERAS_TOMADA.length], obra: [ini, fim], pessoa });
      progresso = fim;
    }
    if (i === ultimaObra && passeioS > 0) brutas.push({ tipo: "obra", s: passeioS, camera: cameraPasseio, obra: [1, 1], pessoa });
  });
  brutas.push({ tipo: "marca", s: MARCA_S, camera: "frontal", obra: [1, 1], pessoa: "oculta" });
  return { cenas: brutas.map((b, i) => cena(`f${i}`, b.tipo, b.s / totalS, b.camera, b.obra, b.pessoa)), totalS };
}
