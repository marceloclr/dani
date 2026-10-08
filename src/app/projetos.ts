// Ciclo de vida do projeto (ADR-11): criação, gravação automática, abrir, duplicar, exportar, importar e excluir.
import { carregarIfc, carregarParametrico, ifcDoModeloAtual, limparModelo } from "./carregamento";
import { descreverParametros } from "../bim/parametrico";
import { aplicarMapeamento, contarPorTarefa, descreverRegras, semTarefa } from "../fourd/regras";
import { formatarISO } from "../fourd/tempo";
import { chaveApresentadora, chaveFala, chaveFoto, chavePlanta, excluirProjeto, gravarAnexo, gravarProjeto, lerProjeto, listarProjetos, pedirPersistencia } from "../storage/IndexedDb";
import { blobDaFoto, blobDaPlanta, gravarTodosAnexos, limparAnexos, restaurarAnexos } from "./anexos";
import { ErroProjeto, exportar4dstudio, importar4dstudio, type ArquivosAnexos, type RegistroProjeto } from "../storage/projeto";
import { useProjeto, type Estado } from "../state/projectStore";
import { baixar } from "../utils/baixar";

const ESPERA_MS = 600;
let temporizador: ReturnType<typeof setTimeout> | null = null;
const criadoEm = new Map<string, string>();

