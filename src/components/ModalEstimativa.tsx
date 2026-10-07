import { useEffect, useMemo, useState } from "react";
import { obterCena } from "../app/estadoCena";
import { FORMULA_PRAZO, NOME_ESTRUTURA, estimarCronograma, pavimentosDoModelo, prazoSugerido, type TipoEstrutura } from "../fourd/estimativa";
import { formatarBR, formatarISO, lerData } from "../fourd/tempo";
import { useProjeto } from "../state/projectStore";
import { Modal } from "./Modal";

const hoje = () => lerData(new Date().toLocaleDateString("sv-SE"))!;

/** Área e pavimentos a partir do modelo carregado (paramétrico: exatos; IFC: estimados). */
function doModelo() {
  const s = useProjeto.getState();
  const cena = obterCena();
  if (s.tipoModelo === "PARAMETRICO" && s.parametros) {
    const pavs = s.parametros.pavimentos === 2 ? ["Térreo", "Pavimento superior"] : ["Térreo"];
    return { area: s.parametros.area, pavimentos: pavs, origem: "parâmetros do modelo" };
  }
  if (s.elementos.length && cena) {
    const pavs = pavimentosDoModelo(s.elementos, (g) => cena.baseDe(g));
    const c = cena.caixaPlanta();
    const area = c ? Math.round((c.x1 - c.x0) * (c.z1 - c.z0) * Math.max(pavs.length, 1)) : 100;
    return { area, pavimentos: pavs.length ? pavs : ["Térreo"], origem: "projeção do modelo (contorno × pavimentos)" };
  }
  return { area: 100, pavimentos: ["Térreo"], origem: null };
}

/** Cronograma estimado automaticamente (§13, ADR-18). */
export function ModalEstimativa({ aberto, aoFechar }: { aberto: boolean; aoFechar(): void }) {
  const existente = useProjeto((s) => s.cronograma);
  const [area, setArea] = useState(100);
  const [pavimentos, setPavimentos] = useState<string[]>(["Térreo"]);
  const [origem, setOrigem] = useState<string | null>(null);
  const [estrutura, setEstrutura] = useState<TipoEstrutura>("concreto");
  const [inicio, setInicio] = useState(formatarISO(hoje()));
  const [prazo, setPrazo] = useState(150);
  const [prazoEditado, setPrazoEditado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    const m = doModelo();
    setArea(m.area);
    setPavimentos(m.pavimentos);
    setOrigem(m.origem);
    setPrazoEditado(false);
    setConfirmar(false);
  }, [aberto]);

  const sugerido = prazoSugerido(area, pavimentos.length, estrutura);
  useEffect(() => {
    if (!prazoEditado) setPrazo(sugerido);
  }, [sugerido, prazoEditado]);

  const ini = lerData(inicio);
  const previa = useMemo(() => (ini === null ? null : estimarCronograma({ area, pavimentos, estrutura, inicio: ini, prazo })), [area, pavimentos, estrutura, ini, prazo]);

  const aplicar = () => {
    if (!previa) return;
    if (existente && !confirmar) {
      setConfirmar(true);
      return;
    }
    useProjeto.getState().definirCronograma(previa, "estimativa automática", "estimativa (§13)", [], false);
    aoFechar();
  };

  const npav = pavimentos.length;
  return (
    <Modal aberto={aberto} titulo="Gerar cronograma estimado" aoFechar={aoFechar} largura={720} testId="modal-estimativa">
      <p className="aviso-honesto">
        <strong>Estimativa para começar a simular, não é cronograma executivo.</strong> As etapas seguem proporções típicas de obra residencial; ajuste as datas na aba Tarefas ou importe o cronograma real quando tiver.
      </p>
      <div className="form">
        <div className="linha-campos">
          <label className="campo" data-tip={origem ? `Preenchido pela ${origem}. Pode ser alterado.` : "Área construída total."}>
            <span>Área construída (m²)</span>
            <input type="number" min={20} step={1} value={area} onChange={(e) => setArea(Number(e.target.value))} data-testid="est-area" />
          </label>
          <label className="campo" data-tip={npav > 1 ? `Do modelo: ${pavimentos.join(", ")}. A estrutura, a alvenaria e a laje viram uma tarefa por pavimento.` : "Número de pavimentos."}>
            <span>Pavimentos</span>
            <select
              value={npav}
              data-testid="est-pavimentos"
              onChange={(e) => {
                const n = Number(e.target.value);
                setPavimentos(Array.from({ length: n }, (_, k) => pavimentos[k] ?? (k === 0 ? "Térreo" : `${k}º pavimento`)));
              }}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="campo">
          <span>Tipo de estrutura</span>
          <select value={estrutura} onChange={(e) => setEstrutura(e.target.value as TipoEstrutura)} data-testid="est-estrutura">
            {(Object.keys(NOME_ESTRUTURA) as TipoEstrutura[]).map((k) => (
              <option key={k} value={k}>
                {NOME_ESTRUTURA[k]}
              </option>
            ))}
          </select>
        </label>
        <div className="linha-campos">
          <label className="campo">
            <span>Início da obra</span>
            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} data-testid="est-inicio" />
          </label>
          <label className="campo" data-tip={`${FORMULA_PRAZO}\nSugestão para estes dados: ${sugerido} dias`}>
            <span>Prazo total (dias corridos)</span>
            <input
              type="number"
              min={15}
              step={1}
              value={prazo}
              data-testid="est-prazo"
              onChange={(e) => {
                setPrazo(Number(e.target.value));
                setPrazoEditado(true);
              }}
            />
          </label>
        </div>
        <p className="relacao calc" tabIndex={0} data-tip={FORMULA_PRAZO} data-testid="est-sugestao">
          Prazo sugerido: {sugerido} dias
          {prazoEditado && prazo !== sugerido && (
            <>
              {" · "}
              <button type="button" className="link" onClick={() => setPrazoEditado(false)}>
                usar a sugestão
              </button>
            </>
          )}
        </p>
      </div>

      {previa && (
        <div className="tbl-wrap previa-estimativa">
          <table data-testid="est-previa">
            <thead>
              <tr>
                <th>Etapa</th>
                <th>Pavimento</th>
                <th className="n">Início</th>
                <th className="n">Fim</th>
                <th className="n">Dias</th>
              </tr>
            </thead>
            <tbody>
              {previa.tarefas.map((t) => (
                <tr key={t.id}>
                  <td>{t.nome}</td>
                  <td>{t.pavimento ?? "todos"}</td>
                  <td className="n">{formatarBR(previa.inicio + t.ini)}</td>
                  <td className="n">{formatarBR(previa.inicio + t.fim)}</td>
                  <td className="n">{t.fim - t.ini + 1}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmar && (
        <p className="aviso-honesto erro-form" role="alert" data-testid="est-confirmar">
          O cronograma atual ({existente?.tarefas.length} tarefas) e as exceções manuais serão substituídos. Clique de novo em Gerar para confirmar.
        </p>
      )}
      <div className="botoes fim">
        <span className="espaco" />
        <button type="button" className="btn" onClick={aoFechar}>
          Cancelar
        </button>
        <button type="button" className="btn primario" disabled={!previa} onClick={aplicar} data-testid="est-gerar">
          {confirmar ? "Substituir e gerar" : "Gerar cronograma"}
        </button>
      </div>
    </Modal>
  );
}
