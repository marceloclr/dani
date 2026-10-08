// Leitura da planilha única (ADR-29). O núcleo (interpretarAbas) é puro e recebe as linhas de cada aba como o
// SheetJS as entrega (sheet_to_json, raw); lerPlanilha abre o .xlsx. Problemas não travam a carga: cada um diz
// a aba e a linha, e só a falta do cronograma impede o vídeo.
import { MUNICIPIOS, OUTRO_MUNICIPIO } from "../fourd/feriados";
import { formatarISO, lerData } from "../fourd/tempo";
import { ehColunaData, importarLinhas } from "../importers/cronograma";
import { serialParaDia } from "../importers/xlsx";
import { NOME_LUZ, type Luz } from "../rendering/iluminacao";
import type { AcaoTarefa, Excecao } from "../types";
import type { ParametrosCasa } from "../bim/parametrico";
import {
  ABAS, CAMPOS_DOCUMENTO, CAMPOS_MODELO, CAMPOS_OBRA, CAMPOS_VIDEO, DOCUMENTO_PADRAO, OBRA_VAZIA, ROTULO_ACAO, ROTULO_ANIMACAO, ROTULO_APARENCIA,
  ROTULO_CENA, ROTULO_COBERTURA, ROTULO_FORMATO, ROTULO_PASSEIO, ROTULO_RECORTE, ROTULO_TIPO_SEQUENCIA, SECOES_DOCUMENTO,
  type CenaFala, type DadosObra, type DocumentoPlanilha, type LinhaFala, type LinhaFoto, type LinhaSequencia, type LinhaTrilha, type ProblemaPlanilha, type ProjetoPlanilha,
  type TipoLinhaSequencia, type VideoPlanilha,
} from "./tipos";

type Linha = Record<string, unknown>;
export type Abas = Record<string, Linha[]>;

/** Sem acento, minúsculo e sem espaços extras: compara rótulos digitados à mão. */
export const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const texto = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

function numero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = texto(v).replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** Inverte um mapa valor → rótulo para achar o valor pelo rótulo (sem acento e caixa). */
function escolha<T extends string>(rotulos: Record<T, string>, v: unknown): T | undefined | null {
  const t = normalizar(texto(v));
  if (!t) return undefined;
  for (const [valor, rotulo] of Object.entries(rotulos) as [T, string][]) if (normalizar(rotulo) === t || normalizar(valor) === t) return valor;
  return null; // preenchido, mas fora da lista
}

const simNao = (v: unknown): boolean | undefined | null => {
  const t = normalizar(texto(v));
  if (!t) return undefined;
  if (["sim", "s", "yes", "true", "1", "x"].includes(t)) return true;
  if (["nao", "n", "no", "false", "0"].includes(t)) return false;
  return null;
};

/** Achar a aba sem depender de acento ou caixa ("Videos" = "Vídeo"s não; "Vídeo" = "video"). */
function aba(abas: Abas, nome: string): Linha[] | null {
  const alvo = normalizar(nome);
  for (const [k, v] of Object.entries(abas)) if (normalizar(k) === alvo) return v;
  return null;
}

/** Valor de uma coluna pelo cabeçalho, sem depender de acento ou caixa. */
function col(l: Linha, ...nomes: string[]): unknown {
  const alvos = nomes.map(normalizar);
  for (const [k, v] of Object.entries(l)) if (alvos.includes(normalizar(k))) return v;
  return undefined;
}

/** Abas de campo e valor: devolve o valor de cada campo pelo rótulo da coluna "campo". */
function ficha(linhas: Linha[] | null): Map<string, { valor: unknown; linha: number }> {
  const m = new Map<string, { valor: unknown; linha: number }>();
  (linhas ?? []).forEach((l, i) => {
    const campo = normalizar(texto(col(l, "campo")));
    if (campo) m.set(campo, { valor: col(l, "valor"), linha: i + 2 });
  });
  return m;
}

export function lerDataCelula(v: unknown, sistema1904 = false): number | null | undefined {
  if (typeof v === "number") return serialParaDia(v, sistema1904);
  const t = texto(v);
  if (!t) return undefined;
  return lerData(t);
}

function municipioPorNome(v: string): string | null | undefined {
  const t = normalizar(v);
  if (!t) return undefined;
  const m = MUNICIPIOS.find((x) => normalizar(x.nome) === t || x.id === t);
  if (m) return m.id;
  if (t.startsWith("outro") || t === OUTRO_MUNICIPIO) return OUTRO_MUNICIPIO;
  return null;
}

