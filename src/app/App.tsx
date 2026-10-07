import { useEffect, useState } from "react";
import { ErroAmigavel } from "../components/ErroAmigavel";
import { PainelLateral } from "../components/PainelLateral";
import { SeletorArquivo } from "../components/SeletorArquivo";
import { TelaInicial } from "../components/TelaInicial";
import { Timeline } from "../components/Timeline";
import { Viewport } from "../components/Viewport";
import { DICA_CRONO, DICA_IFC, abrirCronograma, abrirIfc } from "../components/acoesArquivo";
import { useProjeto } from "../state/projectStore";

type Tema = "claro" | "escuro";

function temaInicial(): Tema {
  try {
    const salvo = localStorage.getItem("c4d-tema");
    if (salvo === "claro" || salvo === "escuro") return salvo;
  } catch {
    /* armazenamento indisponível */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

export function App() {
  const temModelo = useProjeto((s) => s.elementos.length > 0);
  const carga = useProjeto((s) => s.carga);
  const arquivoModelo = useProjeto((s) => s.arquivoModelo);
  const demo = useProjeto((s) => s.demoModelo || s.demoCronograma);
  const nElementos = useProjeto((s) => s.elementos.length);
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    try {
      localStorage.setItem("c4d-tema", tema);
    } catch {
      /* armazenamento indisponível */
    }
  }, [tema]);

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <div className="brasao" aria-hidden>4D</div>
          <div className="titulo-bloco">
            <h1>Construction 4D Studio</h1>
            <span className="sub">{arquivoModelo ? `${arquivoModelo} · ${nElementos} elementos` : "Modelo IFC + cronograma = obra no tempo"}</span>
          </div>
          {demo && (
            <span className="selo selo-demo" data-testid="selo-demo" role="status" aria-label="Demonstração: dados fictícios" style={{ ["--cor" as string]: "var(--latao)" }} data-tip="Dados fictícios de demonstração: casa e cronograma não são de uma obra real.">
              <span className="pt" />
              <span className="longo" aria-hidden>DEMONSTRAÇÃO</span>
              <span className="curto" aria-hidden>DEMO</span>
            </span>
          )}
          <div className="topo-acoes">
            {temModelo && (
              <>
                <SeletorArquivo aceitar=".ifc" rotulo="Abrir IFC" dica={DICA_IFC} aoEscolher={abrirIfc} />
                <SeletorArquivo aceitar=".csv,.json,.txt" rotulo="Cronograma" dica={DICA_CRONO} aoEscolher={abrirCronograma} />
              </>
            )}
            <button type="button" className="btn" aria-label={`Mudar para tema ${tema === "claro" ? "escuro" : "claro"}`} data-tip="Alterna entre os temas claro e escuro." onClick={() => setTema(tema === "claro" ? "escuro" : "claro")}>
              {tema === "claro" ? "☾" : "☀"}
            </button>
          </div>
        </div>
      </header>

      <ErroAmigavel />

      {temModelo ? (
        <main className="estudio">
          <Viewport />
          <PainelLateral />
          <Timeline />
        </main>
      ) : (
        <TelaInicial />
      )}

      {carga && (
        <div className="carga" role="status" aria-live="polite" data-testid="carga">
          <div className="carga-caixa">
            <strong>{carga.etapa}</strong>
            <div className="barra-progresso">
              <span style={{ width: `${Math.round(carga.fracao * 100)}%` }} />
            </div>
            <span className="num">{Math.round(carga.fracao * 100)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
