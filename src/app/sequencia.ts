// Sequência do vídeo (ADR-34): a ordem dos vídeos de fala, das narrações e das fotos, e onde entra cada trilha
// sonora. O usuário ordena no passo Conferir (ou na aba Sequência da planilha); sem ordem salva, vale a padrão.
// Puro, sem DOM: testado no Node.

export type TipoItem = "fala" | "narracao" | "foto" | "obra";

export interface ItemSequencia {
  /** "voz:<arquivo>", "foto:<arquivo>" ou "obra" (minúsculas). */
  id: string;
  tipo: TipoItem;
  /** Nome do arquivo, como enviado. */
  nome: string;
  duracaoS: number;
  /** Foto: avanço da obra (0 a 1) no dia dela; null = sem data. */
  obra?: number | null;
}

/** Onde a trilha entra: no início, antes de um item (id) ou no final (o último item, até a marca). */
export type EntradaTrilha = "inicio" | "final" | string;

export interface TrilhaSequencia {
  nome: string;
  entra: EntradaTrilha;
  /** 0 a 100. */
  volume: number;
}

/**
 * Fotos que combinam com a voz (vídeo da obra): cada foto soma o seu tempo ao vídeo; para não quebrar o ritmo da
 * obra, as fotos ficam em até cerca de 20 % do tempo de voz (falas e narrações). Sem voz, até 3.
 */
export function fotosRecomendadas(vozS: number, porFotoS = FOTO_PADRAO_S): { ideal: number; texto: string } {
  const ideal = vozS > 0 ? Math.max(1, Math.round((0.2 * vozS) / porFotoS)) : 3;
  const s = (x: number) => x.toFixed(1).replace(".", ",").replace(/,0$/, "");
  const texto = vozS > 0
    ? `Com ${s(vozS)} s de voz, o ideal são até ${ideal} foto${ideal > 1 ? "s" : ""}: cada uma soma ${s(porFotoS)} s ao vídeo, e mais que isso (cerca de 20 % do tempo de voz) quebra o ritmo da obra.`
    : "Sem voz, o ideal são até 3 fotos: cada uma soma 3 s ao vídeo.";
  return { ideal, texto };
}

/** Duração padrão, mínima e máxima de uma foto no vídeo (s). */
export const FOTO_PADRAO_S = 3, FOTO_MIN_S = 2, FOTO_MAX_S = 6;
export const VOLUME_PADRAO = 70;

export const idVoz = (nome: string) => `voz:${nome.toLowerCase()}`;
export const idFoto = (nome: string) => `foto:${nome.toLowerCase()}`;
export const ehVoz = (i: ItemSequencia) => i.tipo === "fala" || i.tipo === "narracao" || i.tipo === "obra";

/**
 * Ordem padrão: as vozes na ordem recebida; cada foto, pela data, entra depois da voz em que o avanço
 * acumulado (tempo de voz ÷ total) passa do avanço da obra no dia dela; fotos sem data vão para o fim.
 */
export function sequenciaPadrao(vozes: ItemSequencia[], fotos: ItemSequencia[]): ItemSequencia[] {
  const total = vozes.reduce((s, v) => s + v.duracaoS, 0);
  const datadas = fotos.filter((f) => f.obra !== null && f.obra !== undefined).sort((a, b) => (a.obra as number) - (b.obra as number));
  const semData = fotos.filter((f) => f.obra === null || f.obra === undefined);
  const out: ItemSequencia[] = [];
  let acum = 0, k = 0;
  // fotos de antes da primeira voz (obra no começo) entram antes dela
  for (const v of vozes) {
    while (k < datadas.length && total > 0 && (datadas[k].obra as number) <= acum / total + 1e-9) out.push(datadas[k++]);
    out.push(v);
    acum += v.duracaoS;
  }
  while (k < datadas.length) out.push(datadas[k++]);
  return [...out, ...semData];
}

/**
 * Aplica a ordem salva (ids) aos itens disponíveis: os salvos que existem, na ordem salva; os novos entram
 * na posição que teriam na ordem padrão (logo depois do vizinho anterior que já está na lista).
 */
export function aplicarOrdem(padrao: ItemSequencia[], salva: string[] | undefined): ItemSequencia[] {
  if (!salva?.length) return padrao;
  const porId = new Map(padrao.map((i) => [i.id, i]));
  const out = salva.filter((id) => porId.has(id)).map((id) => porId.get(id)!);
  const presentes = new Set(out.map((i) => i.id));
  padrao.forEach((item, k) => {
    if (presentes.has(item.id)) return;
    let pos = 0;
    for (let j = k - 1; j >= 0; j--) {
      const idx = out.findIndex((x) => x.id === padrao[j].id);
      if (idx >= 0) {
        pos = idx + 1;
        break;
      }
    }
    out.splice(pos, 0, item);
    presentes.add(item.id);
  });
  return out;
}