export function interpretarAbas(abas: Abas, sistema1904 = false): { projeto: ProjetoPlanilha; problemas: ProblemaPlanilha[] } {
  const problemas: ProblemaPlanilha[] = [];
  const p = (nivel: ProblemaPlanilha["nivel"], abaNome: string, mensagem: string, linha?: number) => problemas.push({ nivel, aba: abaNome, mensagem, ...(linha ? { linha } : {}) });

  // ---------- Obra ----------
  const fo = ficha(aba(abas, ABAS.obra));
  if (!aba(abas, ABAS.obra)) p("aviso", ABAS.obra, "A aba Obra não foi encontrada: o documento sai sem os dados da obra.");
  const campoObra = (k: keyof typeof CAMPOS_OBRA) => fo.get(normalizar(CAMPOS_OBRA[k]));
  const obra: DadosObra = { ...OBRA_VAZIA };
  for (const k of ["nome", "proprietario", "endereco", "responsavel", "crea", "descricao"] as const) obra[k] = texto(campoObra(k)?.valor);
  {
    const c = campoObra("municipio");
    const m = municipioPorNome(texto(c?.valor));
    if (m === null) p("aviso", ABAS.obra, `Município "${texto(c?.valor)}" não está na lista: os feriados municipais não entram na contagem de dias úteis.`, c?.linha);
    obra.municipio = m ?? null;
  }
  {
    const c = campoObra("dataReferencia");
    const d = lerDataCelula(c?.valor, sistema1904);
    if (d === null) p("erro", ABAS.obra, `Data de referência inválida ("${texto(c?.valor)}"). Use DD/MM/AAAA.`, c?.linha);
    obra.dataReferencia = d ?? null;
  }
  obra.arquivoIfc = texto(campoObra("arquivoIfc")?.valor) || null;
  {
    const c = campoObra("rumoFrente");
    const n = numero(c?.valor);
    if (Number.isNaN(n) || (n !== null && (n < 0 || n >= 360))) p("erro", ABAS.obra, `Rumo da fachada frontal inválido ("${texto(c?.valor)}"): use de 0 a 359 graus.`, c?.linha);
    else obra.rumoFrente = n;
  }

  // ---------- Modelo ----------
  let modelo: ParametrosCasa | null = null;
  const lm = aba(abas, ABAS.modelo);
  if (lm) {
    const fm = ficha(lm);
    const v = (k: keyof typeof CAMPOS_MODELO) => fm.get(normalizar(CAMPOS_MODELO[k]));
    const nums: Partial<Record<keyof typeof CAMPOS_MODELO, number>> = {};
    let ok = true;
    for (const k of ["terrenoLargura", "terrenoComprimento", "area", "pavimentos", "peDireito"] as const) {
      const c = v(k);
      const n = numero(c?.valor);
      if (n === null) continue;
      if (Number.isNaN(n) || n <= 0) {
        ok = false;
        p("erro", ABAS.modelo, `${CAMPOS_MODELO[k]}: valor inválido ("${texto(c?.valor)}").`, c?.linha);
      } else nums[k] = n;
    }
    if (nums.pavimentos !== undefined && nums.pavimentos !== 1 && nums.pavimentos !== 2) {
      ok = false;
      p("erro", ABAS.modelo, "Pavimentos: use 1 ou 2.", v("pavimentos")?.linha);
    }
    const cob = escolha(ROTULO_COBERTURA, v("cobertura")?.valor);
    if (cob === null) {
      ok = false;
      p("erro", ABAS.modelo, `Cobertura "${texto(v("cobertura")?.valor)}" fora da lista.`, v("cobertura")?.linha);
    }
    const completos = ["terrenoLargura", "terrenoComprimento", "area", "pavimentos", "peDireito"].every((k) => nums[k as keyof typeof nums] !== undefined) && cob;
    if (ok && completos) {
      modelo = {
        terrenoLargura: nums.terrenoLargura!, terrenoComprimento: nums.terrenoComprimento!, area: nums.area!,
        pavimentos: nums.pavimentos as 1 | 2, peDireito: nums.peDireito!, cobertura: cob,
      };
    }
  }
  if (!obra.arquivoIfc && !modelo) p("erro", ABAS.modelo, "Sem arquivo IFC na aba Obra e sem as medidas completas na aba Modelo: não há como montar a casa.");

  // ---------- Cronograma ----------
  let cronograma: ProjetoPlanilha["cronograma"] = null;
  const lc = aba(abas, ABAS.cronograma);
  if (!lc) p("erro", ABAS.cronograma, "A aba Cronograma não foi encontrada.");
  else {
    const linhas = lc.map((l) => {
      const out: Linha = {};
      for (const [k, v] of Object.entries(l)) out[k] = typeof v === "number" && ehColunaData(k) ? formatarISO(serialParaDia(v, sistema1904)) : v;
      return out;
    });
    const r = importarLinhas(linhas, "planilha");
    for (const x of r.problemas) problemas.push({ nivel: x.nivel, aba: ABAS.cronograma, mensagem: x.mensagem.replace(/^Linha \d+: /, ""), ...(x.linha ? { linha: x.linha } : {}) });
    cronograma = r.cronograma;
    if (cronograma && obra.municipio) cronograma = { ...cronograma, municipio: obra.municipio };
  }
  const ids = new Set(cronograma?.tarefas.map((t) => t.id) ?? []);

  // ---------- Vínculos ----------
  const vinculos: Excecao[] = [];
  (aba(abas, ABAS.vinculos) ?? []).forEach((l, i) => {
    const linha = i + 2;
    const guid = texto(col(l, "guid")), tarefa = texto(col(l, "tarefa", "etapa"));
    if (!guid && !tarefa) return;
    const acao = escolha(ROTULO_ACAO, col(l, "acao", "ação"));
    const modoT = normalizar(texto(col(l, "modo")));
    const modo = !modoT || modoT === "incluir" || modoT === "include" ? "include" : modoT === "excluir" || modoT === "exclude" ? "exclude" : null;
    if (!guid || !tarefa) return p("erro", ABAS.vinculos, "Preencha guid e tarefa.", linha);
    if (cronograma && !ids.has(tarefa)) return p("erro", ABAS.vinculos, `Tarefa "${tarefa}" não existe na aba Cronograma.`, linha);
    if (acao === null) return p("erro", ABAS.vinculos, `Ação "${texto(col(l, "acao", "ação"))}" fora da lista.`, linha);
    if (modo === null) return p("erro", ABAS.vinculos, 'Modo deve ser "incluir" ou "excluir".', linha);
    vinculos.push({ taskId: tarefa, guid, acao: (acao ?? "construct") as AcaoTarefa, modo });
  });

  // ---------- Falas ----------
  const falas: LinhaFala[] = [];
  const arquivosFala = new Set<string>();
  (aba(abas, ABAS.falas) ?? []).forEach((l, i) => {
    const linha = i + 2;
    const arquivo = texto(col(l, "arquivo"));
    if (!arquivo) {
      if (texto(col(l, "assunto"))) p("erro", ABAS.falas, "Falta o nome do arquivo da fala.", linha);
      return;
    }
    if (arquivosFala.has(arquivo.toLowerCase())) p("aviso", ABAS.falas, `O arquivo "${arquivo}" aparece em mais de uma linha.`, linha);
    arquivosFala.add(arquivo.toLowerCase());
    const ordem = numero(col(l, "ordem"));
    const cena = escolha<CenaFala>(ROTULO_CENA, col(l, "cena"));
    const recorte = escolha(ROTULO_RECORTE, col(l, "recorte"));
    const ini = numero(col(l, "inicio_s", "início_s", "inicio")), fim = numero(col(l, "fim_s", "fim"));
    if (cena === null) p("erro", ABAS.falas, `Cena "${texto(col(l, "cena"))}" fora da lista (terreno, sobre a obra, só a voz).`, linha);
    if (recorte === null) p("erro", ABAS.falas, `Recorte "${texto(col(l, "recorte"))}" fora da lista (IA, fundo verde).`, linha);
    if (Number.isNaN(ini) || Number.isNaN(fim) || (ini !== null && ini < 0)) p("erro", ABAS.falas, "inicio_s e fim_s devem ser números de segundos.", linha);
    else if (ini !== null && fim !== null && fim <= ini) p("erro", ABAS.falas, "fim_s deve ser maior que inicio_s.", linha);
    if (cena === null || recorte === null || Number.isNaN(ini) || Number.isNaN(fim)) return;
    const f: LinhaFala = { ordem: Number.isFinite(ordem) && ordem !== null ? ordem : falas.length + 1, arquivo, assunto: texto(col(l, "assunto")), cena: cena ?? "sobre-obra", recorte: recorte ?? "ia" };
    if (ini !== null) f.inicioS = ini;
    if (fim !== null && (ini === null || fim > ini)) f.fimS = fim;
    falas.push(f);
  });
  falas.sort((a, b) => a.ordem - b.ordem);

  // ---------- Fotos ----------
  const fotos: LinhaFoto[] = [];
  (aba(abas, ABAS.fotos) ?? []).forEach((l, i) => {
    const linha = i + 2;
    const arquivo = texto(col(l, "arquivo"));
    if (!arquivo) return;
    const dia = lerDataCelula(col(l, "data"), sistema1904);
    if (dia === null) p("erro", ABAS.fotos, `Data inválida ("${texto(col(l, "data"))}").`, linha);
    const etapa = texto(col(l, "etapa")) || null;
    if (etapa && cronograma && !ids.has(etapa)) p("aviso", ABAS.fotos, `Etapa "${etapa}" não existe na aba Cronograma.`, linha);
    fotos.push({ arquivo, dia: dia ?? null, local: texto(col(l, "local")), descricao: texto(col(l, "descricao", "descrição")), etapa });
  });

  // ---------- Sequência (ADR-34) ----------
  const sequencia: LinhaSequencia[] = [];
  (aba(abas, ABAS.sequencia) ?? []).forEach((l, i) => {
    const linha = i + 2;
    const arquivo = texto(col(l, "arquivo"));
    if (!arquivo) return;
    const tipo = escolha<TipoLinhaSequencia>(ROTULO_TIPO_SEQUENCIA, col(l, "tipo"));
    if (!tipo) {
      p("erro", ABAS.sequencia, `Tipo "${texto(col(l, "tipo"))}" fora da lista (fala, narração, foto).`, linha);
      return;
    }
    const ordem = numero(col(l, "ordem"));
    const d = numero(col(l, "duracao_s", "duração_s", "duracao"));
    if (d !== null && (Number.isNaN(d) || d < 2 || d > 6)) p("erro", ABAS.sequencia, "duracao_s: de 2 a 6 segundos (só para foto).", linha);
    const item: LinhaSequencia = { ordem: Number.isFinite(ordem) && ordem !== null ? ordem : sequencia.length + 1, tipo, arquivo };
    if (tipo === "foto" && d !== null && !Number.isNaN(d) && d >= 2 && d <= 6) item.duracaoS = d;
    sequencia.push(item);
  });
  sequencia.sort((a, b) => a.ordem - b.ordem);

  // ---------- Trilhas (ADR-34) ----------
  const trilhas: LinhaTrilha[] = [];
  (aba(abas, ABAS.trilhas) ?? []).forEach((l, i) => {
    const linha = i + 2;
    const arquivo = texto(col(l, "arquivo"));
    if (!arquivo) return;
    const e = texto(col(l, "entra"));
    const n = normalizar(e);
    const antes = /^antes de\s+(.+)$/i.exec(e);
    const entra = !n || n === "inicio" || n === "no inicio" ? "inicio" : n === "final" || n === "no final" ? "final" : antes ? antes[1].trim() : null;
    if (entra === null) p("erro", ABAS.trilhas, `Entra "${e}" fora da lista (início, final ou "antes de <arquivo>").`, linha);
    const v = numero(col(l, "volume"));
    if (v !== null && (Number.isNaN(v) || v < 0 || v > 100)) p("erro", ABAS.trilhas, "volume: de 0 a 100.", linha);
    const t: LinhaTrilha = { arquivo, entra: entra ?? "inicio" };
    if (v !== null && !Number.isNaN(v) && v >= 0 && v <= 100) t.volume = v;
    trilhas.push(t);
  });

  // ---------- Vídeo ----------
  const video: VideoPlanilha = {};
  const lv = aba(abas, ABAS.video);
  if (lv) {
    const fv = ficha(lv);
    const c = (k: keyof typeof CAMPOS_VIDEO) => fv.get(normalizar(CAMPOS_VIDEO[k]));
    const fora = (k: keyof typeof CAMPOS_VIDEO) => p("erro", ABAS.video, `${CAMPOS_VIDEO[k]}: "${texto(c(k)?.valor)}" fora da lista.`, c(k)?.linha);
    const formato = escolha(ROTULO_FORMATO, c("formato")?.valor);
    if (formato === null) fora("formato");
    else if (formato) video.formato = formato;
    const seg = numero(c("segundos")?.valor);
    if (seg === null) video.segundos = null;
    else if (Number.isNaN(seg) || seg < 5 || seg > 120) p("erro", ABAS.video, "Duração: de 5 a 120 segundos (ou vazio para a soma das falas).", c("segundos")?.linha);
    else video.segundos = Math.round(seg);
    const fps = numero(c("fps")?.valor);
    if (fps === 24 || fps === 30) video.fps = fps;
    else if (fps !== null) p("erro", ABAS.video, "Quadros por segundo: 24 ou 30.", c("fps")?.linha);
    const q = escolha({ maxima: "máxima", normal: "normal" }, c("qualidade")?.valor);
    if (q === null) fora("qualidade");
    else if (q) video.qualidade = q;
    const ap = escolha(ROTULO_APARENCIA, c("aparencia")?.valor);
    if (ap === null) fora("aparencia");
    else if (ap) video.aparencia = ap;
    const luz = escolha<Luz>(NOME_LUZ, c("luz")?.valor);
    if (luz === null) fora("luz");
    else if (luz) video.luz = luz;
    const an = escolha(ROTULO_ANIMACAO, c("animacao")?.valor);
    if (an === null) fora("animacao");
    else if (an) video.animacao = an;
    const pas = escolha(ROTULO_PASSEIO, c("passeio")?.valor);
    if (pas === null) fora("passeio");
    else if (pas) video.passeio = pas;
    const ass = simNao(c("assinatura")?.valor);
    if (ass === null) fora("assinatura");
    else if (ass !== undefined) video.assinatura = ass;
  }

  // ---------- Documento ----------
  const documento: DocumentoPlanilha = { ...DOCUMENTO_PADRAO, secoes: { ...DOCUMENTO_PADRAO.secoes } };
  const ld = aba(abas, ABAS.documento);
  if (ld) {
    const fd = ficha(ld);
    const c = (k: keyof typeof CAMPOS_DOCUMENTO) => fd.get(normalizar(CAMPOS_DOCUMENTO[k]));
    documento.titulo = texto(c("titulo")?.valor) || DOCUMENTO_PADRAO.titulo;
    documento.destinatario = texto(c("destinatario")?.valor);
    documento.observacoes = texto(c("observacoes")?.valor);
    for (const s of SECOES_DOCUMENTO) {
      const v = simNao(c(s)?.valor);
      if (v === null) p("erro", ABAS.documento, `${CAMPOS_DOCUMENTO[s]}: use "sim" ou "não".`, c(s)?.linha);
      else if (v !== undefined) documento.secoes[s] = v;
    }
  }

  return { projeto: { obra, modelo, cronograma, vinculos, falas, fotos, sequencia, trilhas, video, documento }, problemas };
}

