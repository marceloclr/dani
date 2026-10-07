/// <reference lib="webworker" />
// Web Worker do IFC: a leitura pesada não trava a interface (§10).
import { IfcAPI } from "web-ifc";
import { ErroIfc, lerIfc } from "./parseIfc";

export type MensagemParaWorker = { tipo: "carregar"; bytes: ArrayBuffer; wasmUrl: string };

let api: IfcAPI | null = null;

self.onmessage = async (ev: MessageEvent<MensagemParaWorker>) => {
  const { bytes, wasmUrl } = ev.data;
  try {
    if (!api) {
      api = new IfcAPI();
      api.SetWasmPath(wasmUrl, true);
      await api.Init(undefined, true); // monothread: não exige cabeçalhos COOP/COEP do servidor
    }
    const modelo = lerIfc(api, new Uint8Array(bytes), (fracao, etapa) => self.postMessage({ tipo: "progresso", fracao, etapa }));
    const transferir = modelo.malhas.flatMap((m) => [m.posicoes.buffer, m.normais.buffer, m.indices.buffer]);
    self.postMessage({ tipo: "pronto", modelo }, { transfer: transferir as ArrayBuffer[] });
  } catch (e) {
    const erro = e instanceof ErroIfc ? e : new ErroIfc("Não foi possível carregar o modelo IFC.", String((e as Error)?.stack ?? e));
    self.postMessage({ tipo: "erro", mensagem: erro.message, detalhes: erro.detalhes ?? null });
  }
};
