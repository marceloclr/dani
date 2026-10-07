import { useMemo, useState } from "react";
import { contarPorTarefa, descreverRegras } from "../fourd/regras";
import { estadoDe } from "../fourd/simulacao";
import { validarMapeamento } from "../fourd/validacao";
import { useProjeto } from "../state/projectStore";
import type { AcaoTarefa, PoliticaSemTarefa } from "../types";
import { PainelVideo } from "./PainelVideo";
import { PainelObra } from "./PainelObra";
import { useUi } from "../state/uiStore";

const NOME_ACAO: Record<AcaoTarefa, string> = {
  construct: "construção",
  finish: "acabamento",
  install: "instalação",
  temporary: "temporário",
  remove: "remoção",
};
const NOME_FASE = { oculto: "ainda não construído", "em-execucao": "em execução", concluido: "concluído", fantasma: "sem tarefa (fantasma)" };

export function PainelLateral() {
  const painel = useProjeto((s) => s.painel);
  const definir = useProjeto((s) => s.definirPainel);
  const nProblemas = useNumeroProblemas();
  const abas: { id: typeof painel; rotulo: string }[] = [
    { id: "tarefas", rotulo: "Tarefas" },
    { id: "elemento", rotulo: "Elemento" },
    { id: "validacao", rotulo: nProblemas ? `Avisos (${nProblemas})` : "Avisos" },
    { id: "obra", rotulo: "Obra" },
    { id: "video", rotulo: "Vídeo" },
  ];
  return (
    <aside className="painel" aria-label="Painel do projeto">
      <div className="segmentos" role="tablist">
        {abas.map((a) => (
          <button key={a.id} type="button" role="tab" className="seg" aria-selected={painel === a.id} data-testid={`aba-${a.id}`} onClick={() => definir(a.id)}>
            {a.rotulo}
          </button>
        ))}
      </div>
      <div className="painel-corpo">
        {painel === "tarefas" && <PainelTarefas />}
        {painel === "elemento" && <PainelElemento />}
        {painel === "validacao" && <PainelValidacao />}
        {painel === "obra" && <PainelObra />}
        {/* o painel de vídeo fica montado para não perder a geração em andamento nem o arquivo pronto */}
        <div hidden={painel !== "video"}>
          <PainelVideo />
        </div>
      </div>
    </aside>
  );
}

function useProblemas() {
  const cronograma = useProjeto((s) => s.cronograma);
  const elementos = useProjeto((s) => s.elementos);
  const vinculos = useProjeto((s) => s.vinculos);
  const importacao = useProjeto((s) => s.problemasImportacao);
  return useMemo(() => [...importacao, ...validarMapeamento(cronograma?.tarefas ?? [], elementos, vinculos)], [importacao, cronograma, elementos, vinculos]);
}
const useNumeroProblemas = () => useProblemas().length;