/** A planilha é a única do projeto (tem as abas Obra e Cronograma), e não um cronograma avulso? */
export const ehPlanilhaUnica = (nomesAbas: string[]) => {
  const n = new Set(nomesAbas.map(normalizar));
  return n.has(normalizar(ABAS.obra)) && n.has(normalizar(ABAS.cronograma));
};

/** Abre o .xlsx e interpreta todas as abas (a LEIA-ME e a Listas são ignoradas). */
export async function lerPlanilha(bytes: Uint8Array): Promise<{ projeto: ProjetoPlanilha | null; problemas: ProblemaPlanilha[] }> {
  const XLSX = await import("xlsx");
  let wb: import("xlsx").WorkBook;
  try {
    wb = XLSX.read(bytes, { type: "array", cellDates: false });
  } catch (e) {
    return { projeto: null, problemas: [{ nivel: "erro", aba: "", mensagem: `Não foi possível ler a planilha: ${(e as Error).message}` }] };
  }
  if (!ehPlanilhaUnica(wb.SheetNames)) {
    return { projeto: null, problemas: [{ nivel: "erro", aba: "", mensagem: "Esta não é a planilha da obra: faltam as abas Obra e Cronograma. Baixe a planilha modelo no app." }] };
  }
  const abas: Abas = {};
  for (const nome of wb.SheetNames) abas[nome] = XLSX.utils.sheet_to_json<Linha>(wb.Sheets[nome], { raw: true, defval: "" });
  return interpretarAbas(abas, !!wb.Workbook?.WBProps?.date1904);
}
