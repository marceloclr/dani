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

iniciarDicas();
(window as unknown as { __projeto?: typeof useProjeto }).__projeto = useProjeto; // testes de ponta a ponta

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
