// Legendas animadas do vídeo de imagens (INC-21): o texto da narração, colado pela Daniella, aparece palavra
// por palavra no tempo da voz, em grupos curtos, com a palavra mais forte de cada grupo destacada. Sem IA: os
// trechos de fala saem da energia do áudio e as palavras dividem o tempo de fala pelas sílabas. Puro, sem DOM.

/** Palavra do texto, já sem os asteriscos. */
export interface PalavraDoTexto {
  texto: string;
  /** Marcada com *asterisco* no texto. */
  marcada: boolean;
  /** Sílabas aproximadas (grupos de vogais; números pelo tamanho). */
  silabas: number;
  /** Pontuação depois da palavra: 0 nenhuma, 1 vírgula (ou ; :), 2 fim de frase (. ! ? …). */
  pausa: 0 | 1 | 2;
}

/** Palavra no tempo (s), já com o destaque decidido. */
export interface PalavraNoTempo {
  texto: string;
  destaque: boolean;
  ini: number;
  fim: number;
}

export interface GrupoDaLegenda {
  palavras: PalavraNoTempo[];
  ini: number;
  fim: number;
}

/** Janela da energia (s), pausa mínima entre trechos de fala (s) e trecho mínimo (s; menos que isso é estalo). */
export const JANELA_S = 0.02, PAUSA_MIN_S = 0.25, TRECHO_MIN_S = 0.2;
/** Pop da palavra que entra (s), sobra do grupo depois da última palavra (s) e palavras por grupo. */
export const POP_S = 0.12, SOBRA_S = 0.4, GRUPO_MIN = 2, GRUPO_MAX = 4, GRUPO_CARACTERES = 22;
/** Atraso manual (s): de −1 a +1. */
export const ATRASO_MAX_S = 1;
/** Peso de uma pausa do texto, em sílabas: vírgula e fim de frase. */
const PESO_PAUSA = [0, 0.6, 1.2] as const;

const VOGAIS = /[aeiouyáéíóúâêôãõàü]+/gi;
/** Palavras que não se destacam sozinhas. */
const FRACAS = new Set(
  "a o as os um uma uns umas de da do das dos dum duma em na no nas nos num numa por pela pelo pelas pelos para pra pro com sem sob sobre entre até que se e é ou mas mais muito muita tão já também né aí lá cá ele ela eles elas eu nós você vocês isso isto esse essa esses essas este esta aquele aquela aqui ali onde como quando foi era ser ter tinha tem bem toda todo todas todos sua seu suas seus nossa nosso".split(" "),
);

const silabasDe = (p: string): number => {
  const digitos = p.replace(/\D/g, "").length;
  if (digitos) return Math.max(1, Math.round(digitos * 1.5));
  return Math.max(1, (p.match(VOGAIS) ?? []).length);
};

/**
 * Palavras do texto, na ordem. `*palavra*` (ou `*várias palavras*`) marca o destaque; os asteriscos somem.
 */
export function palavrasDoTexto(texto: string): PalavraDoTexto[] {
  const out: PalavraDoTexto[] = [];
  let aberto = false;
  for (const bruto of texto.split(/\s+/)) {
    if (!bruto) continue;
    const abre = bruto.startsWith("*");
    let t = bruto.replace(/^\*+/, "");
    // o asterisco de fechar pode vir antes da pontuação: *obra*, ou *obra,*
    const fecha = /\*+[.,;:!?…"”)]*$/.test(t);
    t = t.replace(/\*+/g, "");
    const marcada = aberto || abre;
    if (abre) aberto = true;
    if (fecha) aberto = false;
    if (!/[\p{L}\p{N}]/u.test(t)) {
      // pontuação solta ("—", "...") só reforça a pausa da palavra anterior
      if (out.length && /[.!?…]/.test(t)) out[out.length - 1].pausa = 2;
      continue;
    }
    const pausa = /[.!?…]["”)]*$/.test(t) ? 2 : /[,;:—–]["”)]*$/.test(t) ? 1 : 0;
    out.push({ texto: t, marcada, silabas: silabasDe(t), pausa });
  }
  return out;
}

/** Texto com algum *asterisco*: o destaque passa a ser só o marcado. */
export const temMarcacao = (texto: string) => /\*[^*\s][^*]*\*/.test(texto);

const percentil = (ordenados: number[], p: number) => ordenados[Math.min(ordenados.length - 1, Math.max(0, Math.floor(p * (ordenados.length - 1))))];

