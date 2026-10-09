// Montagem em cenas (ADR-25): o vídeo vira uma sequência de cenas com cortes secos sobre a fala
// contínua da apresentadora, como nos Reels de arquitetura. Puro, sem DOM: testado no Node.
import { poseDoPreset, type Enquadramento, type Pose, type Preset } from "./cameras";
import type { QuadroCamera, Voo } from "./drone";

export type TipoCena = "fala" | "revelacao" | "obra" | "foto" | "marca";
/** "continua" (ADR-41): uma tomada lenta que acompanha o avanço da obra, sem cortes entre as falas. */
export type CameraCena = "drone" | "continua" | Preset;
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
  /**
   * Passeio pela obra pronta (ADR-32): "volta" = órbita baixa, à altura de quem olha a casa da rua;
   * "interno" = trecho do voo do drone desde a porta de entrada, a passo de quem caminha.
   */
  percurso?: "volta" | "interno";
  /** Nome na faixa de cenas (senão, o do tipo). */
  rotulo?: string;
  /** Cena de foto (ADR-34): índice da foto na lista de fotos do vídeo. */
  foto?: number;
}

/** Passeio pela obra pronta no fim do vídeo do assistente (ADR-32). */
export type Passeio = "externo" | "interno" | "ambos";
export const NOME_PASSEIO: Record<Passeio, string> = { externo: "Externo", interno: "Interno", ambos: "Ambos" };

export const NOME_CENA: Record<TipoCena, string> = { fala: "Fala no terreno", revelacao: "Revelação", obra: "Obra", foto: "Foto", marca: "Marca" };

/** Esmaecimento da obra para a marca (ADR-33): segundos e curva (suave nas pontas). */
export const ESMAECER_MARCA_S = 0.4;
export const suaveMarca = (x: number) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};

/** Duração mínima de uma cena, em segundos. */
export const MINIMO_CENA_S = 0.8;

const cena = (id: string, tipo: TipoCena, peso: number, camera: CameraCena, obra: [number, number], pessoa: PessoaNaCena, extra: Partial<Cena> = {}): Cena => ({ id, tipo, peso, camera, obra, pessoa, ...extra });

/** Cenas do passeio final (ADR-32), com a parte de cada uma: externo = volta; interno = por dentro; ambos = volta e, depois, por dentro. */
export function cenasDoPasseio(passeio: Passeio): { camera: CameraCena; parte: number; percurso: "volta" | "interno"; rotulo: string }[] {
  const volta = { camera: "orbita" as CameraCena, percurso: "volta" as const, rotulo: "Volta por fora" };
  const dentro = { camera: "drone" as CameraCena, percurso: "interno" as const, rotulo: "Por dentro" };
  return passeio === "externo" ? [{ ...volta, parte: 1 }] : passeio === "interno" ? [{ ...dentro, parte: 1 }] : [{ ...volta, parte: 0.4 }, { ...dentro, parte: 0.6 }];
}

/** Duração do passeio final, pela última fala sobre a obra: externo até 10 s (40 %), interno até 14 s (50 %), ambos até 16 s (55 %). */
export function duracaoDoPasseio(passeio: Passeio, falaS: number): number {
  if (falaS < 6) return 0;
  const [max, frac] = passeio === "externo" ? [10, 0.4] : passeio === "interno" ? [14, 0.5] : [16, 0.55];
  return Math.min(max, falaS * frac);
}

/**
 * Roteiro Reels. Com a fala: abertura com ela no terreno, revelação do projeto atrás dela (a obra sobe
 * do terreno à pronta), passeio do drone pela obra pronta, volta dela em primeiro plano e a marca.
 * Sem a fala: a obra se monta, o drone passeia e a marca fecha.
 */
