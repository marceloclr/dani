import { CLIENTE } from "./marca";
import { Monograma } from "../components/Monograma";
import { useEffect, useState } from "react";
import { ErroAmigavel } from "../components/ErroAmigavel";
import { ModalParametrico } from "../components/ModalParametrico";
import { ModalProjetos } from "../components/ModalProjetos";
import { ModalTarefa } from "../components/ModalTarefa";
import { ModalFoto } from "../components/ModalFoto";
import { ModalModelos } from "../components/ModalModelos";
import { ModalEstimativa } from "../components/ModalEstimativa";
import { carregarFeriados } from "../storage/IndexedDb";
import { PainelLateral } from "../components/PainelLateral";
import { SeletorArquivo } from "../components/SeletorArquivo";
import { TelaInicial } from "../components/TelaInicial";
import { Timeline } from "../components/Timeline";
import { Viewport } from "../components/Viewport";
import { ACEITA_CRONO, DICA_CRONO, DICA_IFC, abrirCronograma, abrirIfc } from "../components/acoesArquivo";
import { useProjeto } from "../state/projectStore";
import { useUi } from "../state/uiStore";
import { iniciarGravacaoAutomatica } from "./projetos";

type Tema = "claro" | "escuro";

/** Chave gravada só quando o usuário escolhe o tema no botão (a antiga, "c4d-tema", guardava a preferência do sistema). */
const CHAVE_TEMA = "c4d-tema-escolhido";

/** Claro por padrão, qualquer que seja a preferência do sistema; o escuro vale só se o usuário o escolheu. */
function temaInicial(): Tema {
  try {
    if (localStorage.getItem(CHAVE_TEMA) === "escuro") return "escuro";
  } catch {
    /* armazenamento indisponível */
  }
  return "claro";
}

function escolherTema(t: Tema): void {
  try {
    localStorage.setItem(CHAVE_TEMA, t);
  } catch {
    /* armazenamento indisponível */
  }
}

