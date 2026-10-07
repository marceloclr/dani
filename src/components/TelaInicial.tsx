import { useEffect, useState } from "react";
import { abrirDemonstracao, demonstracaoDisponivel } from "../app/carregamento";
import { useProjeto } from "../state/projectStore";
import { SeletorArquivo } from "./SeletorArquivo";
import { DICA_CRONO, DICA_IFC, abrirCronograma, abrirIfc } from "./acoesArquivo";

/** Tela inicial em três passos (§32). */
export function TelaInicial() {
  const [temDemo, setTemDemo] = useState(false);
  const cronograma = useProjeto((s) => s.cronograma);
  const arquivoCronograma = useProjeto((s) => s.arquivoCronograma);

  useEffect(() => {
    demonstracaoDisponivel().then(setTemDemo);
  }, []);

  return (
    <div className="inicial">
      <div className="inicial-in">
        <p className="kicker">Simulação 4D de obras residenciais</p>
        <h1>Construction 4D Studio</h1>
        <p className="lede">Carregue o modelo IFC e o cronograma da obra para ver a casa sendo construída dia a dia. Tudo é processado neste navegador.</p>

        <ol className="passos">
          <li className="bloco" style={{ ["--acento" as string]: "var(--ardosia)" }}>
            <header>
              <h2>1. Projeto</h2>
              <span className="legenda">obrigatório</span>
            </header>
            <p>Modelo BIM da residência em IFC.</p>
            <SeletorArquivo aceitar=".ifc" rotulo="Carregar IFC" dica={DICA_IFC} classe="btn primario" testId="entrada-ifc" aoEscolher={abrirIfc} />
          </li>
          <li className="bloco" style={{ ["--acento" as string]: "var(--musgo)" }}>
            <header>
              <h2>2. Cronograma</h2>
              <span className="legenda">{cronograma ? `${cronograma.tarefas.length} tarefas · ${arquivoCronograma}` : "pode vir antes ou depois do modelo"}</span>
            </header>
            <p>Etapas da obra com datas de início e fim.</p>
            <SeletorArquivo aceitar=".csv,.json,.txt" rotulo="Carregar cronograma" dica={DICA_CRONO} testId="entrada-cronograma" aoEscolher={abrirCronograma} />
          </li>
          <li className="bloco" style={{ ["--acento" as string]: "var(--latao)" }}>
            <header>
              <h2>3. Simulação</h2>
            </header>
            <p>A simulação abre assim que o modelo é carregado; os elementos são ligados às tarefas automaticamente, pela categoria de cada uma.</p>
            {temDemo && (
              <button
                type="button"
                className="btn"
                data-testid="abrir-demo"
                data-tip={"Abre uma casa térrea de 10 × 18 m com sala de pé-direito duplo e um cronograma de 180 dias em 15 etapas.\nDados fictícios, marcados com o selo DEMONSTRAÇÃO."}
                onClick={abrirDemonstracao}
              >
                Abrir demonstração
              </button>
            )}
          </li>
        </ol>
      </div>
    </div>
  );
}
