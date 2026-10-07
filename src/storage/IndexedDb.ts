// Persistência local (§37, ADR-06, ADR-11): banco "c4d" com projetos e modelos IFC (Blob).
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { RegistroProjeto } from "./projeto";

interface Esquema extends DBSchema {
  projetos: { key: string; value: RegistroProjeto; indexes: { atualizadoEm: string } };
  modelos: { key: string; value: { id: string; ifc: Blob } };
}

let banco: Promise<IDBPDatabase<Esquema>> | null = null;

function abrir() {
  banco ??= openDB<Esquema>("c4d", 1, {
    upgrade(db) {
      const p = db.createObjectStore("projetos", { keyPath: "id" });
      p.createIndex("atualizadoEm", "atualizadoEm");
      db.createObjectStore("modelos", { keyPath: "id" });
    },
  });
  return banco;
}

export async function listarProjetos(): Promise<RegistroProjeto[]> {
  const todos = await (await abrir()).getAll("projetos");
  return todos.sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm));
}

export async function lerProjeto(id: string): Promise<{ registro: RegistroProjeto; ifc: Blob | null } | null> {
  const db = await abrir();
  const registro = await db.get("projetos", id);
  if (!registro) return null;
  return { registro, ifc: (await db.get("modelos", id))?.ifc ?? null };
}

/** Grava o registro; o IFC só quando informado (ele não muda depois de criado). */
export async function gravarProjeto(r: RegistroProjeto, ifc?: Blob | null): Promise<void> {
  const db = await abrir();
  const tx = db.transaction(["projetos", "modelos"], "readwrite");
  await tx.objectStore("projetos").put(r);
  if (ifc) await tx.objectStore("modelos").put({ id: r.id, ifc });
  await tx.done;
}

export async function excluirProjeto(id: string): Promise<void> {
  const db = await abrir();
  const tx = db.transaction(["projetos", "modelos"], "readwrite");
  await tx.objectStore("projetos").delete(id);
  await tx.objectStore("modelos").delete(id);
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