/** Move o item `id` para a posição `para` (0 = primeiro). Devolve a nova lista de ids. */
export function mover(ids: string[], id: string, para: number): string[] {
  const de = ids.indexOf(id);
  if (de < 0) return ids;
  const l = ids.filter((x) => x !== id);
  l.splice(Math.min(Math.max(para, 0), l.length), 0, id);
  return l;
}

/**
 * Entrada padrão das trilhas: uma só = no início, até o fim; duas = início e final; mais = início, as do meio
 * espalhadas antes das vozes e a última no final.
 */
export function trilhasPadrao(nomes: string[], itens: ItemSequencia[]): TrilhaSequencia[] {
  const vozes = itens.filter(ehVoz);
  return nomes.map((nome, k) => {
    const n = nomes.length;
    let entra: EntradaTrilha = "inicio";
    if (n > 1 && k === n - 1) entra = "final";
    else if (k > 0 && vozes.length > 1) entra = vozes[Math.min(vozes.length - 1, Math.max(1, Math.round((k * vozes.length) / (n - 1))))].id;
    else if (k > 0) entra = "final";
    return { nome, entra, volume: VOLUME_PADRAO };
  });
}

/** Aplica a configuração salva das trilhas (pelo nome) às trilhas recebidas; as novas ganham a entrada padrão. */
export function aplicarTrilhas(nomes: string[], itens: ItemSequencia[], salvas: TrilhaSequencia[] | undefined): TrilhaSequencia[] {
  const padrao = trilhasPadrao(nomes, itens);
  const ids = new Set(itens.map((i) => i.id));
  return padrao.map((p) => {
    const s = salvas?.find((x) => x.nome.toLowerCase() === p.nome.toLowerCase());
    if (!s) return p;
    // a entrada salva aponta para um item que saiu: volta à padrão
    const entra = s.entra === "inicio" || s.entra === "final" || ids.has(s.entra) ? s.entra : p.entra;
    return { nome: p.nome, entra, volume: Math.min(100, Math.max(0, s.volume)) };
  });
}

/** Começo de cada item no vídeo (s), na ordem. */
export function iniciosDosItens(itens: ItemSequencia[]): number[] {
  let t = 0;
  return itens.map((i) => {
    const ini = t;
    t += i.duracaoS;
    return ini;
  });
}

/** A trilha "no final" entra este tanto antes do fim dos itens (s). */
export const FINAL_ANTES_S = 8;
/** Duas trilhas mais próximas que isto (s) se atropelariam. */
export const TRILHAS_MIN_S = 2;

/** Segundo em que uma trilha começa: início = 0; antes de um item = começo dele; final = `FINAL_ANTES_S` antes do fim dos itens. */
export function inicioDaTrilha(entra: EntradaTrilha, itens: ItemSequencia[]): number {
  const ini = iniciosDosItens(itens);
  if (entra === "inicio" || !itens.length) return 0;
  const fim = ini[ini.length - 1] + itens[itens.length - 1].duracaoS;
  if (entra === "final") return Math.max(0, fim - FINAL_ANTES_S);
  const k = itens.findIndex((i) => i.id === entra);
  return k >= 0 ? ini[k] : 0;
}

/**
 * Segundos de entrada de todas as trilhas, sem atropelo: uma trilha que cairia a menos de `TRILHAS_MIN_S` da anterior
 * (vídeo curto: "início" e "final" no mesmo ponto) vai para o meio do caminho entre a anterior e o fim dos itens.
 */
export function iniciosDasTrilhas(trilhas: TrilhaSequencia[], itens: ItemSequencia[]): number[] {
  const fim = itens.reduce((s, i) => s + i.duracaoS, 0);
  const brutos = trilhas.map((t, k) => ({ k, t: inicioDaTrilha(t.entra, itens) }));
  const ordem = [...brutos].sort((a, b) => a.t - b.t || a.k - b.k);
  const out = new Array<number>(trilhas.length);
  let anterior = -Infinity;
  for (const b of ordem) {
    let t = b.t;
    if (t - anterior < TRILHAS_MIN_S && Number.isFinite(anterior)) t = Math.max(t, anterior + Math.max(0, fim - anterior) / 2);
    out[b.k] = t;
    anterior = t;
  }
  return out;
}
