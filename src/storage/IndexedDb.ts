// Persistência local (§37, ADR-06, ADR-11, ADR-14, ADR-22): banco "c4d" com projetos, modelos IFC, anexos (Blobs) e feriados.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { VERSAO_FERIADOS, baseDeFeriados, filtrarFeriados, type Feriado } from "../fourd/feriados";
import type { RegistroProjeto } from "./projeto";

interface Esquema extends DBSchema {
  projetos: { key: string; value: RegistroProjeto; indexes: { atualizadoEm: string } };
  modelos: { key: string; value: { id: string; ifc: Blob } };
  /** chave: "<projeto>/foto/<id>", "<projeto>/planta" ou "<projeto>/apresentadora" */
  anexos: { key: string; value: { chave: string; projetoId: string; blob: Blob }; indexes: { projetoId: string } };
  /** chave: "<abrangência>|<dia>|<nome>"; abrangência "CE" ou o id do município */
  feriados: { key: string; value: Feriado & { chave: string }; indexes: { abrangencia: string } };
  /** versão da base de feriados gravada */
  meta: { key: string; value: { chave: string; valor: number } };
}

let banco: Promise<IDBPDatabase<Esquema>> | null = null;

function abrir() {
  banco ??= openDB<Esquema>("c4d", 3, {
    upgrade(db, versaoAntiga) {
      if (versaoAntiga < 1) {
        const p = db.createObjectStore("projetos", { keyPath: "id" });
        p.createIndex("atualizadoEm", "atualizadoEm");
        db.createObjectStore("modelos", { keyPath: "id" });
      }
      if (versaoAntiga < 2) {
        const a = db.createObjectStore("anexos", { keyPath: "chave" });
        a.createIndex("projetoId", "projetoId");
      }
      if (versaoAntiga < 3) {
        db.createObjectStore("feriados", { keyPath: "chave" }).createIndex("abrangencia", "abrangencia");
        db.createObjectStore("meta", { keyPath: "chave" });
      }
    },
  });
  return banco;
}

export const chaveFoto = (projetoId: string, fotoId: string) => `${projetoId}/foto/${fotoId}`;
export const chavePlanta = (projetoId: string) => `${projetoId}/planta`;
/** Vídeo da apresentadora (ADR-24): fica no navegador, fora do .4dstudio. */
export const chaveApresentadora = (projetoId: string) => `${projetoId}/apresentadora`;
/** Vídeos das falas da planilha (ADR-30), pelo nome do arquivo em minúsculas. Também ficam fora do .4dstudio. */
export const chaveFala = (projetoId: string, nome: string) => `${projetoId}/fala/${nome.toLowerCase()}`;
/** Trilha sonora do vídeo (ADR-34), pelo nome do arquivo. */
export const chaveTrilha = (projetoId: string, nome: string) => `${projetoId}/trilha/${nome.toLowerCase()}`;

/** Vídeo de imagens (INC-19): fica num grupo próprio de anexos, fora dos projetos de obra. */
export const GRUPO_IMAGENS = "__imagens__";
export const chaveEstadoImagens = () => `${GRUPO_IMAGENS}/estado`;
export const chaveImagem = (id: string) => `${GRUPO_IMAGENS}/img/${id}`;
export const chaveNarracaoImagens = () => `${GRUPO_IMAGENS}/narracao`;

/** Todos os anexos de um grupo (projeto ou o vídeo de imagens), pela chave. */
export async function lerAnexosDe(projetoId: string): Promise<Map<string, Blob>> {
  return new Map((await (await abrir()).getAllFromIndex("anexos", "projetoId", projetoId)).map((a) => [a.chave, a.blob]));
}

/** Apaga todos os anexos de um grupo (o vídeo de imagens ao recomeçar). */
export async function excluirAnexosDe(projetoId: string): Promise<void> {
  const db = await abrir();
  const tx = db.transaction("anexos", "readwrite");
  for (const chave of await tx.store.index("projetoId").getAllKeys(projetoId)) await tx.store.delete(chave);
  await tx.done;
}

export async function listarProjetos(): Promise<RegistroProjeto[]> {
  const todos = await (await abrir()).getAll("projetos");
  return todos.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
}

export async function lerProjeto(id: string): Promise<{ registro: RegistroProjeto; ifc: Blob | null; anexos: Map<string, Blob> } | null> {
  const db = await abrir();
  const registro = await db.get("projetos", id);
  if (!registro) return null;
  const anexos = new Map((await db.getAllFromIndex("anexos", "projetoId", id)).map((a) => [a.chave, a.blob]));
  return { registro, ifc: (await db.get("modelos", id))?.ifc ?? null, anexos };
}

/** Grava o registro; o IFC só quando informado (ele não muda depois de criado). */
export async function gravarProjeto(r: RegistroProjeto, ifc?: Blob | null): Promise<void> {
  const db = await abrir();
  const tx = db.transaction(["projetos", "modelos"], "readwrite");
  await tx.objectStore("projetos").put(r);
  if (ifc) await tx.objectStore("modelos").put({ id: r.id, ifc });
  await tx.done;
}

export async function gravarAnexo(projetoId: string, chave: string, blob: Blob): Promise<void> {
  await (await abrir()).put("anexos", { chave, projetoId, blob });
}

export async function excluirAnexo(chave: string): Promise<void> {
  await (await abrir()).delete("anexos", chave);
}

export async function excluirProjeto(id: string): Promise<void> {
  const db = await abrir();
  const tx = db.transaction(["projetos", "modelos", "anexos"], "readwrite");
  await tx.objectStore("projetos").delete(id);
  await tx.objectStore("modelos").delete(id);
  for (const chave of await tx.objectStore("anexos").index("projetoId").getAllKeys(id)) await tx.objectStore("anexos").delete(chave);
  await tx.done;
}

/** Pede ao navegador que não apague os dados sob pressão de espaço. */
export async function pedirPersistencia(): Promise<boolean | null> {
  try {
    if (!navigator.storage?.persist) return null;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return null;
  }
}

/** Grava no banco os feriados de 2026 a 2030 (ADR-22), só quando a versão da base mudou. */
export async function carregarFeriados(): Promise<number> {
  const db = await abrir();
  if ((await db.get("meta", "feriados"))?.valor === VERSAO_FERIADOS) return db.count("feriados");
  const base = baseDeFeriados();
  const tx = db.transaction(["feriados", "meta"], "readwrite");
  await tx.objectStore("feriados").clear();
  for (const x of base) await tx.objectStore("feriados").put({ ...x, chave: `${x.abrangencia}|${x.dia}|${x.nome}` });
  await tx.objectStore("meta").put({ chave: "feriados", valor: VERSAO_FERIADOS });
  await tx.done;
  return base.length;
}

/** Feriados do município no intervalo, lidos do banco; sem banco (aba privada, Node), da base em memória. */
export async function feriadosDoMunicipio(municipio: string, ini: number, fim: number): Promise<Feriado[]> {
  try {
    await carregarFeriados();
    const db = await abrir();
    const lidos = [...(await db.getAllFromIndex("feriados", "abrangencia", "CE")), ...(await db.getAllFromIndex("feriados", "abrangencia", municipio))];
    return filtrarFeriados(lidos, municipio, ini, fim)
      .map(({ chave: _, ...x }) => x)
      .sort((a, b) => a.dia - b.dia);
  } catch {
    return filtrarFeriados(baseDeFeriados(), municipio, ini, fim);
  }
}
