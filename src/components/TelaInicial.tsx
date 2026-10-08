import { useEffect, useState } from "react";
import { abrirDemonstracao, demonstracaoDisponivel } from "../app/carregamento";
import { SLOGAN } from "../app/marca";
import { useProjeto } from "../state/projectStore";
import { useUi } from "../state/uiStore";
import { SeletorArquivo } from "./SeletorArquivo";
import { ACEITA_CRONO, DICA_CRONO, DICA_IFC, abrirCronograma, abrirIfc } from "./acoesArquivo";

/** Tela inicial em três passos (§32). */
export function TelaInicial() {
  const [temDemo, setTemDemo] = useState(false);
  const [temSobrado, setTemSobrado] = useState(false);
  const cronograma = useProjeto((s) => s.cronograma);
  const arquivoCronograma = useProjeto((s) => s.arquivoCronograma);
  const abrir = useUi((s) => s.abrir);

  useEffect(() => {
    demonstracaoDisponivel("casa").then(setTemDemo);
    demonstracaoDisponivel("sobrado").then(setTemSobrado);
  }, []);

  return (
    <div className="inicial">
      <div className="inicial-in">
        <h1>Construction 4D Studio</h1>
        <p className="slogan-inicial" data-testid="slogan-inicial">{SLOGAN}</p>
        <p className="lede">Carregue o modelo IFC e o cronograma da obra para ver a casa sendo construída dia a dia. Tudo é processado e salvo neste navegador.</p>

        <section className="bloco planilha-inicial" style={{ ["--acento" as string]: "var(--latao)" }}>
          <header>
            <h2>Planilha da obra</h2>
            <a className="link" href="modelos/obra-dani.xlsx" download data-testid="baixar-planilha-modelo">
              Baixar planilha modelo
            </a>
          </header>
          <div className="botoes">
            <SeletorArquivo aceitar=".xlsx" rotulo="Abrir planilha" dica="Planilha única da obra (.xlsx), com as abas Obra, Modelo, Cronograma, Falas, Fotos, Vídeo e Documento." classe="btn primario" testId="entrada-planilha" aoEscolher={abrirCronograma} />
          </div>
        </section>

        <ol className="passos">
          <li className="bloco" style={{ ["--acento" as string]: "var(--ardosia)" }}>
            <header>
              <h2>1. Projeto</h2>
              <span className="legenda">obrigatório</span>
            </header>
            <p>Modelo BIM em IFC ou, sem IFC, um modelo paramétrico simplificado.</p>
            <div className="botoes">
              <SeletorArquivo aceitar=".ifc" rotulo="Carregar IFC" dica={DICA_IFC} classe="btn primario" testId="entrada-ifc" aoEscolher={abrirIfc} />
              <button
                type="button"
                className="btn"
                data-testid="abrir-parametrico"
                data-tip="Gera uma casa simplificada a partir do terreno, da área, dos pavimentos, do pé-direito e da cobertura. Serve para animar, não é projeto executivo."
                onClick={() => abrir({ parametrico: true })}
              >
                Criar modelo paramétrico
              </button>
            </div>
          </li>
          <li className="bloco" style={{ ["--acento" as string]: "var(--musgo)" }}>
            <header>
              <h2>2. Cronograma</h2>
              <span className="legenda">{cronograma ? `${cronograma.tarefas.length} tarefas · ${arquivoCronograma}` : "pode vir antes ou depois do modelo"}</span>
            </header>
            <p>
              Etapas da obra com datas de início e fim, em CSV, XLSX ou JSON, ou criadas aqui.{" "}
              <button type="button" className="link" data-testid="abrir-modelos" onClick={() => abrir({ modelos: true })}>
                Baixar modelos preenchidos
              </button>
            </p>
            <div className="botoes">
              <SeletorArquivo aceitar={ACEITA_CRONO} rotulo="Carregar cronograma" dica={DICA_CRONO} testId="entrada-cronograma" aoEscolher={abrirCronograma} />
              <button type="button" className="btn" data-testid="criar-cronograma-inicial" onClick={() => abrir({ tarefa: "" })}>
                Criar cronograma
              </button>
              <button type="button" className="btn" data-testid="estimar-inicial" data-tip="Sugere etapas e datas a partir da área, dos pavimentos, da estrutura e do prazo. É uma estimativa, não cronograma executivo." onClick={() => abrir({ estimativa: true })}>
                Gerar estimativa
              </button>
            </div>
          </li>
          <li className="bloco" style={{ ["--acento" as string]: "var(--latao)" }}>
            <header>
              <h2>3. Simulação</h2>
            </header>
            <p>A simulação abre assim que o modelo é carregado; os elementos são ligados às tarefas automaticamente, pela categoria de cada uma. Projetos anteriores ficam em Projetos, no alto.</p>
            {temDemo && (
              <button
                type="button"
                className="btn"
                data-testid="abrir-demo"
                data-tip={"Abre uma casa térrea de 10 × 18 m com sala de pé-direito duplo e um cronograma de 180 dias em 15 etapas.\nDados fictícios, marcados com o selo DEMONSTRAÇÃO."}
                onClick={() => abrirDemonstracao("casa")}
              >
                Abrir demonstração
              </button>
            )}
            {temSobrado && (
              <button
                type="button"
                className="btn"
                data-testid="abrir-sobrado"
                data-tip={"Abre um sobrado de 8 × 12 m em dois pavimentos, com escada e telhado de duas águas, e um cronograma de 270 dias com tarefas por pavimento.\nDados fictícios, marcados com o selo DEMONSTRAÇÃO."}
                onClick={() => abrirDemonstracao("sobrado")}
              >
                Abrir sobrado de exemplo
              </button>
            )}
          </li>
        </ol>
      </div>
    </div>
  );
}