/**
 * Trechos de fala de um áudio mono: energia em janelas de 20 ms; o limiar fica entre o fundo (percentil 10)
 * e a voz (percentil 90). Pausas menores que 0,25 s não separam trechos. Sem contraste (música por baixo,
 * áudio comprimido), devolve um trecho só, do primeiro ao último som.
 */
export function trechosDeFala(amostras: Float32Array, taxa: number): [number, number][] {
  const n = Math.max(1, Math.round(taxa * JANELA_S));
  const db: number[] = [];
  for (let i = 0; i < amostras.length; i += n) {
    let s = 0;
    const fim = Math.min(amostras.length, i + n);
    for (let k = i; k < fim; k++) s += amostras[k] * amostras[k];
    db.push(10 * Math.log10(s / Math.max(1, fim - i) + 1e-10));
  }
  if (!db.length) return [];
  const ord = [...db].sort((a, b) => a - b);
  const fundo = percentil(ord, 0.1), voz = percentil(ord, 0.9);
  const passo = n / taxa;
  const dur = amostras.length / taxa;
  // sem som algum
  if (voz < -60) return [];
  const contraste = voz - fundo >= 10;
  const limiar = contraste ? fundo + 0.35 * (voz - fundo) : Math.max(fundo - 1, -60);
  const brutos: [number, number][] = [];
  let ini = -1;
  db.forEach((v, k) => {
    if (v > limiar && ini < 0) ini = k;
    if (v <= limiar && ini >= 0) {
      brutos.push([ini * passo, k * passo]);
      ini = -1;
    }
  });
  if (ini >= 0) brutos.push([ini * passo, dur]);
  // junta os separados por pausas curtas e descarta estalos
  const juntos: [number, number][] = [];
  for (const t of brutos) {
    const ult = juntos[juntos.length - 1];
    if (ult && t[0] - ult[1] < PAUSA_MIN_S) ult[1] = t[1];
    else juntos.push([t[0], t[1]]);
  }
  const trechos = juntos.filter(([a, b]) => b - a >= TRECHO_MIN_S).map(([a, b]) => [Math.round(a * 1000) / 1000, Math.round(Math.min(dur, b) * 1000) / 1000] as [number, number]);
  if (!contraste && trechos.length) return [[trechos[0][0], trechos[trechos.length - 1][1]]];
  return trechos;
}

/** Relógio da fala: o tempo de fala (sem as pausas) e o caminho de volta para o tempo real. */
function relogioDaFala(trechos: [number, number][]) {
  const acum: number[] = [0];
  for (const [a, b] of trechos) acum.push(acum[acum.length - 1] + (b - a));
  const total = acum[acum.length - 1];
  /** Tempo real do instante `s` da fala. Numa fronteira, `fim` fica no fim do trecho e `ini` no começo do seguinte. */
  const real = (s: number, lado: "ini" | "fim"): number => {
    const x = Math.min(total, Math.max(0, s));
    for (let j = 0; j < trechos.length; j++) {
      const a = acum[j], b = acum[j + 1];
      if (x < b - 1e-9 || (x <= b + 1e-9 && (lado === "fim" || j === trechos.length - 1))) return trechos[j][0] + Math.max(0, x - a);
    }
    return trechos[trechos.length - 1][1];
  };
  return { acum, total, real };
}

/**
 * Custos do casamento das pausas (ajustados no Reels da Daniella, 09/10/2026: erro médio de 0,82 s para 0,5 s):
 * pausa da voz sem par no texto; pausa casada depois de vírgula, antes de conjunção ("que", "e"...) ou no meio
 * da frase; e o peso do ritmo (o quanto as sílabas por segundo podem variar entre duas pausas).
 */
const CUSTO_PAUSA_SOLTA = 1, CUSTO_VIRGULA = 0.15, CUSTO_CONJUNCAO = 0.4, CUSTO_SEM_PONTUACAO = 0.8, PESO_RITMO = 0.4;
/** Palavras antes das quais a fala costuma parar. */
const CONJUNCOES = new Set("que e mas então porque pra para onde como quando ou nem".split(" "));

/**
 * Casa as pausas da voz (fronteiras entre trechos de fala) com intervalos entre palavras, por programação
 * dinâmica, em ordem. Entre duas âncoras seguidas, o ritmo (sílabas por segundo de fala) deve ficar perto do
 * ritmo médio; pausas casadas depois de ponto custam nada, de vírgula pouco, e no meio da frase mais. Pausas
 * da voz podem ficar sem par (respiração). Devolve [fronteira, palavra antes da pausa], em ordem.
 */
