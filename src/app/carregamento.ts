// Ações de carga (IFC, cronograma, demonstração) com erros em linguagem simples (§40).
import { ErroCarga, WebIfcWorkerAdapter } from "../bim/ModelAdapter";
import type { MalhaElemento } from "../bim/parseIfc";
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

export async function carregarIfc(nome: string, bytes: ArrayBuffer, demo = false): Promise<boolean> {
  const st = useProjeto.getState();
  if (!/\.ifc$/i.test(nome)) {
    st.mostrarErro({ mensagem: "Este arquivo não é um modelo IFC.", orientacao: "Escolha um arquivo com extensão .ifc." });
    return false;
  }
  st.mostrarErro(null);
  st.definirCarga({ fracao: 0, etapa: "Lendo o arquivo" });
  try {
    const modelo = await adaptador.load(bytes, (fracao, etapa) => useProjeto.getState().definirCarga({ fracao, etapa }));
    ultimasMalhas = modelo.malhas;
    useProjeto.getState().definirModelo(modelo.elementos, nome, demo);
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

export function carregarCronograma(nome: string, bytes: Uint8Array, demo = false): boolean {
  const st = useProjeto.getState();
  if (!/\.(csv|json|txt)$/i.test(nome)) {
    st.mostrarErro({ mensagem: "Formato de cronograma não aceito.", orientacao: "Use um arquivo .csv ou .json. XLSX chega numa próxima versão." });
    return false;
  }
  const r = importarCronograma(nome, bytes);
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
export async function demonstracaoDisponivel(): Promise<boolean> {
  try {
    const [a, b] = await Promise.all([fetch(new URL("demo.ifc", base()), { method: "HEAD" }), fetch(new URL("demo-cronograma.csv", base()), { method: "HEAD" })]);
    return a.ok && b.ok;
  } catch {
    return false;
  }
}

export async function abrirDemonstracao(): Promise<void> {
  const st = useProjeto.getState();
  try {
    const [ifc, csv] = await Promise.all([fetch(new URL("demo.ifc", base())), fetch(new URL("demo-cronograma.csv", base()))]);
    if (!ifc.ok || !csv.ok) throw new Error(`HTTP ${ifc.status}/${csv.status}`);
    const [bi, bc] = await Promise.all([ifc.arrayBuffer(), csv.arrayBuffer()]);
    if (await carregarIfc("demo.ifc", bi, true)) carregarCronograma("demo-cronograma.csv", new Uint8Array(bc), true);
  } catch (e) {
    st.mostrarErro({ mensagem: "Não foi possível abrir a demonstração.", orientacao: "Recarregue a página e tente de novo.", detalhes: String(e) });
  }
}

export function dispose(): void {
  adaptador.dispose();
}
