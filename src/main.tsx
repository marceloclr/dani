import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-serif/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./estilos/tokens.css";
import "./estilos/app.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { useProjeto } from "./state/projectStore";
import { iniciarDicas } from "./utils/dicas";
import { camadasPara, obterCena } from "./app/estadoCena";
import { poseDoPreset, type Preset } from "./rendering/cameras";

iniciarDicas();
(window as unknown as { __projeto?: typeof useProjeto }).__projeto = useProjeto; // testes de ponta a ponta
/** Ferramenta dos testes e do gerador de modelos: imagem da obra (visão real) num dia, como JPEG. */
(window as unknown as { __capturar?: unknown }).__capturar = async (dia: number, preset: Preset) => {
  const c = obterCena();
  if (!c) return null;
  const s = useProjeto.getState();
  c.silencioso = true;
  try {
    c.aplicar(camadasPara({ ...s, visao: "real" }, c, dia + 0.999, true));
    const b = await c.capturar(1280, 960, poseDoPreset(preset, c.enquadramento()));
    return Array.from(new Uint8Array(await b.arrayBuffer()));
  } finally {
    c.silencioso = false;
    c.aplicar(camadasPara(useProjeto.getState(), c, useProjeto.getState().dia));
  }
};

// nenhum erro fica escondido (§40, §49)
const avisar = (detalhes: string) =>
  useProjeto.getState().mostrarErro({ mensagem: "Algo deu errado.", orientacao: "Recarregue a página. Se o problema continuar, copie os detalhes técnicos.", detalhes });
window.addEventListener("error", (e) => avisar(String(e.error?.stack ?? e.message)));
window.addEventListener("unhandledrejection", (e) => avisar(String(e.reason?.stack ?? e.reason)));

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
