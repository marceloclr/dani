import { useEffect, useMemo, useState } from "react";
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
  const [inicioReal, setInicioReal] = useState("");
  const [fimReal, setFimReal] = useState("");
  const [avanco, setAvanco] = useState("");
  const [pavimento, setPavimento] = useState("");
  const elementos = useProjeto((s) => s.elementos);
  const pavimentosModelo = useMemo(() => [...new Set(elementos.map((e) => e.pavimento).filter((p): p is string => !!p && p !== "Lote"))], [elementos]);
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
      setInicioReal(editando.realIni !== undefined ? formatarISO(cronograma.inicio + editando.realIni) : "");
      setFimReal(editando.realFim !== undefined ? formatarISO(cronograma.inicio + editando.realFim) : "");
      setAvanco(editando.avanco !== undefined ? String(Math.round(editando.avanco * 100)) : "");
      setPavimento(editando.pavimento ?? "");
    } else {
      // nova: começa no dia seguinte ao fim da última tarefa (ou hoje)
      const ultimo = cronograma ? cronograma.inicio + Math.max(...cronograma.tarefas.map((t) => t.fim)) + 1 : lerData(new Date().toLocaleDateString("sv-SE"))!;
      setId(`T-${String((cronograma?.tarefas.length ?? 0) + 1).padStart(2, "0")}`);
      setNome("");
      setCategoria("alvenaria");
      setInicio(formatarISO(ultimo));
      setFim(formatarISO(ultimo + 9));
      setInicioReal("");
      setFimReal("");
      setAvanco("");
      setPavimento("");
    }
  }, [tarefaId]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const i = lerData(inicio), f = lerData(fim);
    const ri = inicioReal ? lerData(inicioReal) : undefined;
    const rf = fimReal ? lerData(fimReal) : undefined;
    const av = avanco.trim() === "" ? undefined : Number(avanco.replace(",", ".")) / 100;
    const msg = st().salvarTarefa(
      { id, nome, categoria, inicio: i ?? NaN, fim: f ?? NaN, inicioReal: ri ?? undefined, fimReal: rf ?? undefined, avanco: av, pavimento: pavimento || undefined },
      editando ? editando.id : null,
    );
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
        <label className="campo" data-tip="Limita as regras automáticas desta tarefa aos elementos de um pavimento. Em branco, vale para o prédio inteiro.">
          <span>Pavimento</span>
          <select value={pavimento} onChange={(e) => setPavimento(e.target.value)} data-testid="tarefa-pavimento">
            <option value="">Todos</option>
            {[...new Set([...pavimentosModelo, ...(pavimento ? [pavimento] : [])])].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
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
        <fieldset className="real">
          <legend data-tip={"Opcional. Usado nas visões Real e Comparar, nos indicadores e no relatório.\nSem início real, a tarefa conta como não iniciada."}>Execução real (opcional)</legend>
          <div className="linha-campos tres">
            <label className="campo">
              <span>Início real</span>
              <input type="date" value={inicioReal} onChange={(e) => setInicioReal(e.target.value)} data-testid="tarefa-inicio-real" />
            </label>
            <label className="campo">
              <span>Fim real</span>
              <input type="date" value={fimReal} onChange={(e) => setFimReal(e.target.value)} data-testid="tarefa-fim-real" />
            </label>
            <label className="campo" data-tip="Avanço físico medido na obra, de 0 a 100%. Vazio: deduzido das datas reais.">
              <span>Avanço (%)</span>
              <input type="number" min={0} max={100} step={1} value={avanco} onChange={(e) => setAvanco(e.target.value)} data-testid="tarefa-avanco" />
            </label>
          </div>
        </fieldset>
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