function casarPausas(palavras: PalavraDoTexto[], fala: number[], fim: number[], acum: number[]): [number, number][] {
  const N = palavras.length, J = acum.length - 1;
  if (J < 2 || N < 2) return [];
  const total = acum[J], peso = fim[N - 1];
  const r0 = peso / total;
  const pen = (g: number) => (palavras[g].pausa === 2 ? 0 : palavras[g].pausa === 1 ? CUSTO_VIRGULA : CONJUNCOES.has(semPontuacao(palavras[g + 1].texto)) ? CUSTO_CONJUNCAO : CUSTO_SEM_PONTUACAO);
  // trecho entre a âncora (b1, g1) e a (b2, g2); g = −1 é o começo, b = 0 o começo e b = J o fim
  const trecho = (b1: number, g1: number, b2: number, g2: number) => {
    const w = (g2 === N - 1 ? peso : fala[g2]) - (g1 < 0 ? 0 : fim[g1]), d = acum[b2] - acum[b1];
    if (w <= 0 || d <= 0) return Infinity;
    const l = Math.log(w / d / r0);
    return PESO_RITMO * l * l * Math.sqrt(w);
  };
  // custo[b][g + 1]: melhor caminho que termina casando a fronteira b com o intervalo depois da palavra g
  const custo = Array.from({ length: J + 1 }, () => new Float64Array(N + 1).fill(Infinity));
  const veio = Array.from({ length: J + 1 }, () => new Int32Array(N + 1).fill(-1));
  custo[0][0] = 0;
  const ligar = (b: number, g: number, extra: number) => {
    let melhor = Infinity, de = -1;
    for (let b1 = 0; b1 < b; b1++)
      for (let g1 = -1; g1 < g; g1++) {
        const c0 = custo[b1][g1 + 1];
        if (c0 === Infinity) continue;
        const c = c0 + (b - b1 - 1) * CUSTO_PAUSA_SOLTA + trecho(b1, g1, b, g);
        if (c < melhor) (melhor = c), (de = b1 * (N + 1) + g1 + 1);
      }
    custo[b][g + 1] = melhor + extra;
    veio[b][g + 1] = de;
  };
  for (let b = 1; b < J; b++) for (let g = 0; g < N - 1; g++) ligar(b, g, pen(g));
  ligar(J, N - 1, 0);
  const out: [number, number][] = [];
  let at = veio[J][N];
  while (at > 0) {
    const b = Math.floor(at / (N + 1)), g = (at % (N + 1)) - 1;
    out.unshift([b, g]);
    at = veio[b][g + 1];
  }
  return out;
}

/**
 * Tempos das palavras na voz (s, a partir do começo do áudio). As pausas da voz são casadas com intervalos
 * entre palavras (de preferência na pontuação), e entre elas as palavras dividem o tempo de fala pelas sílabas
 * (as pausas do texto pesam um pouco). Sem trechos, a fala ocupa a voz inteira.
 */
export function sincronizar(palavras: PalavraDoTexto[], trechos: [number, number][], duracaoVozS: number): { ini: number; fim: number }[] {
  if (!palavras.length) return [];
  const tr = trechos.length ? trechos : [[0, duracaoVozS] as [number, number]];
  const rel = relogioDaFala(tr);
  // posição de cada palavra no peso total: começo, fim da fala da palavra e fim com a pausa
  const ini: number[] = [], fala: number[] = [], fim: number[] = [];
  let acc = 0;
  palavras.forEach((p, k) => {
    ini.push(acc);
    acc += p.silabas;
    fala.push(acc);
    if (k < palavras.length - 1) acc += PESO_PAUSA[p.pausa];
    fim.push(acc);
  });
  const peso = acc;
  // âncoras (peso → tempo de fala): o começo, o fim e cada pausa da voz casada com um intervalo entre palavras
  // A palavra antes da pausa termina nela e a seguinte começa depois: o peso da pausa do texto ali some.
  const ancoras: [number, number][] = [[0, 0]];
  for (const [b, g] of casarPausas(palavras, fala, fim, rel.acum)) ancoras.push([fala[g], rel.acum[b]], [fim[g], rel.acum[b]]);
  ancoras.push([peso, rel.total]);
  // peso → tempo de fala, linear entre as âncoras
  const naFala = (w: number): number => {
    for (let j = 1; j < ancoras.length; j++) {
      const [w0, s0] = ancoras[j - 1], [w1, s1] = ancoras[j];
      if (w <= w1 + 1e-9) return s0 + ((w - w0) / (w1 - w0 || 1)) * (s1 - s0);
    }
    return rel.total;
  };
  return palavras.map((_, k) => {
    const a = rel.real(naFala(ini[k]), "ini");
    const b = rel.real(naFala(fala[k]), "fim");
    return { ini: round(a), fim: round(Math.max(a, b)) };
  });
}

