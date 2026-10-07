// Persistência local (§37, ADR-06, ADR-11, ADR-14): banco "c4d" com projetos, modelos IFC e anexos (Blobs).
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { RegistroProjeto } from "./projeto";

interface Esquema extends DBSchema {
  projetos: { key: string; value: RegistroProjeto; indexes: { atualizadoEm: string } };
  modelos: { key: string; value: { id: string; ifc: Blob } };
  /** chave: "<projeto>/foto/<id>" ou "<projeto>/planta" */
  anexos: { key: string; value: { chave: string; projetoId: string; blob: Blob }; indexes: { projetoId: string } };
}

let banco: Promise<IDBPDatabase<Esquema>> | null = null;

function abrir() {
  banco ??= openDB<Esquema>("c4d", 2, {
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
    },
  });
  return banco;
}

export const chaveFoto = (projetoId: string, fotoId: string) => `${projetoId}/foto/${fotoId}`;
export const chavePlanta = (projetoId: string) => `${projetoId}/planta`;

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
