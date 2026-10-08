// Ações de carga (IFC, cronograma, demonstração) com erros em linguagem simples (§40).
import { ErroCarga, WebIfcWorkerAdapter } from "../bim/ModelAdapter";
import type { MalhaElemento } from "../bim/parseIfc";
import { ErroParametro, gerarCasa, type ParametrosCasa } from "../bim/parametrico";
import { importarXlsx } from "../importers/xlsx";
import { importarCronograma } from "../importers/cronograma";
import { useProjeto } from "../state/projectStore";

const adaptador = new WebIfcWorkerAdapter();
const ouvintes = new Set<(m: MalhaElemento[]) => void>();

/** A cena se inscreve aqui para receber a geometria sem passar pelo estado global. */
export function aoCarregarMalhas(f: (m: MalhaElemento[]) => void): () => void {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
}

let ultimasMalhas: MalhaElemento[] | null = null;
export const malhasAtuais = () => ultimasMalhas;

/** Cópia do IFC atual, para gravar no projeto (o ArrayBuffer original vai para o worker). */
let ifcAtual: Blob | null = null;
export const ifcDoModeloAtual = () => ifcAtual;

export function limparModelo(): void {
  ultimasMalhas = null;
  ifcAtual = null;
}

export async function carregarIfc(nome: string, bytes: ArrayBuffer, demo = false): Promise<boolean> {
  const st = useProjeto.getState();
  if (!/\.ifc$/i.test(nome)) {
    st.mostrarErro({ mensagem: "Este arquivo não é um modelo IFC.", orientacao: "Escolha um arquivo com extensão .ifc." });
    return false;
  }
  st.mostrarErro(null);
  st.definirCarga({ fracao: 0, etapa: "Lendo o arquivo" });
  const copia = new Blob([bytes], { type: "application/x-step" });
  try {
    const modelo = await adaptador.load(bytes, (fracao, etapa) => useProjeto.getState().definirCarga({ fracao, etapa }));
    ultimasMalhas = modelo.malhas;
    ifcAtual = copia;
    useProjeto.getState().definirModelo(modelo.elementos, nome, demo, "IFC");
    useProjeto.setState({ geoIfc: modelo.geo ?? {} }); // local e norte do IFC (ADR-26)
    // vínculos da planilha da obra valem para o IFC citado nela (ADR-29)
    const pl = useProjeto.getState().planilha;
    if (pl?.vinculos.length && pl.obra.arquivoIfc?.toLowerCase() === nome.toLowerCase()) useProjeto.setState({ excecoes: pl.vinculos });
    ouvintes.forEach((f) => f(modelo.malhas));
    return true;
  } catch (e) {
    const erro = e instanceof ErroCarga ? e : new ErroCarga("Não foi possível carregar o modelo IFC.", String(e));
    useProjeto.getState().mostrarErro({ mensagem: erro.message, orientacao: "Verifique se o arquivo está íntegro e tente novamente.", detalhes: erro.detalhes });
    return false;
  } finally {
    useProjeto.getState().definirCarga(null);
  }
}

/** Modelo paramétrico (ADR-12): gerado no próprio fluxo principal, é leve. */
export function carregarParametrico(p: ParametrosCasa): boolean {
  const st = useProjeto.getState();
  try {
    const modelo = gerarCasa(p);
    ultimasMalhas = modelo.malhas;
    ifcAtual = null;
    st.definirModelo(modelo.elementos, "modelo paramétrico", false, "PARAMETRICO", p);
    useProjeto.setState({ geoIfc: {} });
    ouvintes.forEach((f) => f(modelo.malhas));
    return true;
  } catch (e) {
    st.mostrarErro(
      e instanceof ErroParametro
        ? { mensagem: e.message }
        : { mensagem: "Não foi possível gerar o modelo paramétrico.", orientacao: "Revise os parâmetros e tente de novo.", detalhes: String((e as Error)?.stack ?? e) },
    );
    return false;
  }
}