const round = (x: number) => Math.round(x * 1000) / 1000;
const semPontuacao = (t: string) => t.replace(/[^\p{L}\p{N}-]/gu, "").toLocaleLowerCase("pt-BR");

/**
 * Grupos de 2 a 4 palavras (até 22 letras), quebrando depois da pontuação. Em cada grupo, destaca a palavra
 * mais longa que não seja fraca (artigos, preposições, "né"...), com 4 letras ou mais; com `marcacao`, só as
 * palavras marcadas. O grupo fica até o seguinte começar ou 0,4 s depois da última palavra.
 */
export function gruposDaLegenda(palavras: PalavraDoTexto[], tempos: { ini: number; fim: number }[], marcacao: boolean): GrupoDaLegenda[] {
  const grupos: { k: number[] }[] = [];
  let atual: number[] = [];
  const letras = (ks: number[]) => ks.reduce((s, k) => s + palavras[k].texto.length, 0) + Math.max(0, ks.length - 1);
  palavras.forEach((p, k) => {
    if (atual.length >= GRUPO_MIN && letras([...atual, k]) > GRUPO_CARACTERES) (grupos.push({ k: atual }), (atual = []));
    atual.push(k);
    // fecha no limite de palavras e depois da pontuação (fim de frase fecha até um grupo de uma palavra)
    if (atual.length >= GRUPO_MAX || (p.pausa && (atual.length >= GRUPO_MIN || p.pausa === 2))) {
      grupos.push({ k: atual });
      atual = [];
    }
  });
  if (atual.length) grupos.push({ k: atual });
  return grupos.map((g, j) => {
    let destaque = new Set<number>();
    if (marcacao) destaque = new Set(g.k.filter((k) => palavras[k].marcada));
    else {
      const candidatas = g.k.filter((k) => !FRACAS.has(semPontuacao(palavras[k].texto)) && semPontuacao(palavras[k].texto).length >= 4);
      if (candidatas.length) destaque.add(candidatas.reduce((m, k) => (semPontuacao(palavras[k].texto).length > semPontuacao(palavras[m].texto).length ? k : m)));
    }
    const ps = g.k.map((k) => ({ texto: palavras[k].texto, destaque: destaque.has(k), ini: tempos[k].ini, fim: tempos[k].fim }));
    const proximo = grupos[j + 1];
    const ini = ps[0].ini;
    const fim = Math.max(ps[ps.length - 1].fim, Math.min(proximo ? tempos[proximo.k[0]].ini : Infinity, ps[ps.length - 1].fim + SOBRA_S));
    return { palavras: ps, ini, fim: round(fim) };
  });
}

/**
 * Legendas no relógio do vídeo: o texto, os trechos de fala e a duração da voz, que começa em `inicioS`;
 * `atrasoS` (−1 a +1) corrige à mão.
 */
export function legendasDoVideo(texto: string, trechos: [number, number][], duracaoVozS: number, inicioS: number, atrasoS = 0): GrupoDaLegenda[] {
  const palavras = palavrasDoTexto(texto);
  if (!palavras.length) return [];
  const desloc = inicioS + Math.min(ATRASO_MAX_S, Math.max(-ATRASO_MAX_S, atrasoS));
  const tempos = sincronizar(palavras, trechos, duracaoVozS).map((t) => ({ ini: round(t.ini + desloc), fim: round(t.fim + desloc) }));
  return gruposDaLegenda(palavras, tempos, temMarcacao(texto));
}

/** O que mostrar no segundo `t`: o grupo e quanto cada palavra já entrou (0 = ainda não, 1 = inteira). */
export function legendaNoTempo(grupos: GrupoDaLegenda[], t: number): { grupo: GrupoDaLegenda; entradas: number[] } | null {
  const g = grupos.find((x) => t >= x.ini && t < x.fim);
  if (!g) return null;
  return { grupo: g, entradas: g.palavras.map((p) => Math.min(1, Math.max(0, (t - p.ini) / POP_S))) };
}
