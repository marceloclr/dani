import { useRef, useState } from "react";
import { adicionarFotos, carregarPlanta, removerFoto, removerPlanta, urlDaFoto } from "../app/anexos";
import { obterCena } from "../app/estadoCena";
import { gerarRelatorio } from "../app/relatorio";
import { nomeSeguro } from "../app/projetos";
import { avancoPlanejado, avancoReal, dataDeStatus, desviosDasTarefas, temDadosReais } from "../fourd/real";
import { formatarBR, formatarISO, lerData } from "../fourd/tempo";
import { useProjeto } from "../state/projectStore";
import { useUi } from "../state/uiStore";
import { baixar, carimboArquivo } from "../utils/baixar";

const pct = (f: number) => `${Math.round(f * 100)}%`;

/** Acompanhamento da obra: indicadores, fotos (§30), planta (§29) e relatório (§59). */
export function PainelObra() {
  const cronograma = useProjeto((s) => s.cronograma);
  const dia = useProjeto((s) => Math.floor(s.dia));
  const fotos = useProjeto((s) => s.fotos);
  const mostrarFotos = useProjeto((s) => s.mostrarFotos);
  const planta = useProjeto((s) => s.planta);
  const st = useProjeto.getState;
  const entradaFotos = useRef<HTMLInputElement>(null);
  const entradaPlanta = useRef<HTMLInputElement>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [gerando, setGerando] = useState(false);

  if (!cronograma) return <p className="tenue">Carregue ou crie um cronograma para acompanhar a obra.</p>;
  const comReal = temDadosReais(cronograma.tarefas);
  const ap = avancoPlanejado(cronograma.tarefas, dia);
  const ar = avancoReal(cronograma.tarefas, dia);
  const status = dataDeStatus(cronograma.tarefas, fotos.map((f) => f.dia - cronograma.inicio));
  const desvios = comReal ? desviosDasTarefas(cronograma.tarefas, dia).filter((d) => d.dias > 0) : [];

  const relatorio = async () => {
    const cena = obterCena();
    if (!cena) return;
    setGerando(true);
    try {
      const pdf = await gerarRelatorio(cena);
      baixar(pdf, `relatorio-${nomeSeguro(st().nomeProjeto ?? "obra")}-${formatarISO(cronograma.inicio + dia)}-${carimboArquivo()}.pdf`);
    } catch (e) {
      st().mostrarErro({ mensagem: "Não foi possível gerar o relatório.", detalhes: String((e as Error)?.stack ?? e) });
    } finally {
      setGerando(false);
    }
  };

  return (
    <div className="painel-obra" data-testid="painel-obra">
      <div className="cartoes duas">
        <div
          className="cartao calc"
          tabIndex={0}
          style={{ ["--cor" as string]: "var(--ardosia)" }}
          data-tip-t="Avanço planejado"
          data-tip={`Fórmula: dias de tarefa já decorridos ÷ dias de tarefa totais\nData: ${formatarBR(cronograma.inicio + dia)}`}
        >
          <div className="rotulo">Avanço planejado</div>
          <div className="valor" data-testid="avanco-planejado">{pct(ap)}</div>
        </div>
        <div
          className="cartao calc"
          tabIndex={0}
          style={{ ["--cor" as string]: comReal ? (ar + 0.005 < ap ? "var(--risco)" : "var(--ok)") : "var(--neutro)" }}
          data-tip-t="Avanço real"
          data-tip={comReal ? `Fórmula: Σ (avanço físico × duração) ÷ Σ duração\nSem avanço informado, vale o deduzido das datas reais\nDiferença: ${Math.round((ar - ap) * 100)} pontos` : "Informe as datas reais ou o avanço físico ao editar as tarefas, ou importe um cronograma com inicio_real, fim_real e avanco."}
        >
          <div className="rotulo">Avanço real</div>
          <div className="valor" data-testid="avanco-real">{comReal ? pct(ar) : "—"}</div>
          {comReal && status !== null && <div className="nota">status em {formatarBR(cronograma.inicio + status)}</div>}
        </div>
      </div>
      {desvios.length > 0 && (
        <p className="aviso-honesto" data-testid="resumo-desvios">
          {desvios.length} {desvios.length === 1 ? "tarefa atrasada" : "tarefas atrasadas"}: {desvios.slice(0, 3).map((d) => `${d.tarefa.nome} (${d.dias} d)`).join(", ")}
          {desvios.length > 3 ? "…" : ""}
        </p>
      )}

      <button type="button" className="btn primario largo-topo" disabled={gerando} data-testid="gerar-relatorio" data-tip="PDF da data da simulação: imagem da obra, avanço, etapas, desvios e fotos dos últimos 30 dias." onClick={relatorio}>
        {gerando ? "Gerando relatório…" : "Relatório PDF desta data"}
      </button>

      <h4>Fotos da obra ({fotos.length})</h4>
      <div className="botoes">
        <button
          type="button"
          className="btn"
          data-testid="adicionar-fotos"
          data-tip={"JPEG, PNG ou WebP. A data vem do EXIF da câmera ou do arquivo.\nEnvie junto um fotos.csv (arquivo;data;local;descricao;etapa) para preencher tudo de uma vez."}
          onClick={() => entradaFotos.current?.click()}
        >
          Adicionar fotos
        </button>
        <label className="marcar">
          <input type="checkbox" checked={mostrarFotos} onChange={(e) => st().definirMostrarFotos(e.target.checked)} data-testid="mostrar-fotos" />
          Mostrar na simulação
        </label>
      </div>
      <input
        ref={entradaFotos}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,.csv"
        hidden
        data-testid="entrada-fotos"
        onChange={async (e) => {
          const arqs = [...(e.target.files ?? [])];
          e.target.value = "";
          if (arqs.length) setAvisos((await adicionarFotos(arqs)).avisos);
        }}
      />
      {avisos.length > 0 && (
        <ul className="problemas" data-testid="avisos-fotos">
          {avisos.map((a, i) => (
            <li key={i} className="aviso">
              ⚠ {a}
            </li>
          ))}
        </ul>
      )}
      <ul className="lista-fotos" data-testid="lista-fotos">
        {fotos.map((f) => (
          <li key={f.id}>
            <button type="button" className="miniatura" onClick={() => useUi.getState().abrir({ foto: f.id })} aria-label={`Abrir ${f.arquivo}`}>
              <img src={urlDaFoto(f.id) ?? ""} alt={f.descricao || f.arquivo} loading="lazy" />
            </button>
            <div className="dados-foto">
              <input type="date" aria-label="Data" value={formatarISO(f.dia)} onChange={(e) => { const d = lerData(e.target.value); if (d !== null) st().atualizarFoto(f.id, { dia: d }); }} />
              <input aria-label="Local" placeholder="Local" value={f.local} onChange={(e) => st().atualizarFoto(f.id, { local: e.target.value })} />
              <input aria-label="Descrição" placeholder="Descrição" value={f.descricao} onChange={(e) => st().atualizarFoto(f.id, { descricao: e.target.value })} />
              <select aria-label="Etapa" value={f.etapa ?? ""} onChange={(e) => st().atualizarFoto(f.id, { etapa: e.target.value || null })}>
                <option value="">Sem etapa</option>
                {cronograma.tarefas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className="btn mini" aria-label={`Excluir ${f.arquivo}`} onClick={() => removerFoto(f.id)}>
              ✕
            </button>
          </li>
        ))}
      </ul>

      <h4>Planta sobreposta</h4>
      <p className="tenue pequeno">Imagem de referência sob o modelo (§29). Não é convertida em BIM.</p>
      <div className="botoes">
        <button type="button" className="btn" data-testid="carregar-planta" onClick={() => entradaPlanta.current?.click()}>
          {planta ? "Trocar planta" : "Carregar planta (PNG, JPG ou PDF)"}
        </button>
        {planta && (
          <button type="button" className="btn" onClick={removerPlanta}>
            Remover
          </button>
        )}
      </div>
      <input
        ref={entradaPlanta}
        type="file"
        accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
        hidden
        data-testid="entrada-planta"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) await carregarPlanta(f, obterCena()?.caixaPlanta() ?? null);
        }}
      />
      {planta && (
        <div className="ajuste-planta" data-testid="ajuste-planta">
          <label className="marcar">
            <input type="checkbox" checked={planta.visivel} onChange={(e) => st().ajustarPlanta({ visivel: e.target.checked })} />
            Visível · {planta.arquivo}
          </label>
          <div className="linha-campos">
            <label className="campo" data-tip="Largura real que a imagem inteira representa, em metros. Ajuste até as paredes coincidirem.">
              <span>Largura da imagem (m)</span>
              <input type="number" step={0.1} min={1} value={planta.larguraM} onChange={(e) => st().ajustarPlanta({ larguraM: Math.max(Number(e.target.value), 0.5) })} data-testid="planta-largura" />
            </label>
            <label className="campo">
              <span>Rotação (°)</span>
              <input type="number" step={1} value={planta.rotacaoGraus} onChange={(e) => st().ajustarPlanta({ rotacaoGraus: Number(e.target.value) })} />
            </label>
          </div>
          <div className="linha-campos">
            <label className="campo">
              <span>Deslocar x (m)</span>
              <input type="number" step={0.1} value={Number(planta.x.toFixed(2))} onChange={(e) => st().ajustarPlanta({ x: Number(e.target.value) })} />
            </label>
            <label className="campo">
              <span>Deslocar z (m)</span>
              <input type="number" step={0.1} value={Number(planta.z.toFixed(2))} onChange={(e) => st().ajustarPlanta({ z: Number(e.target.value) })} />
            </label>
          </div>
          <label className="campo">
            <span>Opacidade: {pct(planta.opacidade)}</span>
            <input type="range" min={0.1} max={1} step={0.05} value={planta.opacidade} onChange={(e) => st().ajustarPlanta({ opacidade: Number(e.target.value) })} />
          </label>
          <button
            type="button"
            className="btn"
            data-tip="Centraliza a planta na casa e a deixa 20% mais larga que ela."
            onClick={() => {
              const c = obterCena()?.caixaPlanta();
              if (c) st().ajustarPlanta({ x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2, larguraM: Math.round((c.x1 - c.x0) * 1.2 * 100) / 100, rotacaoGraus: 0 });
            }}
          >
            Ajustar à casa
          </button>
        </div>
      )}
    </div>
  );
}
