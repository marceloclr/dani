// Vídeo de imagens (INC-19): apresentação de projeto feita só de imagens (renders de um PDF ou soltas), com
// títulos de ambiente, movimento lento de câmera e dissolução. Puro, sem DOM: o plano de tempos, a seleção
// pela duração e o recorte de cada imagem no tempo saem daqui e são testados no Node.

/** Imagem disponível para o vídeo. `titulo` vazio = continua o ambiente da imagem anterior. */
export interface ImagemDoVideo {
  largura: number;
  altura: number;
  titulo: string;
  marcada: boolean;
}

/** Tempo de cada imagem na tela (s): padrão, mínimo e máximo; dissolução entre imagens e título de ambiente. */
export const IMAGEM_PADRAO_S = 3, IMAGEM_MIN_S = 2.5, IMAGEM_MAX_S = 6, DISSOLVE_S = 0.6, TITULO_S = 2.4;
/** Durações prontas do vídeo (s). */
export const DURACOES_IMAGENS = [15, 20, 30, 40, 50, 60] as const;
/** Com narração: a voz entra depois da vinheta cheia; depois dela, respiro e a vinheta de encerramento (s). */
export const VOZ_INICIO_S = 1.2, RESPIRO_S = 1, ENCERRAMENTO_S = 2;
/** Zoom máximo do movimento e proporção a partir da qual a imagem é percorrida em vez de ampliada. */
export const ZOOM_MOVIMENTO = 1.08, PROPORCAO_VARREDURA = 1.25;

/** Duração do vídeo pela narração: vinheta, voz, respiro e encerramento. */
export const duracaoPelaNarracao = (vozS: number) => Math.round((VOZ_INICIO_S + vozS + RESPIRO_S + ENCERRAMENTO_S) * 10) / 10;

export interface Ambiente {
  /** Título digitado (ou sugerido); null = imagens antes do primeiro título. */
  titulo: string | null;
  /** Índices das imagens, na ordem. */
  indices: number[];
}

/** Ambientes na ordem das imagens: cada título abre um ambiente, que segue até o próximo título. */
export function ambientesDe(imgs: Pick<ImagemDoVideo, "titulo">[]): Ambiente[] {
  const out: Ambiente[] = [];
  imgs.forEach((im, i) => {
    const t = im.titulo.trim();
    if (t || !out.length) out.push({ titulo: t || null, indices: [] });
    out[out.length - 1].indices.push(i);
  });
  return out;
}

/** Quantas imagens cabem em `duracaoS` com `porImagemS` cada, contando a dissolução que as sobrepõe. */
export const imagensQueCabem = (duracaoS: number, porImagemS = IMAGEM_PADRAO_S) => Math.max(1, Math.floor((duracaoS - DISSOLVE_S) / (porImagemS - DISSOLVE_S)));

/** `n` posições espalhadas em `0..total-1`, incluindo a primeira (o começo do ambiente). */
function espalhar(total: number, n: number): number[] {
  if (n >= total) return Array.from({ length: total }, (_, i) => i);
  return Array.from({ length: n }, (_, k) => Math.floor((k * total) / n));
}

/**
 * Marca as imagens que cabem na duração (3 s cada), distribuídas entre os ambientes pelo tamanho de cada um,
 * com ao menos uma por ambiente quando couber. Devolve a nova marcação, na ordem das imagens.
 */
export function selecionarPelaDuracao(imgs: Pick<ImagemDoVideo, "titulo">[], duracaoS: number): boolean[] {
  return selecionarN(imgs, Math.min(imgs.length, imagensQueCabem(duracaoS)));
}

