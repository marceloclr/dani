// Fronteira entre o leitor de IFC e o resto do app (ADR-01).
// O adaptador atual usa web-ifc num Web Worker; um adaptador Fragments pode substituí-lo depois.
import type { ElementoMeta } from "../types";
import type { MalhaElemento, ModeloLido } from "./parseIfc";

export interface ModelAdapter {
  load(arquivo: ArrayBuffer, onProgress: (fracao: number, etapa: string) => void): Promise<ModeloLido>;
  dispose(): void;
}

export class ErroCarga extends Error {
  constructor(mensagem: string, readonly detalhes: string | null) {
    super(mensagem);
  }
}

export class WebIfcWorkerAdapter implements ModelAdapter {
  private worker: Worker | null = null;

  load(arquivo: ArrayBuffer, onProgress: (fracao: number, etapa: string) => void): Promise<ModeloLido> {
    this.worker ??= new Worker(new URL("./ifc.worker.ts", import.meta.url), { type: "module" });
    const worker = this.worker;
    const wasmUrl = new URL("wasm/", document.baseURI).href;
    return new Promise((resolve, reject) => {
      worker.onmessage = (ev) => {
        const m = ev.data;
        if (m.tipo === "progresso") onProgress(m.fracao, m.etapa);
        else if (m.tipo === "pronto") resolve(m.modelo as ModeloLido);
        else if (m.tipo === "erro") reject(new ErroCarga(m.mensagem, m.detalhes));
      };
      worker.onerror = (ev) => reject(new ErroCarga("O leitor de IFC falhou ao iniciar.", ev.message || "Erro no Web Worker."));
      worker.postMessage({ tipo: "carregar", bytes: arquivo, wasmUrl }, [arquivo]);
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}

export type { ElementoMeta, MalhaElemento, ModeloLido };