function PainelTarefas() {
  const cronograma = useProjeto((s) => s.cronograma);
  const vinculos = useProjeto((s) => s.vinculos);
  const excecoes = useProjeto((s) => s.excecoes);
  const politica = useProjeto((s) => s.politica);
  const tarefaIsolada = useProjeto((s) => s.tarefaIsolada);
  const st = useProjeto.getState;
  if (!cronograma) return <p className="tenue">Carregue ou crie um cronograma (na linha do tempo, abaixo) para ver as tarefas e os elementos ligados a cada uma.</p>;
  const contagem = contarPorTarefa(vinculos);

  return (
    <>
      <label className="campo bloco-campo" data-tip={"O que fazer com elementos que nenhuma tarefa faz surgir.\nFantasma: translúcido o tempo todo\nOculto: nunca aparece\nVisível: sempre como concluído"}>
        <span>Elementos sem tarefa</span>
        <select value={politica} onChange={(e) => st().definirPolitica(e.target.value as PoliticaSemTarefa)}>
          <option value="fantasma">Fantasma</option>
          <option value="oculto">Ocultos</option>
          <option value="visivel">Sempre visíveis</option>
        </select>
      </label>
      <button type="button" className="btn largo-topo" data-testid="nova-tarefa" onClick={() => useUi.getState().abrir({ tarefa: "" })}>
        + Nova tarefa
      </button>
      <ul className="lista-tarefas" data-testid="lista-tarefas">
        {cronograma.tarefas.map((t) => {
          const n = contagem.get(t.id) ?? 0;
          const regras = descreverRegras(t.categoria);
          const exc = excecoes.filter((x) => x.taskId === t.id);
          const inc = exc.filter((x) => x.modo === "include").length;
          const excl = exc.length - inc;
          return (
            <li key={t.id} className={`cartao${tarefaIsolada === t.id ? " destaque" : ""}`} data-testid={`tarefa-${t.id}`}>
              <div className="rotulo">
                {t.id} · {t.categoria || "sem categoria"}
              </div>
              <div className="tarefa-nome">{t.nome}</div>
              <div
                className={`valor reduzido calc${n === 0 ? " zero" : ""}`}
                tabIndex={0}
                data-testid={`contagem-${t.id}`}
                data-tip-t="Elementos associados"
                data-tip={`Fórmula: elementos das regras − exclusões + inclusões\nExclusões: ${excl}\nInclusões: ${inc}\nTotal: ${n}`}
              >
                {n} {n === 1 ? "elemento" : "elementos"}
              </div>
              <div className="nota">{regras.length ? `Regras: ${regras.join("; ")}` : "Nenhuma regra para esta categoria. Inclua elementos pela aba Elemento."}</div>
              <div className="botoes">
                <button type="button" className="btn mini" data-testid={`editar-${t.id}`} onClick={() => useUi.getState().abrir({ tarefa: t.id })}>
                  Editar
                </button>
                {n > 0 && (
                  <button type="button" className="btn mini" aria-pressed={tarefaIsolada === t.id} onClick={() => st().isolarTarefa(tarefaIsolada === t.id ? null : t.id)}>
                    {tarefaIsolada === t.id ? "Mostrar todos" : "Ver só estes"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function PainelElemento() {
  const guid = useProjeto((s) => s.selecionado);
  const elementos = useProjeto((s) => s.elementos);
  const vinculos = useProjeto((s) => s.vinculos);
  const cronograma = useProjeto((s) => s.cronograma);
  const politica = useProjeto((s) => s.politica);
  const dia = useProjeto((s) => Math.floor(s.dia));
  const st = useProjeto.getState;
  const [tarefaNova, setTarefaNova] = useState("");
  const [acaoNova, setAcaoNova] = useState<AcaoTarefa>("construct");

  const e = elementos.find((x) => x.guid === guid);
  if (!e) return <p className="tenue">Clique num elemento do modelo (com o modo Selecionar ligado) para ver seus dados e corrigir as tarefas ligadas a ele.</p>;
  const lista = vinculos.get(e.guid) ?? [];
  const porId = new Map((cronograma?.tarefas ?? []).map((t) => [t.id, t]));
  const estado = cronograma ? estadoDe(lista, dia, porId, politica) : null;
  const disponiveis = (cronograma?.tarefas ?? []).filter((t) => !lista.some((v) => v.taskId === t.id));

  return (
    <div data-testid="painel-elemento">
      <h3 className="el-nome">{e.nome}</h3>
      <table className="meta">
        <tbody>
          <tr><th>Classe IFC</th><td className="mono">{e.ifcType}</td></tr>
          <tr><th>Tipo predefinido</th><td className="mono">{e.predefinedType ?? "—"}</td></tr>
          {e.objectType && <tr><th>Tipo do objeto</th><td className="mono">{e.objectType}</td></tr>}
          <tr><th>Pavimento</th><td>{e.pavimento ?? "—"}</td></tr>
          <tr><th>Material</th><td>{e.material ?? "—"}</td></tr>
          <tr><th>GUID</th><td className="mono pequeno">{e.guid}</td></tr>
          {estado && <tr><th>Estado hoje</th><td data-testid="estado-elemento">{NOME_FASE[estado.fase]}</td></tr>}
        </tbody>
      </table>

      <h4>Tarefas deste elemento</h4>
      {lista.length === 0 && <p className="tenue">Nenhuma tarefa. O elemento segue a regra de “elementos sem tarefa”.</p>}
      <ul className="vinculos">
        {lista.map((v) => {
          const t = porId.get(v.taskId);
          return (
            <li key={v.taskId}>
              <span>
                <strong>{t?.nome ?? v.taskId}</strong> <span className="tenue">· {NOME_ACAO[v.acao]} · {v.origem === "regra" ? "por regra" : "incluído à mão"}</span>
              </span>
              <button type="button" className="btn mini" data-testid={`excluir-${v.taskId}`} data-tip="Tira este elemento da tarefa. A regra continua valendo para os demais." onClick={() => st().excluirDeTarefa(e.guid, v.taskId)}>
                Excluir
              </button>
            </li>
          );
        })}
      </ul>

      {cronograma && disponiveis.length > 0 && (
        <div className="incluir">
          <h4>Incluir em outra tarefa</h4>
          <select value={tarefaNova} onChange={(ev) => setTarefaNova(ev.target.value)} aria-label="Tarefa">
            <option value="">Escolha a tarefa…</option>
            {disponiveis.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
          <select value={acaoNova} onChange={(ev) => setAcaoNova(ev.target.value as AcaoTarefa)} aria-label="Ação" data-tip={"Construção e instalação fazem o elemento surgir.\nAcabamento só muda a aparência de algo que já existe."}>
            <option value="construct">construção</option>
            <option value="install">instalação</option>
            <option value="finish">acabamento</option>
          </select>
          <button type="button" className="btn" disabled={!tarefaNova} onClick={() => (st().incluirEmTarefa(e.guid, tarefaNova, acaoNova), setTarefaNova(""))}>
            Incluir
          </button>
        </div>
      )}
    </div>
  );
}

function PainelValidacao() {
  const problemas = useProblemas();
  const formato = useProjeto((s) => s.formatoCronograma);
  const arquivo = useProjeto((s) => s.arquivoCronograma);
  return (
    <div data-testid="painel-validacao">
      {arquivo && <p className="tenue pequeno">Cronograma: {arquivo} · {formato}</p>}
      {problemas.length === 0 ? (
        <p>Nenhum problema encontrado.</p>
      ) : (
        <ul className="problemas">
          {problemas.map((p, i) => (
            <li key={i} className={`aviso ${p.nivel}`}>
              {p.nivel === "erro" ? "✕" : "⚠"} {p.mensagem}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