/** Marca `n` imagens espalhadas entre os ambientes (ao menos uma por ambiente quando couber). */
export function selecionarN(imgs: Pick<ImagemDoVideo, "titulo">[], n: number): boolean[] {
  const amb = ambientesDe(imgs);
  const cotas = amb.map(() => 0);
  if (n >= amb.length) {
    // uma por ambiente; o resto, proporcional às imagens que sobram em cada um (maior fração primeiro)
    cotas.fill(1);
    const sobra = amb.map((a) => a.indices.length - 1), totalSobra = sobra.reduce((s, x) => s + x, 0);
    const resto = n - amb.length;
    const ideal = sobra.map((x) => (totalSobra ? (resto * x) / totalSobra : 0));
    ideal.forEach((x, i) => (cotas[i] += Math.floor(x)));
    let falta = n - cotas.reduce((s, c) => s + c, 0);
    const ordem = ideal.map((x, i) => [x - Math.floor(x), i] as const).sort((p, q) => q[0] - p[0] || p[1] - q[1]);
    for (const [, i] of ordem) if (falta > 0 && cotas[i] < amb[i].indices.length) (cotas[i]++, falta--);
  } else {
    // menos imagens que ambientes: os ambientes espalhados, uma imagem de cada
    for (const i of espalhar(amb.length, n)) cotas[i] = 1;
  }
  const marcadas = imgs.map(() => false);
  amb.forEach((am, i) => espalhar(am.indices.length, cotas[i]).forEach((k) => (marcadas[am.indices[k]] = true)));
  return marcadas;
}

