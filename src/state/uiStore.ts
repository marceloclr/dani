// Estado só de interface: quais diálogos estão abertos.
import { create } from "zustand";

interface Ui {
  projetos: boolean;
  parametrico: boolean;
  /** null: fechado; "": nova tarefa; id: editar essa tarefa. */
  tarefa: string | null;
  /** id da foto aberta no visualizador */
  foto: string | null;
  modelos: boolean;
  estimativa: boolean;
  abrir(p: Partial<Pick<Ui, "projetos" | "parametrico" | "tarefa" | "foto" | "modelos" | "estimativa">>): void;
}

export const useUi = create<Ui>((set) => ({
  projetos: false,
  parametrico: false,
  tarefa: null,
  foto: null,
  modelos: false,
  estimativa: false,
  abrir: (p) => set(p),
}));