export function roteiroReels(temFala: boolean, passeio: boolean | Passeio = true): Cena[] {
  // true = o voo inteiro do drone (Gestão); um Passeio = as cenas do passeio do assistente (ADR-32)
  const fim = (id: string, peso: number, pessoa: PessoaNaCena): Cena[] =>
    typeof passeio === "boolean"
      ? [cena(id, "obra", peso, passeio ? "drone" : "orbita", [1, 1], pessoa, passeio ? {} : { percurso: "volta", rotulo: "Volta por fora" })]
      : cenasDoPasseio(passeio).map((p, k) => cena(`${id}${k}`, "obra", peso * p.parte, p.camera, [1, 1], pessoa, { percurso: p.percurso, rotulo: p.rotulo }));
  return temFala
    ? [
        cena("abertura", "fala", 0.15, "frontal", [0, 0], "cheia"),
        cena("revelacao", "revelacao", 0.25, "frontal", [0, 1], "cheia"),
        ...fim("passeio", 0.4, "oculta"),
        cena("volta", "obra", 0.12, "orbita", [1, 1], "recortada"),
        cena("marca", "marca", 0.08, "frontal", [1, 1], "oculta"),
      ]
    : [
        cena("montagem", "obra", 0.4, "isometrica", [0, 1], "oculta"),
        ...fim("passeio", 0.5, "oculta"),
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
 * Câmera contínua (ADR-41): pelo avanço da obra `x` (0 = terreno, 1 = pronta), gira devagar da frente-esquerda
 * para quase de frente, descendo e se aproximando. Depende só de `x`: não pula entre uma fala e outra.
 */
export const CONTINUA = { azIni: -75, azFim: -15, elIni: 32, elFim: 16, distIni: 1.12, distFim: 0.98 };
export function poseContinua(e: Enquadramento, x: number): Pose {
  const t = Math.min(Math.max(x, 0), 1);
  const l = (a: number, b: number) => a + (b - a) * t;
  return { az: grauRad(l(CONTINUA.azIni, CONTINUA.azFim)), el: grauRad(l(CONTINUA.elIni, CONTINUA.elFim)), dist: l(CONTINUA.distIni, CONTINUA.distFim), alvo: e.centro };
}

/**
 * Volta por fora (ADR-32): baixa, à altura de quem olha da rua, de `inicioGraus`, girando `giroGraus`. Com
 * `elInicioGraus`, desce dessa altura até a da rua no primeiro terço da volta (sem degrau depois da contínua).
 */
export function poseDaVolta(e: Enquadramento, u: number, inicioGraus = -70, giroGraus = 120, elInicioGraus = 9): Pose {
  const p = poseDoPreset("orbita", e);
  const desce = suaveMarca(u / 0.3);
  return { ...p, az: grauRad(inicioGraus) + grauRad(giroGraus) * u, el: grauRad(elInicioGraus + (9 - elInicioGraus) * desce), dist: 0.98 };
}

/**
 * Câmera de uma cena com vista (não drone): o preset com movimento lento, como num Reels: a órbita
 * anda 15 % da volta; as outras vistas se aproximam 8 % e giram 3,4°. A contínua segue o avanço da obra
 * (`obra`, o da cena) e a volta por fora começa onde ela parou, no mesmo sentido (ADR-41).
 */
export function poseDaCena(camera: Preset | "continua", e: Enquadramento, u: number, percurso?: Cena["percurso"], obra?: [number, number]): Pose {
  if (percurso === "volta") return poseDaVolta(e, u, CONTINUA.azFim, 90, CONTINUA.elFim);
  if (camera === "continua") return poseContinua(e, obra ? obra[0] + (obra[1] - obra[0]) * u : u);
  if (camera === "orbita") return poseDoPreset("orbita", e, 0.15 * u);
  const p = poseDoPreset(camera, e);
  return { ...p, az: p.az + 0.06 * u, dist: p.dist * (1 - 0.08 * u) };
}

const grauRad = (g: number) => (g * Math.PI) / 180;

/** Trecho do voo do drone (0 a 1) numa cena: a montagem até `fimConstrucao`, o passeio pela obra pronta depois. */
export function trechoDoVoo(c: Cena, u: number, fimConstrucao: number): number {
  return c.obra[0] >= 1 ? fimConstrucao + u * (1 - fimConstrucao) : u * fimConstrucao;
}

/** Passo do passeio por dentro (m/s), o mínimo quando o caminho é curto, e o recuo antes da porta (m) (ADR-32, ADR-33). */
export const VELOCIDADE_INTERNA = 1.0;
export const VELOCIDADE_INTERNA_MINIMA = 0.6;
export const ANTES_DA_PORTA_M = 1.5;
/** Onde o passeio do voo começa (`marcas.naPorta`): de frente para a porta, a esta distância dela (drone.ts). */
export const PASSEIO_DESDE_PORTA_M = 3.5;
/** Campo de visão no passeio por dentro, como em vídeo de imóvel. */
export const FOV_INTERNO = 75;

/**
 * Instante do voo (0 a 1) no passeio por dentro (ADR-32): começa de frente para a porta de entrada, `ANTES_DA_PORTA_M`
 * antes dela (o passeio do voo começa em `marcas.naPorta`, a `PASSEIO_DESDE_PORTA_M`; ADR-33), e anda `VELOCIDADE_INTERNA` × duração da cena, sem passar de `inicioVoltaFinal`; se o
 * caminho é curto, a velocidade cai até `VELOCIDADE_INTERNA_MINIMA` e, se ainda sobrar tempo, a câmera para no fim.
 * Fórmula: u_voo = início + u × metros da cena ÷ metros por unidade de u (= comprimento ÷ fimMovimento).
 */
export function trechoInterno(u: number, voo: Pick<Voo, "comprimento" | "marcas">, duracaoS: number): number {
  const { naPorta, inicioVoltaFinal, fimMovimento } = voo.marcas;
  const mPorU = voo.comprimento / Math.max(fimMovimento, 1e-6);
  const ini = Math.min(naPorta + (PASSEIO_DESDE_PORTA_M - ANTES_DA_PORTA_M) / mPorU, inicioVoltaFinal);
  const disponivel = (inicioVoltaFinal - ini) * mPorU;
  const metros = Math.min(VELOCIDADE_INTERNA * duracaoS, Math.max(disponivel, 0));
  const andado = Math.min(u * Math.max(metros, Math.min(VELOCIDADE_INTERNA_MINIMA * duracaoS, disponivel)), disponivel);
  return ini + andado / mPorU;
}

/** Câmera do voo numa cena de drone: o trecho certo do voo e, por dentro, o campo de visão mais aberto. */
export function quadroDoVooNaCena(c: Cena, u: number, voo: Voo, duracaoS: number): QuadroCamera {
  if (c.percurso === "interno" && voo.entrada) {
    const q = voo.quadro(trechoInterno(u, voo, duracaoS));
    return { ...q, fov: Math.max(q.fov, FOV_INTERNO) };
  }
  return voo.quadro(trechoDoVoo(c, u, voo.fimConstrucao));
}

/** Onde cada fala da planilha entra (ADR-30): no terreno (abertura e revelação), sobre a obra (recortada) ou só a voz. */
export type CenaDaFala = "terreno" | "sobre-obra" | "voz";

/** Duração da cena da marca, que fecha o vídeo depois da última fala. */
export const MARCA_S = 2.5;
/** Respiro depois da última voz (ADR-34): a câmera continua andando antes da marca; o vídeo não acaba de repente. */
export const RESPIRO_S = 1;

/** Um item do roteiro: uma voz (fala, narração ou obra em silêncio) ou uma foto (ADR-34). */
export type ItemRoteiro = { cena: CenaDaFala; duracaoS: number } | { cena: "foto"; duracaoS: number; foto: number; obra: number | null };
/**
 * Roteiro a partir das falas da planilha (ADR-30). As cenas seguem as falas, na ordem e com a duração de cada
 * uma, e a marca fecha o vídeo (`MARCA_S`). Total = soma das falas + `MARCA_S`.
 * - **terreno**: o quadro original dela (45 %) e a revelação, com a obra pronta subindo atrás dela (55 %);
 * - **sobre a obra** / **só a voz**: uma cena por fala, na câmera contínua (ADR-41), com a obra se formando ao
 *   longo de todas essas falas (do terreno à pronta), com ela recortada no canto ou fora do quadro;
 * - a última fala sobre a obra, se tiver 6 s ou mais, termina com o passeio do drone pela obra pronta (40 %, até 10 s).
 */
export function roteiroDasFalas(itens: ItemRoteiro[], opcoes: { passeio?: Passeio } = {}): { cenas: Cena[]; totalS: number } {
  const passeio = opcoes.passeio ?? "externo";
  const soma = itens.reduce((s, f) => s + Math.max(0, f.duracaoS), 0);
  if (!itens.length || !(soma > 0)) return { cenas: roteiroReels(false), totalS: 30 };
  // ADR-34: depois da última voz, o respiro (a câmera continua) e a marca
  const totalS = soma + RESPIRO_S + MARCA_S;
  // as fotos não contam no avanço da obra nem guardam o passeio: só as vozes
  const falas = itens.map((f) => (f.cena === "foto" ? { cena: "foto" as const, duracaoS: 0 } : f));
  const brutas: { tipo: TipoCena; s: number; camera: CameraCena; obra: [number, number]; pessoa: PessoaNaCena; extra?: Partial<Cena> }[] = [];
  // a última fala sobre a obra guarda o fim para o passeio pela obra pronta
  let ultimaObra = -1;
  falas.forEach((f, i) => (f.cena !== "terreno" && f.cena !== "foto" ? (ultimaObra = i) : undefined));
  const passeioS = ultimaObra >= 0 ? duracaoDoPasseio(passeio, falas[ultimaObra].duracaoS) : 0;
  const tempoObra = falas.reduce((s, f) => (f.cena === "terreno" ? s : s + f.duracaoS), 0) - passeioS;
  let progresso = 0;
  itens.forEach((item, i) => {
    // foto (ADR-34): a obra parada no dia da foto (ou onde o vídeo está), vista de cima, com a foto emoldurada
    if (item.cena === "foto") {
      const f = item.obra ?? progresso;
      if (item.duracaoS > 0) brutas.push({ tipo: "foto", s: item.duracaoS, camera: "isometrica", obra: [f, f], pessoa: "oculta", extra: { foto: item.foto } });
      return;
    }
    const f = item;
    const d = Math.max(0, f.duracaoS);
    if (!(d > 0)) return;
    if (f.cena === "terreno") {
      brutas.push({ tipo: "fala", s: d * 0.45, camera: "frontal", obra: [0, 0], pessoa: "cheia" });
      brutas.push({ tipo: "revelacao", s: d * 0.55, camera: "frontal", obra: [0, 1], pessoa: "cheia" });
      return;
    }
    const pessoa: PessoaNaCena = f.cena === "voz" ? "oculta" : "recortada";
    const montagemS = i === ultimaObra ? d - passeioS : d;
    if (montagemS > 0) {
      const ini = progresso, fim = tempoObra > 0 ? Math.min(1, progresso + montagemS / tempoObra) : 1;
      brutas.push({ tipo: "obra", s: montagemS, camera: "continua", obra: [ini, fim], pessoa });
      progresso = fim;
    }
    if (i === ultimaObra && passeioS > 0)
      for (const p of cenasDoPasseio(passeio)) brutas.push({ tipo: "obra", s: passeioS * p.parte, camera: p.camera, obra: [1, 1], pessoa, extra: { percurso: p.percurso, rotulo: p.rotulo } });
  });
  // respiro: a última cena dura mais RESPIRO_S (a câmera continua andando; a pessoa já não fala)
  if (brutas.length) brutas[brutas.length - 1].s += RESPIRO_S;
  brutas.push({ tipo: "marca", s: MARCA_S, camera: "frontal", obra: [1, 1], pessoa: "oculta" });
  return { cenas: brutas.map((b, i) => cena(`f${i}`, b.tipo, b.s / totalS, b.camera, b.obra, b.pessoa, b.extra)), totalS };
}
