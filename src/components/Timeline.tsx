import { useEffect, useRef } from "react";
import { duracaoObra } from "../fourd/simulacao";
import { duracao, formatarBR, formatarISO, lerData } from "../fourd/tempo";
import { contarPorTarefa } from "../fourd/regras";
import { useProjeto } from "../state/projectStore";
import type { ModoAnimacao } from "../types";
import { SeletorArquivo } from "./SeletorArquivo";
import { ACEITA_CRONO, DICA_CRONO, abrirCronograma } from "./acoesArquivo";
import { useUi } from "../state/uiStore";
import { usarCronogramaDemo } from "../app/carregamento";
import { dataDeStatus } from "../fourd/real";

/** 1× = 6 dias por segundo: 180 dias em 30 s, a duração-padrão do vídeo (§23). */
export const DIAS_POR_SEGUNDO = 6;
const VELOCIDADES = [0.25, 0.5, 1, 2, 4, 8];
const MODOS: { id: ModoAnimacao; rotulo: string }[] = [
  { id: "aparecimento", rotulo: "Aparecimento" },
  { id: "fade", rotulo: "Fade-in" },
  { id: "crescimento", rotulo: "Crescimento" },
  { id: "fases", rotulo: "Por fases" },
];

const COR_CATEGORIA: Record<string, string> = {
  terreno: "var(--sepia)",
  fundacao: "var(--grafite)",
  estrutura: "var(--ardosia)",
  alvenaria: "var(--ferrugem)",
  laje: "var(--grafite)",
  cobertura: "var(--petroleo)",
  instalacoes: "var(--ardosia)",
  reboco: "var(--tinta-3)",
  esquadrias: "var(--sepia)",
  revestimento: "var(--ameixa)",
  pintura: "var(--latao)",
  loucas: "var(--petroleo)",
  paisagismo: "var(--musgo)",
};

