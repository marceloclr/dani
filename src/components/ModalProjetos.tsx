import { useEffect, useRef, useState } from "react";
import {
  abrirProjeto,
  duplicarProjeto,
  excluir,
  exportarCronogramaCsv,
  exportarCronogramaJson,
  exportarMapeamentoJson,
  exportarProjeto,
  importarProjeto,
  listarProjetos,
  novoProjeto,
  salvarCopia,
} from "../app/projetos";
import type { RegistroProjeto } from "../storage/projeto";
import { useProjeto } from "../state/projectStore";
import { Modal } from "./Modal";
import { useUi } from "../state/uiStore";

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Projetos salvos neste navegador (§37) e exportações (§38, §39). */
export function ModalProjetos({ aberto, aoFechar }: { aberto: boolean; aoFechar(): void }) {
  const projetoId = useProjeto((s) => s.projetoId);
  const nomeProjeto = useProjeto((s) => s.nomeProjeto);
  const salvoEm = useProjeto((s) => s.salvoEm);
  const persistencia = useProjeto((s) => s.persistencia);
  const temModelo = useProjeto((s) => s.elementos.length > 0);
  const temCronograma = useProjeto((s) => !!s.cronograma);
  const st = useProjeto.getState;
  const [lista, setLista] = useState<RegistroProjeto[]>([]);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const recarregar = () => listarProjetos().then(setLista).catch(() => setLista([]));
  useEffect(() => {
    if (aberto) {
      setConfirmar(null);
      void recarregar();
    }
  }, [aberto, salvoEm]);

  const fecharE = (f: () => Promise<unknown> | void) => async () => {
    await f();
    aoFechar();
  };

  return (
    <Modal aberto={aberto} titulo="Projetos" aoFechar={aoFechar} largura={680} testId="modal-projetos">
      {temModelo && (
        <section className="projeto-atual">
          <div className="linha-campos">
            <label className="campo">
              <span>Projeto aberto</span>
              <input value={nomeProjeto ?? ""} onChange={(e) => st().definirProjeto({ nomeProjeto: e.target.value })} disabled={!projetoId} data-testid="nome-projeto" />
            </label>
            <div className="campo">
              <span>Situação</span>
              <span className="situacao" data-testid="situacao-projeto">
                {projetoId ? (salvoEm ? `Salvo neste navegador às ${new Date(salvoEm).toLocaleTimeString("pt-BR", { timeStyle: "short" })}` : "Salvando…") : "Não salvo (demonstração)"}
              </span>
            </div>
          </div>
          {projetoId && persistencia === false && <p className="aviso-honesto">O navegador não garantiu o armazenamento: ele pode apagar os projetos se faltar espaço. Exporte um .4dstudio para guardar uma cópia.</p>}
          <div className="botoes">
            {!projetoId && (
              <button type="button" className="btn primario" data-testid="salvar-copia" onClick={fecharE(salvarCopia)}>
                Salvar cópia
              </button>
            )}
            <button type="button" className="btn" data-testid="exportar-atual" data-tip="Baixa o projeto completo (.4dstudio), com o modelo, o cronograma e as exceções." onClick={() => exportarProjeto(projetoId)}>
              Exportar .4dstudio
            </button>
            <button type="button" className="btn" disabled={!temCronograma} onClick={exportarCronogramaJson}>
              Cronograma JSON
            </button>
            <button type="button" className="btn" disabled={!temCronograma} data-tip="CSV com ponto e vírgula, pronto para o Excel." onClick={exportarCronogramaCsv}>
              Cronograma CSV
            </button>
            <button type="button" className="btn" disabled={!temCronograma} data-tip="Regras, exceções e os elementos de cada tarefa." onClick={exportarMapeamentoJson}>
              Mapeamento JSON
            </button>
          </div>
        </section>
      )}

      <div className="botoes">
        <button type="button" className="btn" data-testid="novo-projeto" data-tip="Volta à tela inicial. O projeto aberto continua salvo." onClick={fecharE(novoProjeto)}>
          Novo projeto
        </button>
        <button type="button" className="btn" data-testid="importar-projeto" onClick={() => entrada.current?.click()}>
          Importar .4dstudio
        </button>
        <button type="button" className="btn" data-testid="modelos-projetos" data-tip="Modelos de cronograma (CSV, XLSX, JSON), de fotos e um projeto de exemplo, preenchidos." onClick={() => (aoFechar(), useUi.getState().abrir({ modelos: true }))}>
          Modelos de arquivo
        </button>
        <input
          ref={entrada}
          type="file"
          accept=".4dstudio,.zip"
          hidden
          data-testid="entrada-4dstudio"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f && (await importarProjeto(f))) aoFechar();
          }}
        />
      </div>

      <h3 className="lista-titulo">Salvos neste navegador</h3>
      {lista.length === 0 ? (
        <p className="tenue">Nenhum projeto salvo ainda. Carregar um IFC ou criar um modelo paramétrico cria um projeto automaticamente.</p>
      ) : (
        <ul className="lista-projetos" data-testid="lista-projetos">
          {lista.map((r) => (
            <li key={r.id} className={r.id === projetoId ? "atual" : ""}>
              <div className="info">
                <strong>{r.nome}</strong>
                <span className="tenue pequeno">
                  {r.modelo.tipo === "IFC" ? `IFC · ${r.modelo.arquivo}` : "Paramétrico"} · {r.cronograma ? `${r.cronograma.tarefas.length} tarefas` : "sem cronograma"} · alterado em {quando(r.atualizadoEm)}
                  {r.demo ? " · demonstração" : ""}
                </span>
              </div>
              {confirmar === r.id ? (
                <div className="botoes">
                  <span className="pequeno">Excluir de vez?</span>
                  <button
                    type="button"
                    className="btn perigo mini"
                    data-testid="confirmar-exclusao"
                    onClick={async () => {
                      await excluir(r.id);
                      setConfirmar(null);
                      void recarregar();
                    }}
                  >
                    Excluir
                  </button>
                  <button type="button" className="btn mini" onClick={() => setConfirmar(null)}>
                    Manter
                  </button>
                </div>
              ) : (
                <div className="botoes">
                  <button type="button" className="btn mini" disabled={r.id === projetoId} data-testid="abrir-projeto" onClick={fecharE(() => abrirProjeto(r.id))}>
                    {r.id === projetoId ? "Aberto" : "Abrir"}
                  </button>
                  <button type="button" className="btn mini" onClick={async () => (await duplicarProjeto(r.id), recarregar())}>
                    Duplicar
                  </button>
                  <button type="button" className="btn mini" onClick={() => exportarProjeto(r.id)}>
                    Exportar
                  </button>
                  <button type="button" className="btn mini" data-testid="excluir-projeto" onClick={() => setConfirmar(r.id)}>
                    Excluir
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