export async function carregarCronograma(nome: string, bytes: Uint8Array, demo = false): Promise<boolean> {
  const st = useProjeto.getState();
  if (!/\.(csv|json|txt|xlsx)$/i.test(nome)) {
    st.mostrarErro({ mensagem: "Formato de cronograma não aceito.", orientacao: "Use um arquivo .csv, .xlsx ou .json." });
    return false;
  }
  // a planilha única da obra (abas Obra e Cronograma) tem leitura própria (ADR-29)
  if (/\.xlsx$/i.test(nome) && (await (await import("./planilha")).abrirPlanilha(nome, bytes))) {
    st.mostrarErro(null);
    return true;
  }
  const r = /\.xlsx$/i.test(nome) ? await importarXlsx(bytes) : importarCronograma(nome, bytes);
  if (!r.cronograma) {
    st.definirProblemasImportacao(r.problemas);
    st.mostrarErro({
      mensagem: "O cronograma tem problemas e não foi carregado.",
      orientacao: "Veja a lista na aba Validação, corrija o arquivo e carregue de novo.",
      detalhes: r.problemas.map((p) => p.mensagem).join("\n"),
    });
    return false;
  }
  st.mostrarErro(null);
  st.definirCronograma(r.cronograma, nome, r.formato, r.problemas, demo);
  return true;
}

const base = () => new URL("samples/", document.baseURI);

/** A demonstração só é oferecida se os arquivos existirem (nada de botão sem efeito). */
/** Exemplos embutidos: a casa térrea (demonstração) e o sobrado de dois pavimentos. */
export type Exemplo = "casa" | "sobrado";
const EXEMPLOS: Record<Exemplo, { ifc: string; csv: string; nome: string }> = {
  casa: { ifc: "samples/demo.ifc", csv: "samples/demo-cronograma.csv", nome: "Demonstração" },
  sobrado: { ifc: "modelos/sobrado-exemplo.ifc", csv: "modelos/cronograma-sobrado.csv", nome: "Sobrado de exemplo" },
};
const url = (caminho: string) => new URL(caminho, document.baseURI);

/** A demonstração só é oferecida se os arquivos existirem (nada de botão sem efeito). */
export async function demonstracaoDisponivel(exemplo: Exemplo = "casa"): Promise<boolean> {
  try {
    const e = EXEMPLOS[exemplo];
    const [a, b] = await Promise.all([fetch(url(e.ifc), { method: "HEAD" }), fetch(url(e.csv), { method: "HEAD" })]);
    return a.ok && b.ok;
  } catch {
    return false;
  }
}

export async function abrirDemonstracao(exemplo: Exemplo = "casa"): Promise<void> {
  const st = useProjeto.getState();
  const e = EXEMPLOS[exemplo];
  try {
    const [ifc, csv] = await Promise.all([fetch(url(e.ifc)), fetch(url(e.csv))]);
    if (!ifc.ok || !csv.ok) throw new Error(`HTTP ${ifc.status}/${csv.status}`);
    const [bi, bc] = await Promise.all([ifc.arrayBuffer(), csv.arrayBuffer()]);
    useProjeto.getState().definirProjeto({ projetoId: null, nomeProjeto: e.nome, salvoEm: null });
    (await import("./anexos")).limparAnexos();
    useProjeto.setState({ fotos: [], planta: null, visao: "planejado" });
    const nomeIfc = e.ifc.split("/").pop()!, nomeCsv = e.csv.split("/").pop()!;
    if (await carregarIfc(nomeIfc, bi, true)) await carregarCronograma(nomeCsv, new Uint8Array(bc), true);
  } catch (err) {
    st.mostrarErro({ mensagem: "Não foi possível abrir o exemplo.", orientacao: "Recarregue a página e tente de novo.", detalhes: String(err) });
  }
}

/** Cronograma de demonstração (fictício), oferecido a modelos sem cronograma. */
export async function usarCronogramaDemo(): Promise<void> {
  try {
    const r = await fetch(new URL("demo-cronograma.csv", base()));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    await carregarCronograma("demo-cronograma.csv", new Uint8Array(await r.arrayBuffer()), true);
  } catch (e) {
    useProjeto.getState().mostrarErro({ mensagem: "Não foi possível abrir o cronograma de demonstração.", detalhes: String(e) });
  }
}