export function Timeline() {
  const cronograma = useProjeto((s) => s.cronograma);
  const diaF = useProjeto((s) => s.dia);
  const tocando = useProjeto((s) => s.tocando);
  const velocidade = useProjeto((s) => s.velocidade);
  const vinculos = useProjeto((s) => s.vinculos);
  const tarefaIsolada = useProjeto((s) => s.tarefaIsolada);
  const modo = useProjeto((s) => s.modoAnimacao);
  const fotos = useProjeto((s) => s.fotos);
  const gerando = useProjeto((s) => s.gerandoVideo);
  const st = useProjeto.getState;
  const escala = useRef<HTMLDivElement>(null);
  const arrastando = useRef(false);

  const total = cronograma ? duracaoObra(cronograma.tarefas) : 0;
  const dia = Math.floor(diaF);

  // reprodução: avança o dia em tempo real
  useEffect(() => {
    if (!tocando) return;
    let anterior = performance.now();
    let id = requestAnimationFrame(function passo(agora) {
      const s = st();
      const proximo = s.dia + ((agora - anterior) / 1000) * DIAS_POR_SEGUNDO * s.velocidade;
      anterior = agora;
      if (proximo >= total - 1) {
        s.definirDia(total - 1);
        s.definirTocando(false);
        return;
      }
      s.definirDia(proximo);
      id = requestAnimationFrame(passo);
    });
    return () => cancelAnimationFrame(id);
  }, [tocando, total, st]);

  if (!cronograma) {
    return (
      <section className="timeline vazia" aria-label="Linha do tempo">
        <p>Carregue ou crie um cronograma para simular a obra no tempo.</p>
        <SeletorArquivo aceitar={ACEITA_CRONO} rotulo="Carregar cronograma" dica={DICA_CRONO} classe="btn primario" testId="entrada-cronograma-2" aoEscolher={abrirCronograma} />
        <button type="button" className="btn" data-testid="criar-cronograma" onClick={() => useUi.getState().abrir({ tarefa: "" })}>
          Criar cronograma
        </button>
        <button
          type="button"
          className="btn"
          data-testid="usar-cronograma-demo"
          data-tip={"Usa o cronograma de demonstração: 15 etapas, 180 dias.\nDados fictícios, marcados com o selo DEMONSTRAÇÃO."}
          onClick={usarCronogramaDemo}
        >
          Usar cronograma de exemplo
        </button>
      </section>
    );
  }

  const contagem = contarPorTarefa(vinculos);
  const status = dataDeStatus(cronograma.tarefas, fotos.map((f) => f.dia - cronograma.inicio));
  // fotos agrupadas por dia (relativo ao início da obra)
  const fotosPorDia = new Map<number, typeof fotos>();
  for (const f of fotos) {
    const d = f.dia - cronograma.inicio;
    if (d < 0 || d >= total) continue;
    fotosPorDia.set(d, [...(fotosPorDia.get(d) ?? []), f]);
  }
  const pct = (d: number) => `${(d / total) * 100}%`;
  const diaPeloPonteiro = (x: number) => {
    const r = escala.current!.getBoundingClientRect();
    return Math.floor(((x - r.left) / r.width) * total);
  };
  const ir = (d: number) => st().definirDia(d);
  const emAndamento = cronograma.tarefas.filter((t) => t.ini <= dia && dia <= t.fim);

  return (
    <section className="timeline" aria-label="Linha do tempo">
      <div className="controles">
        <button type="button" className="btn" aria-label="Ir ao início" data-tip="Volta ao primeiro dia da obra." onClick={() => ir(0)}>
          |◀
        </button>
        <button
          type="button"
          className="btn primario"
          data-testid="play"
          disabled={gerando}
          aria-label={tocando ? "Pausar" : "Reproduzir"}
          data-tip={tocando ? "Pausa a simulação." : "Reproduz a obra a partir do dia atual."}
          onClick={() => {
            if (!tocando && dia >= total - 1) ir(0);
            st().definirTocando(!tocando);
          }}
        >
          {tocando ? "❚❚" : "▶"}
        </button>
        <button type="button" className="btn" aria-label="Avançar uma semana" data-tip="Avança 7 dias." onClick={() => ir(dia + 7)}>
          ▶▶
        </button>
        <button type="button" className="btn" aria-label="Parar" data-tip="Para a reprodução e volta ao primeiro dia." onClick={() => (st().definirTocando(false), ir(0))}>
          ■
        </button>
        <button type="button" className="btn" aria-label="Ir ao fim" data-tip="Vai ao último dia: casa concluída." onClick={() => ir(total - 1)}>
          ▶|
        </button>
        <label className="campo" data-tip={`Velocidade de reprodução.\n1×: ${DIAS_POR_SEGUNDO} dias por segundo (180 dias em 30 s)\nFórmula: dias por segundo = ${DIAS_POR_SEGUNDO} × velocidade`}>
          <span>Velocidade</span>
          <select value={velocidade} onChange={(e) => st().definirVelocidade(Number(e.target.value))}>
            {VELOCIDADES.map((v) => (
              <option key={v} value={v}>
                {String(v).replace(".", ",")}×
              </option>
            ))}
          </select>
        </label>
        <label
          className="campo"
          data-tip={"Como cada elemento surge durante a sua tarefa.\nAparecimento: surge inteiro no primeiro dia\nFade-in: fica opaco aos poucos\nCrescimento: paredes, pilares e esquadrias sobem a partir da base\nPor fases: os elementos da tarefa surgem um a um, de baixo para cima e da frente para o fundo"}
        >
          <span>Animação</span>
          <select data-testid="modo-animacao" disabled={gerando} value={modo} onChange={(e) => st().definirModoAnimacao(e.target.value as ModoAnimacao)}>
            {MODOS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="campo" data-tip="Data da simulação. Ao mudar, o modelo mostra o estado da obra nesse dia.">
          <span>Data da simulação</span>
          <input
            type="date"
            data-testid="data-simulacao"
            value={formatarISO(cronograma.inicio + dia)}
            min={formatarISO(cronograma.inicio)}
            max={formatarISO(cronograma.inicio + total - 1)}
            onChange={(e) => {
              const d = lerData(e.target.value);
              if (d !== null) ir(d - cronograma.inicio);
            }}
          />
        </label>
        <span
          className="dia num calc"
          tabIndex={0}
          data-testid="dia-atual"
          data-tip-t="Dia da obra"
          data-tip={`Fórmula: data da simulação − início + 1\nInício: ${formatarBR(cronograma.inicio)}\nFim: ${formatarBR(cronograma.inicio + total - 1)}\nDuração: ${total} dias corridos`}
        >
          Dia {dia + 1} de {total}
        </span>
        <span className="andamento">{emAndamento.length ? emAndamento.map((t) => t.nome).join(" · ") : "Sem tarefa em andamento"}</span>
      </div>

      <div className="gantt">
        <div className="escala-linha">
          <span className="rotulo-col" />
          <div
            ref={escala}
            className="escala"
            data-testid="escala"
            onPointerDown={(e) => {
              arrastando.current = true;
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              st().definirTocando(false);
              ir(diaPeloPonteiro(e.clientX));
            }}
            onPointerMove={(e) => arrastando.current && ir(diaPeloPonteiro(e.clientX))}
            onPointerUp={() => (arrastando.current = false)}
            role="slider"
            aria-label="Cursor do tempo"
            aria-valuemin={1}
            aria-valuemax={total}
            aria-valuenow={dia + 1}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") ir(dia + 1);
              if (e.key === "ArrowLeft") ir(dia - 1);
            }}
          >
            {marcasDeMes(cronograma.inicio, total).map((m) => (
              <span key={m.d} className="mes" style={{ left: pct(m.d) }}>
                {m.rotulo}
              </span>
            ))}
            {status !== null && status >= 0 && status < total && (
              <span className="status" style={{ left: pct(status + 1) }} data-tip={`Data de status: ${formatarBR(cronograma.inicio + status)}\nÚltima data real informada ou da última foto.`} />
            )}
            {[...fotosPorDia].map(([d, fs]) => (
              <button
                key={d}
                type="button"
                className="marca-foto"
                style={{ left: pct(d + 0.5) }}
                data-testid="marca-foto"
                aria-label={`${fs.length} ${fs.length === 1 ? "foto" : "fotos"} em ${formatarBR(cronograma.inicio + d)}`}
                data-tip={`${fs.length} ${fs.length === 1 ? "foto" : "fotos"} em ${formatarBR(cronograma.inicio + d)}${fs[0].descricao ? `\n${fs[0].descricao}` : ""}`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => useUi.getState().abrir({ foto: fs[0].id })}
              />
            ))}
            <span className="cursor" style={{ left: pct(dia + 0.5) }} />
          </div>
        </div>
        <div className="linhas">
          {cronograma.tarefas.map((t) => {
            const n = contagem.get(t.id) ?? 0;
            const ativa = t.ini <= dia && dia <= t.fim;
            return (
              <div key={t.id} className={`linha${ativa ? " ativa" : ""}${tarefaIsolada === t.id ? " isolada" : ""}`}>
                <button
                  type="button"
                  className="rotulo-col"
                  data-tip={`${t.nome} (${t.id})\nInício: ${formatarBR(cronograma.inicio + t.ini)}\nFim: ${formatarBR(cronograma.inicio + t.fim)}\nDuração: ${duracao(t.ini, t.fim)} dias\nElementos: ${n}${t.realIni !== undefined ? `\nInício real: ${formatarBR(cronograma.inicio + t.realIni)}` : ""}${t.realFim !== undefined ? `\nFim real: ${formatarBR(cronograma.inicio + t.realFim)}` : ""}${t.avanco !== undefined ? `\nAvanço físico: ${Math.round(t.avanco * 100)}%` : ""}\nClique para ver só os elementos desta tarefa.`}
                  onClick={() => st().isolarTarefa(tarefaIsolada === t.id ? null : t.id)}
                >
                  <span className="nome">{t.nome}</span>
                  {n === 0 && <span className="sem" aria-label="sem elementos">⚠</span>}
                </button>
                <div className="trilho">
                  <span
                    className="barra"
                    style={{ left: pct(t.ini), width: pct(duracao(t.ini, t.fim)), ["--cor" as string]: COR_CATEGORIA[t.categoria] ?? "var(--grafite)" }}
                  />
                  {t.realIni !== undefined && (
                    <span
                      className={`barra-real${t.realFim === undefined ? " aberta" : ""}${(t.realFim ?? status ?? t.realIni) > t.fim ? " atrasada" : ""}`}
                      data-testid={`real-${t.id}`}
                      style={{ left: pct(Math.max(t.realIni, 0)), width: pct(Math.max((t.realFim ?? status ?? t.realIni) - Math.max(t.realIni, 0) + 1, 0.5)) }}
                    />
                  )}
                  <span className="cursor" style={{ left: pct(dia + 0.5) }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function marcasDeMes(inicio: number, total: number): { d: number; rotulo: string }[] {
  const out: { d: number; rotulo: string }[] = [];
  for (let d = 0; d < total; d++) {
    const data = new Date((inicio + d) * 86_400_000);
    if (data.getUTCDate() === 1 || d === 0) out.push({ d, rotulo: `${MESES[data.getUTCMonth()]}${data.getUTCMonth() === 0 || d === 0 ? ` ${data.getUTCFullYear()}` : ""}` });
  }
  return out;
}