const agora = () => new Date().toISOString();
const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : `p-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const semExtensao = (n: string) => n.replace(/\.[^.]+$/, "");
export const nomeSeguro = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "projeto";

/** Registro do projeto aberto, a partir do estado atual. */
export function registroAtual(s: Estado = useProjeto.getState()): RegistroProjeto | null {
  if (!s.projetoId || !s.tipoModelo) return null;
  const ifc = ifcDoModeloAtual();
  return {
    id: s.projetoId,
    nome: s.nomeProjeto ?? "Projeto",
    criadoEm: criadoEm.get(s.projetoId) ?? agora(),
    atualizadoEm: agora(),
    modelo: s.tipoModelo === "PARAMETRICO" && s.parametros ? { tipo: "PARAMETRICO", parametros: s.parametros } : { tipo: "IFC", arquivo: s.arquivoModelo ?? "modelo.ifc", tamanho: ifc?.size ?? 0 },
    cronograma: s.cronograma,
    arquivoCronograma: s.arquivoCronograma,
    excecoes: s.excecoes,
    politica: s.politica,
    modoAnimacao: s.modoAnimacao,
    video: s.video,
    demo: s.demoModelo || s.demoCronograma,
    fotos: s.fotos,
    planta: s.planta,
    aparencia3d: s.aparencia3d,
    planilha: s.planilha,
  };
}

async function gravarAgora(comModelo: boolean): Promise<void> {
  const r = registroAtual();
  if (!r) return;
  try {
    await gravarProjeto(r, comModelo ? ifcDoModeloAtual() : null);
    const st = useProjeto.getState();
    if (st.projetoId === r.id) st.definirProjeto({ salvoEm: r.atualizadoEm });
  } catch (e) {
    useProjeto.getState().mostrarErro({ mensagem: "Não foi possível salvar o projeto neste navegador.", orientacao: "Exporte um arquivo .4dstudio para não perder o trabalho.", detalhes: String(e) });
  }
}

/** Cria um projeto a partir do que está carregado e grava (inclusive o IFC). */
export async function criarProjeto(nome: string): Promise<void> {
  const id = novoId();
  criadoEm.set(id, agora());
  useProjeto.getState().definirProjeto({ projetoId: id, nomeProjeto: nome, salvoEm: null });
  await gravarAgora(true);
  await gravarTodosAnexos(id);
  if (useProjeto.getState().persistencia === null) useProjeto.getState().definirProjeto({ persistencia: await pedirPersistencia() });
}

/** Gravação automática: observa os campos que fazem parte do projeto. */
export function iniciarGravacaoAutomatica(): () => void {
  return useProjeto.subscribe((s, a) => {
    if (!s.projetoId || s.projetoId !== a.projetoId) return;
    const mudou =
      s.cronograma !== a.cronograma ||
      s.arquivoCronograma !== a.arquivoCronograma ||
      s.excecoes !== a.excecoes ||
      s.politica !== a.politica ||
      s.modoAnimacao !== a.modoAnimacao ||
      s.video !== a.video ||
      s.nomeProjeto !== a.nomeProjeto ||
      s.demoCronograma !== a.demoCronograma ||
      s.fotos !== a.fotos ||
      s.planta !== a.planta ||
      s.aparencia3d !== a.aparencia3d;
    if (!mudou) return;
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      temporizador = null;
      void gravarAgora(false);
    }, ESPERA_MS);
  });
}

/** Grava o que estiver pendente (ex.: antes de abrir outro projeto). */
async function descarregar(): Promise<void> {
  if (!temporizador) return;
  clearTimeout(temporizador);
  temporizador = null;
  await gravarAgora(false);
}

export async function abrirIfcComoProjeto(nome: string, bytes: ArrayBuffer): Promise<void> {
  await descarregar();
  const st = useProjeto.getState();
  const anterior = { projetoId: st.projetoId, nomeProjeto: st.nomeProjeto, salvoEm: st.salvoEm };
  st.definirProjeto({ projetoId: null }); // não gravar o modelo novo sobre o projeto anterior
  if (await carregarIfc(nome, bytes)) {
    // modelo novo, projeto novo: fotos e planta do anterior não vêm junto; no fluxo da planilha (ADR-30),
    // os arquivos enviados antes do IFC (falas e fotos) são da mesma obra e ficam
    if (!useProjeto.getState().planilha) {
      limparAnexos();
      useProjeto.setState({ fotos: [], planta: null });
    }
    await criarProjeto(useProjeto.getState().planilha?.obra.nome || semExtensao(nome));
  }
  else st.definirProjeto(anterior);
}

export async function criarParametricoComoProjeto(p: Parameters<typeof carregarParametrico>[0]): Promise<boolean> {
  await descarregar();
  const st = useProjeto.getState();
  const anterior = { projetoId: st.projetoId, nomeProjeto: st.nomeProjeto, salvoEm: st.salvoEm };
  st.definirProjeto({ projetoId: null });
  if (!carregarParametrico(p)) {
    st.definirProjeto(anterior);
    return false;
  }
  limparAnexos();
  useProjeto.getState().definirPlanta(null);
  useProjeto.setState({ fotos: [] });
  await criarProjeto(`Casa paramétrica (${descreverParametros(p)})`);
  return true;
}

/** Transforma o que está aberto (ex.: a demonstração) num projeto salvo. */
export async function salvarCopia(): Promise<void> {
  const st = useProjeto.getState();
  await criarProjeto(st.projetoId ? `${st.nomeProjeto} (cópia)` : st.nomeProjeto ?? "Demonstração");
}

export async function abrirProjeto(id: string): Promise<boolean> {
  await descarregar();
  const lido = await lerProjeto(id);
  const st = useProjeto.getState();
  if (!lido) {
    st.mostrarErro({ mensagem: "Projeto não encontrado neste navegador." });
    return false;
  }
  const r = lido.registro;
  st.definirProjeto({ projetoId: null });
  const fotosDoProjeto = new Map<string, Blob>();
  for (const f of r.fotos ?? []) {
    const b = lido.anexos.get(chaveFoto(r.id, f.id));
    if (b) fotosDoProjeto.set(f.id, b);
  }
  const prefixoFala = chaveFala(r.id, "");
  const videosDeFala = new Map([...lido.anexos].filter(([k]) => k.startsWith(prefixoFala)).map(([k, b]) => [k.slice(prefixoFala.length), b]));
  restaurarAnexos(fotosDoProjeto, r.planta ? lido.anexos.get(chavePlanta(r.id)) ?? null : null, lido.anexos.get(chaveApresentadora(r.id)) ?? null, videosDeFala);
  let ok: boolean;
  if (r.modelo.tipo === "PARAMETRICO") ok = carregarParametrico(r.modelo.parametros);
  else if (lido.ifc) ok = await carregarIfc(r.modelo.arquivo, await lido.ifc.arrayBuffer(), r.demo);
  else {
    st.mostrarErro({ mensagem: "O modelo IFC deste projeto não está mais salvo no navegador." });
    ok = false;
  }
  if (!ok) return false;
  st.restaurar({
    cronograma: r.cronograma,
    arquivoCronograma: r.arquivoCronograma,
    excecoes: r.excecoes,
    politica: r.politica,
    modoAnimacao: r.modoAnimacao,
    video: r.video,
    demoCronograma: r.demo,
    fotos: (r.fotos ?? []).filter((f) => fotosDoProjeto.has(f.id)),
    planta: r.planta && lido.anexos.has(chavePlanta(r.id)) ? r.planta : null,
    aparencia3d: r.aparencia3d ?? "realista",
    planilha: r.planilha ?? null,
  });
  criadoEm.set(r.id, r.criadoEm);
  st.definirProjeto({ projetoId: r.id, nomeProjeto: r.nome, salvoEm: r.atualizadoEm });
  return true;
}

export async function duplicarProjeto(id: string): Promise<void> {
  const lido = await lerProjeto(id);
  if (!lido) return;
  const novo: RegistroProjeto = { ...lido.registro, id: novoId(), nome: `${lido.registro.nome} (cópia)`, criadoEm: agora(), atualizadoEm: agora() };
  await gravarProjeto(novo, lido.ifc);
  for (const [chave, blob] of lido.anexos) await gravarAnexo(novo.id, chave.replace(`${id}/`, `${novo.id}/`), blob);
}

export async function excluir(id: string): Promise<void> {
  await excluirProjeto(id);
  const st = useProjeto.getState();
  if (st.projetoId === id) st.definirProjeto({ projetoId: null, salvoEm: null });
}

export async function exportarProjeto(id: string | null): Promise<void> {
  const st = useProjeto.getState();
  let registro: RegistroProjeto | null;
  let ifc: Blob | null;
  const anexos: ArquivosAnexos = { fotos: new Map(), planta: null };
  const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
  if (id && id !== st.projetoId) {
    const lido = await lerProjeto(id);
    registro = lido?.registro ?? null;
    ifc = lido?.ifc ?? null;
    if (lido && registro) {
      for (const f of registro.fotos ?? []) {
        const b = lido.anexos.get(chaveFoto(registro.id, f.id));
        if (b) anexos.fotos.set(f.id, await bytes(b));
      }
      const p = lido.anexos.get(chavePlanta(registro.id));
      if (p) anexos.planta = await bytes(p);
    }
  } else {
    // projeto aberto (ou a demonstração ainda não salva)
    registro = registroAtual() ?? registroAtual({ ...st, projetoId: "nao-salvo", nomeProjeto: st.nomeProjeto ?? "Demonstração" });
    ifc = ifcDoModeloAtual();
    for (const f of st.fotos) {
      const b = blobDaFoto(f.id);
      if (b) anexos.fotos.set(f.id, await bytes(b));
    }
    const p = blobDaPlanta();
    if (p) anexos.planta = await bytes(p);
  }
  if (!registro) return;
  try {
    const zip = exportar4dstudio(registro, ifc ? await bytes(ifc) : null, anexos);
    baixar(new Blob([zip as BlobPart], { type: "application/zip" }), `${nomeSeguro(registro.nome)}.4dstudio`);
  } catch (e) {
    st.mostrarErro({ mensagem: e instanceof ErroProjeto ? e.message : "Não foi possível exportar o projeto.", detalhes: String(e) });
  }
}

export async function importarProjeto(arquivo: File): Promise<boolean> {
  const st = useProjeto.getState();
  try {
    const { registro, ifc, anexos } = importar4dstudio(new Uint8Array(await arquivo.arrayBuffer()));
    const id = novoId();
    const r: RegistroProjeto = { ...registro, id, atualizadoEm: agora() };
    await gravarProjeto(r, ifc ? new Blob([ifc as BlobPart], { type: "application/x-step" }) : null);
    for (const f of r.fotos ?? []) {
      const d = anexos.fotos.get(f.id);
      if (d) await gravarAnexo(id, chaveFoto(id, f.id), new Blob([d as BlobPart], { type: f.tipo }));
    }
    if (r.planta && anexos.planta) await gravarAnexo(id, chavePlanta(id), new Blob([anexos.planta as BlobPart], { type: r.planta.tipo }));
    return await abrirProjeto(id);
  } catch (e) {
    st.mostrarErro(
      e instanceof ErroProjeto
        ? { mensagem: e.message, orientacao: "Confira se o arquivo foi exportado pelo Construction 4D Studio.", detalhes: e.detalhes }
        : { mensagem: "Não foi possível importar o projeto.", detalhes: String(e) },
    );
    return false;
  }
}

export async function novoProjeto(): Promise<void> {
  await descarregar();
  limparModelo();
  limparAnexos();
  useProjeto.getState().reiniciar();
}

export { listarProjetos };

// ------------------------------------------------------------------ exportações do §39

export function exportarCronogramaJson(): void {
  const s = useProjeto.getState();
  if (!s.cronograma) return;
  const c = s.cronograma;
  const tarefas = c.tarefas.map((t) => ({
    id: t.id, nome: t.nome, categoria: t.categoria, ...(t.pavimento ? { pavimento: t.pavimento } : {}),
    inicio: formatarISO(c.inicio + t.ini), fim: formatarISO(c.inicio + t.fim),
    ...(t.realIni !== undefined ? { inicio_real: formatarISO(c.inicio + t.realIni) } : {}),
    ...(t.realFim !== undefined ? { fim_real: formatarISO(c.inicio + t.realFim) } : {}),
    ...(t.avanco !== undefined ? { avanco: t.avanco } : {}),
  }));
  baixar(new Blob([JSON.stringify({ ...(c.estimado ? { estimativa: "gerado automaticamente; não é cronograma executivo" } : {}), tarefas }, null, 2)], { type: "application/json" }), `${nomeSeguro(s.nomeProjeto ?? "cronograma")}-cronograma.json`);
}

/** CSV com ponto e vírgula e BOM, para abrir direto no Excel brasileiro. */
export function exportarCronogramaCsv(): void {
  const s = useProjeto.getState();
  if (!s.cronograma) return;
  const c = s.cronograma;
  const campo = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const d = (x?: number) => (x === undefined ? "" : formatarISO(c.inicio + x));
  const linhas = [
    "id;nome;inicio;fim;categoria;pavimento;inicio_real;fim_real;avanco",
    ...c.tarefas.map((t) => [t.id, t.nome, d(t.ini), d(t.fim), t.categoria, t.pavimento ?? "", d(t.realIni), d(t.realFim), t.avanco === undefined ? "" : `${Math.round(t.avanco * 100)}%`].map(campo).join(";")),
  ];
  baixar(new Blob(["﻿" + linhas.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" }), `${nomeSeguro(s.nomeProjeto ?? "cronograma")}-cronograma.csv`);
}

export function exportarMapeamentoJson(): void {
  const s = useProjeto.getState();
  if (!s.cronograma) return;
  const vinculos = aplicarMapeamento(s.elementos, s.regras, s.excecoes);
  const contagem = contarPorTarefa(vinculos);
  const porTarefa: Record<string, string[]> = {};
  for (const [guid, lista] of vinculos) for (const v of lista) (porTarefa[v.taskId] ??= []).push(guid);
  const dados = {
    tarefas: s.cronograma.tarefas.map((t) => ({ id: t.id, nome: t.nome, categoria: t.categoria, regras: descreverRegras(t.categoria), elementos: contagem.get(t.id) ?? 0, guids: porTarefa[t.id] ?? [] })),
    regras: s.regras,
    excecoes: s.excecoes,
    politicaSemTarefa: s.politica,
    elementosSemTarefa: semTarefa(vinculos),
  };
  baixar(new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" }), `${nomeSeguro(s.nomeProjeto ?? "projeto")}-mapeamento.json`);
}