/** Recorte da imagem (em pixels da imagem) que vai para o quadro. */
export interface Recorte {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Movimento de uma imagem: o recorte no começo e no fim. */
export interface Movimento {
  de: Recorte;
  para: Recorte;
}

/** Maior recorte com a proporção do quadro dentro da imagem (a imagem cobre o quadro, sem faixas). */
export function recorteQueCobre(imgW: number, imgH: number, quadroW: number, quadroH: number): Recorte {
  const pq = quadroW / quadroH;
  const w = Math.min(imgW, imgH * pq), h = w / pq;
  return { x: (imgW - w) / 2, y: (imgH - h) / 2, w, h };
}

/**
 * Movimento da imagem `k` (alterna para não repetir):
 * - imagem bem mais larga (ou mais alta) que o quadro: percorre de um lado ao outro, com zoom leve;
 * - senão: aproxima (pares) ou afasta (ímpares) em 8 %, rumo a um terço da imagem que muda a cada imagem.
 */
export function movimentoDa(k: number, imgW: number, imgH: number, quadroW: number, quadroH: number): Movimento {
  const cobre = recorteQueCobre(imgW, imgH, quadroW, quadroH);
  const prop = imgW / imgH / (quadroW / quadroH);
  const fechado = (r: Recorte, fx: number, fy: number): Recorte => {
    const w = r.w / ZOOM_MOVIMENTO, h = r.h / ZOOM_MOVIMENTO;
    return { x: r.x + (r.w - w) * fx, y: r.y + (r.h - h) * fy, w, h };
  };
  if (prop >= PROPORCAO_VARREDURA || prop <= 1 / PROPORCAO_VARREDURA) {
    // varredura: o recorte (um pouco fechado) anda pela folga entre a imagem e o quadro
    const largo = prop >= 1;
    const r = fechado(cobre, 0.5, 0.5);
    const folga = largo ? imgW - r.w : imgH - r.h;
    const ini = folga * 0.08, fim = folga * 0.92;
    const [a, b] = k % 2 === 0 ? [ini, fim] : [fim, ini];
    const em = (p: number): Recorte => (largo ? { ...r, x: p } : { ...r, y: p });
    return { de: em(a), para: em(b) };
  }
  const alvos: [number, number][] = [[0.5, 0.4], [0.3, 0.45], [0.7, 0.45], [0.5, 0.6]];
  const [fx, fy] = alvos[k % alvos.length];
  const perto = fechado(cobre, fx, fy);
  return k % 2 === 0 ? { de: cobre, para: perto } : { de: perto, para: cobre };
}

/** Suavização do movimento (começa e termina devagar, sem parar). */
const suave = (u: number) => 0.15 * u + 0.85 * (0.5 - 0.5 * Math.cos(Math.PI * u));

/** Recorte no instante `u` (0 a 1) do movimento. */
export function recorteNoTempo(m: Movimento, u: number): Recorte {
  const s = suave(Math.min(1, Math.max(0, u)));
  const l = (a: number, b: number) => a + (b - a) * s;
  return { x: l(m.de.x, m.para.x), y: l(m.de.y, m.para.y), w: l(m.de.w, m.para.w), h: l(m.de.h, m.para.h) };
}

/**
 * Transição de entrada de uma imagem (0,6 s): dissolver, aproximar (entra com zoom leve), empurrar (a nova
 * empurra a anterior para o lado), varrer (faixa suave na diagonal) ou círculo (abre do centro).
 */
export type Transicao = "dissolver" | "aproximar" | "empurrar" | "varrer" | "circulo";
export type ModoTransicoes = "variadas" | "dissolver";
/** Rodízio: as suaves dentro de um ambiente (a cada três, uma marcante) e as marcantes na troca de ambiente. */
const SUAVES: Transicao[] = ["dissolver", "aproximar"], MARCANTES: Transicao[] = ["empurrar", "varrer", "circulo"];

/**
 * Transições de entrada das imagens, na ordem (a primeira não tem). Na troca de ambiente, as marcantes em
 * rodízio; dentro do ambiente, dissolver e aproximar, com uma marcante a cada três (vídeos sem títulos também
 * variam). O sentido de empurrar e varrer alterna.
 */
export function transicoesDoPlano(mudaAmbiente: boolean[], modo: ModoTransicoes = "variadas"): { transicao: Transicao; sentido: 1 | -1 }[] {
  let forte = 0, suave = 0, lado: 1 | -1 = 1;
  return mudaAmbiente.map((muda) => {
    if (modo === "dissolver") return { transicao: "dissolver" as const, sentido: 1 as const };
    let tr: Transicao;
    if (muda) tr = MARCANTES[forte++ % MARCANTES.length];
    else {
      const pos = suave++ % 3;
      tr = pos < 2 ? SUAVES[pos] : MARCANTES[forte++ % MARCANTES.length];
    }
    const sentido = lado;
    if (tr === "empurrar" || tr === "varrer") lado = (lado === 1 ? -1 : 1) as 1 | -1;
    return { transicao: tr, sentido };
  });
}

export interface ItemDoPlano {
  /** Índice na lista de imagens. */
  indice: number;
  /** Como a imagem entra (dissolver na primeira, que entra sobre a vinheta ou o voo). */
  transicao: Transicao;
  /** Sentido de empurrar e varrer: 1 = da direita para a esquerda; −1 = o contrário. */
  sentido: 1 | -1;
  ini: number;
  fim: number;
  /** Título que abre um ambiente nesta imagem (null = mesmo ambiente). */
  titulo: string | null;
  movimento: Movimento;
}

/** Voo do drone pela casa 3D (INC-20): no começo e/ou no fim do vídeo. */
export type ParteDoVoo = "abertura" | "encerramento";
export interface JanelaDoVoo {
  parte: ParteDoVoo;
  ini: number;
  fim: number;
}
/** Duração de cada voo (s): padrão, mínima e máxima. */
export const VOO_PADRAO_S = 8, VOO_MIN_S = 6, VOO_MAX_S = 12;

export interface PlanoDoVideo {
  duracaoS: number;
  itens: ItemDoPlano[];
  /** Janelas do voo 3D (vazio = só imagens). */
  voos: JanelaDoVoo[];
  /** Tempo de cada imagem (s), dissolução incluída. */
  porImagemS: number;
  /** Aviso quando as marcadas não cabem (ou sobram) na duração. */
  aviso: string | null;
  /** Marcadas que ficaram fora do vídeo por não caberem no tempo mínimo de cada imagem. */
  foraDoVideo: number;
}

/**
 * Plano do vídeo: as imagens marcadas, na ordem, dividem a duração em partes iguais, sobrepostas pela
 * dissolução. O título de ambiente vai na primeira imagem marcada de cada ambiente. Com voo (INC-20), o voo de
 * abertura ocupa o começo e o de encerramento o fim; as imagens dividem o que sobra, dissolvendo com eles.
 */
export function planoDoVideo(imgs: ImagemDoVideo[], duracaoS: number, quadroW: number, quadroH: number, voo: { aberturaS?: number; encerramentoS?: number } = {}, transicoes: ModoTransicoes = "variadas"): PlanoDoVideo {
  const lim = (s?: number) => (s && s > 0 ? Math.min(VOO_MAX_S, Math.max(VOO_MIN_S, s)) : 0);
  let ab = lim(voo.aberturaS), en = lim(voo.encerramentoS);
  // vídeo curto: os voos não passam de 40 % do tempo cada
  if (ab) ab = Math.min(ab, duracaoS * 0.4);
  if (en) en = Math.min(en, duracaoS * 0.4);
  const voos: JanelaDoVoo[] = [...(ab ? [{ parte: "abertura" as const, ini: 0, fim: ab }] : []), ...(en ? [{ parte: "encerramento" as const, ini: duracaoS - en, fim: duracaoS }] : [])];
  const ini0 = ab ? ab - DISSOLVE_S : 0, fimImagens = en ? duracaoS - en + DISSOLVE_S : duracaoS;
  const tempo = fimImagens - ini0;
  const fmt = (s: number) => s.toFixed(1).replace(".", ",").replace(/,0$/, "");
  // ambiente de cada imagem, valendo também para as não marcadas (o título pode estar numa desmarcada)
  const ambienteDe: number[] = [];
  ambientesDe(imgs).forEach((a, i) => a.indices.forEach((k) => (ambienteDe[k] = i)));
  const titulos = ambientesDe(imgs).map((a) => a.titulo);
  let marcadas = imgs.map((im, i) => (im.marcada ? i : -1)).filter((i) => i >= 0);
  if (!marcadas.length) return { duracaoS, itens: [], voos, porImagemS: 0, aviso: "Marque ao menos uma imagem.", foraDoVideo: 0 };
  const onde = voos.length ? `nos ${fmt(tempo)} s que sobram dos voos` : `em ${fmt(duracaoS)} s`;
  let aviso: string | null = null;
  // nunca abaixo do mínimo: imagens demais passariam rápido demais; entram as que cabem, espalhadas entre os ambientes
  const cabem = imagensQueCabem(tempo, IMAGEM_MIN_S);
  let foraDoVideo = 0;
  if (marcadas.length > cabem) {
    const sub = marcadas.map((i, k) => ({ titulo: k === 0 || ambienteDe[i] !== ambienteDe[marcadas[k - 1]] ? `a${ambienteDe[i]}` : "" }));
    const fica = selecionarN(sub, cabem);
    foraDoVideo = marcadas.length - cabem;
    aviso = `${marcadas.length} imagens marcadas não cabem ${onde} sem passar rápido demais: entram ${cabem} (${fmt(IMAGEM_MIN_S)} s cada, espalhadas entre os ambientes) e ${foraDoVideo} ficam de fora. Desmarque algumas, use "Escolher pela duração" ou aumente a duração.`;
    marcadas = marcadas.filter((_, k) => fica[k]);
  }
  const n = marcadas.length;
  // n·d − (n−1)·dissolução = tempo das imagens
  const bruto = (tempo + (n - 1) * DISSOLVE_S) / n;
  if (!aviso && bruto > IMAGEM_MAX_S) aviso = `Com ${n} imagens, cada uma fica ${bruto.toFixed(1).replace(".", ",")} s na tela: marque mais imagens para o vídeo ficar mais dinâmico.`;
  const d = Math.max(bruto, IMAGEM_MIN_S);
  let ambAnterior = -1;
  // a primeira entra dissolvendo (sobre a vinheta ou o voo); as outras seguem o rodízio
  const muda = marcadas.slice(1).map((indice, k) => ambienteDe[indice] !== ambienteDe[marcadas[k]]);
  const entradas = [{ transicao: "dissolver" as Transicao, sentido: 1 as const }, ...transicoesDoPlano(muda, transicoes)];
  const itens = marcadas.map((indice, k) => {
    const a = ambienteDe[indice];
    const titulo = a !== ambAnterior ? titulos[a] : null;
    ambAnterior = a;
    const ini = ini0 + k * (d - DISSOLVE_S);
    return { indice, ...entradas[k], ini, fim: Math.min(fimImagens, ini + d), titulo, movimento: movimentoDa(k, imgs[indice].largura, imgs[indice].altura, quadroW, quadroH) };
  });
  return { duracaoS, itens, voos, porImagemS: d, aviso, foraDoVideo };
}

/** O que desenhar no segundo `t`: a imagem de baixo e, durante a dissolução, a de cima com sua opacidade. */
export function camadasNoTempo(p: PlanoDoVideo, t: number): { item: ItemDoPlano; u: number; opacidade: number; entrada: number }[] {
  const out: { item: ItemDoPlano; u: number; opacidade: number; entrada: number }[] = [];
  p.itens.forEach((it, k) => {
    if (t < it.ini || t > it.fim + 1e-9) return;
    const u = (t - it.ini) / (it.fim - it.ini || 1);
    // a primeira entra inteira, a não ser que dissolva sobre o voo de abertura
    const opacidade = k === 0 && !p.voos.some((v) => v.parte === "abertura") ? 1 : Math.min(1, (t - it.ini) / DISSOLVE_S);
    // entrada: quanto da transição já andou (1 = imagem inteira na tela)
    out.push({ item: it, u, opacidade, entrada: opacidade });
  });
  // a última imagem segura o quadro até o fim (arredondamentos), quando não há voo de encerramento
  const ult = p.itens[p.itens.length - 1];
  if (!out.length && ult && t >= ult.fim && !p.voos.some((v) => v.parte === "encerramento")) out.push({ item: ult, u: 1, opacidade: 1, entrada: 1 });
  return out;
}

/**
 * Voo no segundo `t` (INC-20): a abertura vai por baixo das imagens (a primeira dissolve sobre ela); o
 * encerramento vai por cima, entrando em 0,6 s sobre a última imagem.
 */
export function vooNoTempo(p: PlanoDoVideo, t: number): { parte: ParteDoVoo; u: number; opacidade: number; porCima: boolean } | null {
  for (const v of p.voos) {
    if (t < v.ini || t > v.fim + 1e-9) continue;
    const u = Math.min(1, (t - v.ini) / (v.fim - v.ini || 1));
    return v.parte === "abertura" ? { parte: v.parte, u, opacidade: 1, porCima: false } : { parte: v.parte, u, opacidade: Math.min(1, (t - v.ini) / DISSOLVE_S), porCima: true };
  }
  return null;
}

/** Capa: o título do vídeo sobre a primeira imagem, depois da vinheta (s). */
export const CAPA = { ini: VOZ_INICIO_S + 0.2, dur: 3 };

/**
 * Título de ambiente no segundo `t`: entra e sai em 0,4 s. O da primeira imagem espera a vinheta clarear
 * (ou a capa terminar, com `inicioPrimeiroS`).
 */
export function tituloNoTempo(p: PlanoDoVideo, t: number, inicioPrimeiroS = VOZ_INICIO_S + 0.4): { texto: string; opacidade: number; u: number } | null {
  for (const [k, it] of p.itens.entries()) {
    if (!it.titulo) continue;
    // o primeiro título espera a vinheta (ou a capa) e, depois de um voo de abertura, a primeira imagem entrar
    const ini = k === 0 ? Math.max(inicioPrimeiroS, it.ini + DISSOLVE_S * 0.5) : it.ini + DISSOLVE_S * 0.5;
    // o primeiro ambiente que acaba antes do seu título entrar (capa longa) fica sem título: não rotula outro
    const proximo = p.itens.slice(k + 1).find((x) => x.titulo);
    if (k === 0 && proximo && ini + 0.8 > proximo.ini) continue;
    // o título sai antes da imagem seguinte entrar: não rotula outro ambiente (imagens curtas, de 2,5 s)
    const seguinte = p.itens[k + 1];
    const dur = Math.max(0.8, Math.min(TITULO_S, (seguinte ? seguinte.ini + 0.15 : Infinity) - ini));
    if (t < ini || t > ini + dur) continue;
    const dt = t - ini, borda = 0.4;
    const opacidade = Math.min(1, dt / borda, (dur - dt) / borda);
    return { texto: it.titulo, opacidade: Math.max(0, opacidade), u: dt / dur };
  }
  return null;
}

/** Tempo no formato do roteiro: 0:07,2. */
export function tempoDoRoteiro(s: number): string {
  const d = Math.round(Math.max(0, s) * 10) / 10;
  const min = Math.floor(d / 60), resto = d - min * 60;
  return `${min}:${resto.toFixed(1).padStart(4, "0").replace(".", ",")}`;
}

/**
 * Roteiro de tempos para gravar a narração (INC-19): a janela da voz, cada ambiente com o seu tempo e cada
 * imagem. Texto simples, para abrir no celular ou imprimir.
 */
export function roteiroDeTempos(p: PlanoDoVideo, nomes: string[], titulo: string, dimensoes: { largura: number; altura: number }): string {
  const vozAte = Math.max(VOZ_INICIO_S, p.duracaoS - RESPIRO_S - ENCERRAMENTO_S);
  const linhas = [
    `ROTEIRO DE NARRAÇÃO${titulo.trim() ? ` — ${titulo.trim()}` : ""}`,
    "",
    `Vídeo: ${tempoDoRoteiro(p.duracaoS)} · ${p.itens.length} imagens · ${dimensoes.largura} × ${dimensoes.altura}`,
    `Fale entre ${tempoDoRoteiro(VOZ_INICIO_S)} e ${tempoDoRoteiro(vozAte)} (${(vozAte - VOZ_INICIO_S).toFixed(1).replace(".", ",")} s de voz).`,
    "Antes: a vinheta da marca. Depois: um respiro e o encerramento com a marca.",
    "Com a narração enviada, o vídeo passa a durar a fala e as imagens se ajustam a ela.",
    "",
    "AMBIENTES",
  ];
  // ambientes: grupos de imagens seguidas, abertos por um título (a primeira imagem abre o primeiro grupo)
  const grupos: { titulo: string; ini: number; fim: number; n: number }[] = [];
  for (const it of p.itens) {
    if (it.titulo || !grupos.length) grupos.push({ titulo: it.titulo ?? "Abertura", ini: it.ini, fim: it.fim, n: 0 });
    const g = grupos[grupos.length - 1];
    g.fim = it.fim;
    g.n++;
  }
  const voo = (parte: ParteDoVoo) => p.voos.filter((v) => v.parte === parte).map((v) => `${tempoDoRoteiro(v.ini)} – ${tempoDoRoteiro(v.fim)}  Voo do drone pela casa (${parte})`);
  linhas.push(...voo("abertura"));
  for (const g of grupos) linhas.push(`${tempoDoRoteiro(g.ini)} – ${tempoDoRoteiro(g.fim)}  ${g.titulo} (${g.n} ${g.n > 1 ? "imagens" : "imagem"})`);
  linhas.push(...voo("encerramento"));
  linhas.push("", "IMAGENS");
  p.itens.forEach((it, k) => linhas.push(`${String(k + 1).padStart(2, " ")}. ${tempoDoRoteiro(it.ini)} – ${tempoDoRoteiro(it.fim)}  ${nomes[it.indice] ?? ""}`));
  return linhas.join("\n") + "\n";
}