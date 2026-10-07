// Estado só de interface: quais diálogos estão abertos.
import { create } from "zustand";

interface Ui {
  projetos: boolean;
  parametrico: boolean;
  /** null: fechado; "": nova tarefa; id: editar essa tarefa. */
  tarefa: string | null;
  abrir(p: Partial<Pick<Ui, "projetos" | "parametrico" | "tarefa">>): void;
}

export const useUi = create<Ui>((set) => ({
  projetos: false,
  parametrico: false,
  tarefa: null,
  abrir: (p) => set(p),
}));
