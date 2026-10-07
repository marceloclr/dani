import { useEffect, useState } from "react";
import { REGRAS_PADRAO } from "../fourd/regras";
import { formatarISO, lerData } from "../fourd/tempo";
import { useProjeto } from "../state/projectStore";
import { Modal } from "./Modal";

const CATEGORIAS = Object.keys(REGRAS_PADRAO);
const ROTULO: Record<string, string> = {
  terreno: "Terreno",
  fundacao: "Fundação",
  estrutura: "Estrutura",
  alvenaria: "Alvenaria",
  laje: "Laje",
  cobertura: "Cobertura",
  instalacoes: "Instalações",
  reboco: "Reboco",
  esquadrias: "Esquadrias",
  revestimento: "Revestimento de pisos",
  pintura: "Pintura",
  loucas: "Louças e metais",
  paisagismo: "Paisagismo",
};

interface Props {
  /** null fecha; "" cria uma tarefa nova; um id edita essa tarefa. */
  tarefaId: string | null;
  aoFechar(): void;
}

/** Criar e editar tarefas na tela (§12, §32), com a validação do §41. */
export function ModalTarefa({ tarefaId, aoFechar }: Props) {
  const cronograma = useProjeto((s) => s.cronograma);
  const st = useProjeto.getState;
  const editando = tarefaId ? cronograma?.tarefas.find((t) => t.id === tarefaId) : undefined;
  const [id, setId] = useState("");
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("alvenaria");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (tarefaId === null) return;
    setErro(null);
    if (editando && cronograma) {
      setId(editando.id);
      setNome(editando.nome);
      setCategoria(editando.categoria);
      setInicio(formatarISO(cronograma.inicio + editando.ini));
      setFim(formatarISO(cronograma.inicio + editando.fim));
    } else {
      // nova: começa no dia seguinte ao fim da última tarefa (ou hoje)
      const ultimo = cronograma ? cronograma.inicio + Math.max(...cronograma.tarefas.map((t) => t.fim)) + 1 : lerData(new Date().toLocaleDateString("sv-SE"))!;
      setId(`T-${String((cronograma?.tarefas.length ?? 0) + 1).padStart(2, "0")}`);
      setNome("");
      setCategoria("alvenaria");
      setInicio(formatarISO(ultimo));
      setFim(formatarISO(ultimo + 9));
    }
  }, [tarefaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const i = lerData(inicio), f = lerData(fim);
    const msg = st().salvarTarefa({ id, nome, categoria, inicio: i ?? NaN, fim: f ?? NaN }, editando ? editando.id : null);
    if (msg) setErro(msg);
    else aoFechar();
  };

  return (
    <Modal aberto={tarefaId !== null} titulo={editando ? "Editar tarefa" : "Nova tarefa"} aoFechar={aoFechar} largura={460} testId="modal-tarefa">
      <form className="form" onSubmit={salvar}>
        <div className="linha-campos">
          <label className="campo">
            <span>ID</span>
            <input value={id} onChange={(e) => setId(e.target.value)} required data-testid="tarefa-id" />
          </label>
          <label className="campo" data-tip="A categoria decide quais elementos entram na tarefa (regras automáticas).">
            <span>Categoria</span>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} data-testid="tarefa-categoria">
              {[...new Set([...CATEGORIAS, categoria])].filter((c) => c !== "outra").map((c) => (
                <option key={c} value={c}>
                  {ROTULO[c] ?? c}
                </option>
              ))}
              <option value="outra">Outra (sem regra)</option>
            </select>
          </label>
        </div>
        <label className="campo">
          <span>Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Ex.: Alvenaria do térreo" data-testid="tarefa-nome" />
        </label>
        <div className="linha-campos">
          <label className="campo">
            <span>Início</span>
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} required data-testid="tarefa-inicio" />
          </label>
          <label className="campo">
            <span>Fim (inclusive)</span>
            <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} required data-testid="tarefa-fim" />
          </label>
        </div>
        {erro && (
          <p className="aviso-honesto erro-form" role="alert">
            {erro}
          </p>
        )}
        <div className="botoes fim">
          {editando && (
            <button
              type="button"
              className="btn perigo"
              onClick={() => {
                st().excluirTarefa(editando.id);
                aoFechar();
              }}
            >
              Excluir tarefa
            </button>
          )}
          <span className="espaco" />
          <button type="button" className="btn" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn primario" data-testid="tarefa-salvar">
            Salvar
          </button>
        </div>
      </form>
    </Modal>
  );
}