export function App() {
  const temModelo = useProjeto((s) => s.elementos.length > 0);
  const carga = useProjeto((s) => s.carga);
  const nomeProjeto = useProjeto((s) => s.nomeProjeto);
  const projetoId = useProjeto((s) => s.projetoId);
  const salvoEm = useProjeto((s) => s.salvoEm);
  const demo = useProjeto((s) => s.demoModelo || s.demoCronograma);
  const parametrico = useProjeto((s) => s.tipoModelo === "PARAMETRICO");
  const estimado = useProjeto((s) => !!s.cronograma?.estimado);
  const nElementos = useProjeto((s) => s.elementos.length);
  const ui = useUi();
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => iniciarGravacaoAutomatica(), []);

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
  }, [tema]);

  // feriados de 2026 a 2030 no banco local (ADR-22); sem banco, a estimativa usa a base em memória
  useEffect(() => {
    carregarFeriados().catch(() => undefined);
  }, []);

  const salvo = projetoId ? (salvoEm ? `salvo às ${new Date(salvoEm).toLocaleTimeString("pt-BR", { timeStyle: "short" })}` : "salvando…") : "não salvo";
  const situacao = !temModelo ? "Modelo IFC + cronograma = obra no tempo" : `${nomeProjeto ?? "Projeto"} · ${nElementos} elementos · ${salvo}`;

  return (
    <div className="app">
      <header className="topo">
        <div className="topo-linha">
          <div className="marca-topo" data-testid="marca-topo" data-tip={`${CLIENTE.empresa} · ${CLIENTE.slogan}\nConstruction 4D Studio`}>
            <Monograma tamanho={38} titulo={`Monograma ${CLIENTE.empresa}`} />
            <div className="marca-topo-texto">
              <h1>{CLIENTE.nome.toLocaleUpperCase("pt-BR")}</h1>
              <span className="slogan-topo">Simulação 4D de obras residenciais</span>
            </div>
          </div>
          <div className="titulo-bloco">
            <span className="sub" data-testid="situacao">{situacao}</span>
          </div>
          {demo && (
            <span className="selo selo-demo" data-testid="selo-demo" role="status" aria-label="Demonstração: dados fictícios" style={{ ["--cor" as string]: "var(--latao)" }} data-tip="Dados fictícios de demonstração: casa e cronograma não são de uma obra real.">
              <span className="pt" />
              <span className="longo" aria-hidden>DEMONSTRAÇÃO</span>
              <span className="curto" aria-hidden>DEMO</span>
            </span>
          )}
          {parametrico && (
            <span className="selo selo-param" data-testid="selo-parametrico" role="status" aria-label="Modelo paramétrico" style={{ ["--cor" as string]: "var(--ardosia)" }} data-tip="Modelo paramétrico: representação simplificada para animação 4D, não é projeto executivo.">
              <span className="pt" />
              <span className="longo" aria-hidden>PARAMÉTRICO</span>
              <span className="curto" aria-hidden>PARAM.</span>
            </span>
          )}
          {estimado && (
            <span className="selo selo-estimativa" data-testid="selo-estimativa" role="status" aria-label="Cronograma estimado" style={{ ["--cor" as string]: "var(--ocre)" }} data-tip="Cronograma gerado automaticamente (§13): estimativa para simular, não é cronograma executivo.">
              <span className="pt" />
              <span className="longo" aria-hidden>ESTIMATIVA</span>
              <span className="curto" aria-hidden>EST.</span>
            </span>
          )}
          <div className="topo-acoes">
            <span
              className="versao-topo mono"
              data-testid="versao-publicada"
              aria-label={`Versão publicada ${__VERSAO_PUBLICADA__}`}
              data-tip={
                __VERSAO_PUBLICADA__ === "local"
                  ? "Versão de desenvolvimento: o carimbo de data e hora só é gravado na publicação."
                  : `Versão publicada em ${__VERSAO_PUBLICADA__.slice(0, 2)}/${__VERSAO_PUBLICADA__.slice(2, 4)}/${__VERSAO_PUBLICADA__.slice(4, 8)}, às ${__VERSAO_PUBLICADA__.slice(9, 11)}h${__VERSAO_PUBLICADA__.slice(11, 13)} (horário de Fortaleza).\nFormato: DDMMAAAA-HHMM, gravado no momento da compilação que foi ao ar.`
              }
            >
              v. {__VERSAO_PUBLICADA__}
            </span>
            <button type="button" className="btn" data-testid="abrir-projetos" data-tip="Projetos salvos neste navegador: abrir, duplicar, exportar, importar e excluir." onClick={() => ui.abrir({ projetos: true })}>
              Projetos
            </button>
            {temModelo && (
              <>
                <SeletorArquivo aceitar=".ifc" rotulo="Abrir IFC" dica={DICA_IFC} aoEscolher={abrirIfc} />
                <SeletorArquivo aceitar={ACEITA_CRONO} rotulo="Cronograma" dica={DICA_CRONO} aoEscolher={abrirCronograma} />
              </>
            )}
            <button type="button" className="btn" aria-label={`Mudar para tema ${tema === "claro" ? "escuro" : "claro"}`} data-tip="Alterna entre os temas claro e escuro." onClick={() => {
                const novo = tema === "claro" ? "escuro" : "claro";
                escolherTema(novo);
                setTema(novo);
              }}
            >
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

      <ModalProjetos aberto={ui.projetos} aoFechar={() => ui.abrir({ projetos: false })} />
      <ModalParametrico aberto={ui.parametrico} aoFechar={() => ui.abrir({ parametrico: false })} />
      <ModalTarefa tarefaId={ui.tarefa} aoFechar={() => ui.abrir({ tarefa: null })} />
      <ModalFoto />
      <ModalModelos aberto={ui.modelos} aoFechar={() => ui.abrir({ modelos: false })} />
      <ModalEstimativa aberto={ui.estimativa} aoFechar={() => ui.abrir({ estimativa: false })} />

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
