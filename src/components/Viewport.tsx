import { useEffect, useMemo, useRef } from "react";
import { aoCarregarMalhas, malhasAtuais } from "../app/carregamento";
import { avaliar } from "../fourd/simulacao";
import { Cena, type Vista } from "../rendering/Cena";
import { useProjeto } from "../state/projectStore";

const VISTAS: { v: Vista; rotulo: string; dica: string }[] = [
  { v: "isometrica", rotulo: "Isométrica", dica: "Vista isométrica a partir da frente, à esquerda. Também serve para reiniciar a câmera." },
  { v: "frontal", rotulo: "Frontal", dica: "Vista da fachada da frente." },
  { v: "lateral", rotulo: "Lateral", dica: "Vista da fachada lateral leste." },
  { v: "superior", rotulo: "Superior", dica: "Vista de cima, com o fundo do lote para o alto da tela." },
];

export function Viewport() {
  const host = useRef<HTMLDivElement>(null);
  const cena = useRef<Cena | null>(null);
  const toque = useRef<{ x: number; y: number } | null>(null);

  const dia = useProjeto((s) => Math.floor(s.dia));
  const cronograma = useProjeto((s) => s.cronograma);
  const vinculos = useProjeto((s) => s.vinculos);
  const politica = useProjeto((s) => s.politica);
  const selecionado = useProjeto((s) => s.selecionado);
  const ocultos = useProjeto((s) => s.ocultosUsuario);
  const tarefaIsolada = useProjeto((s) => s.tarefaIsolada);
  const modoSelecao = useProjeto((s) => s.modoSelecao);
  const st = useProjeto.getState;

  // cria a cena uma vez e recebe a geometria do worker
  useEffect(() => {
    const c = new Cena(host.current!);
    cena.current = c;
    // terreno e paisagismo ficam fora do enquadramento: a câmera mira a casa
    const fora = () => new Set(useProjeto.getState().elementos.filter((e) => e.ifcType === "IfcGeographicElement").map((e) => e.guid));
    const atuais = malhasAtuais();
    if (atuais) c.carregar(atuais, fora());
    const sair = aoCarregarMalhas((m) => c.carregar(m, fora()));
    const tema = new MutationObserver(() => c.atualizarTema());
    tema.observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema"] });
    const preferencia = window.matchMedia("(prefers-color-scheme: dark)");
    const aoMudarPreferencia = () => c.atualizarTema();
    preferencia.addEventListener("change", aoMudarPreferencia);
    (window as unknown as { __cena?: Cena }).__cena = c; // usado pelos testes de ponta a ponta
    return () => {
      sair();
      tema.disconnect();
      preferencia.removeEventListener("change", aoMudarPreferencia);
      c.dispose();
      cena.current = null;
    };
  }, []);

  const estados = useMemo(
    () => (cronograma ? avaliar(dia, { vinculos, tarefas: cronograma.tarefas, politica }) : null),
    [dia, cronograma, vinculos, politica],
  );
  const isolados = useMemo(() => {
    if (!tarefaIsolada) return null;
    const s = new Set<string>();
    for (const [guid, lista] of vinculos) if (lista.some((v) => v.taskId === tarefaIsolada)) s.add(guid);
    return s;
  }, [tarefaIsolada, vinculos]);

  useEffect(() => {
    cena.current?.aplicar({ estados, ocultos, isolados, selecionado });
  }, [estados, ocultos, isolados, selecionado]);

  const aoSoltar = (e: React.PointerEvent) => {
    const t = toque.current;
    toque.current = null;
    if (!t || !modoSelecao || !cena.current) return;
    if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > 4) return; // foi arrasto de câmera
    st().selecionar(cena.current.escolher(e.clientX, e.clientY));
  };

  return (
    <div className="viewport">
      <div className="ferramentas" role="toolbar" aria-label="Câmera e seleção">
        <button type="button" className="btn" data-tip="Enquadra a casa inteira, mantendo o ângulo atual." onClick={() => cena.current?.casaInteira()}>
          Casa inteira
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={modoSelecao}
          data-tip={"Com o modo ligado, um clique no modelo seleciona o elemento.\nArrastar continua girando a câmera."}
          onClick={() => st().alternarModoSelecao()}
        >
          Selecionar
        </button>
        <button type="button" className="btn" disabled={!selecionado} data-tip="Esconde o elemento selecionado, sem mudar o cronograma." onClick={() => st().ocultarSelecionado()}>
          Ocultar
        </button>
        <button
          type="button"
          className="btn"
          disabled={ocultos.size === 0 && !tarefaIsolada}
          data-tip="Volta a mostrar os elementos ocultados à mão e desfaz o isolamento de tarefa."
          onClick={() => st().mostrarTodos()}
        >
          Mostrar{ocultos.size ? ` (${ocultos.size})` : ""}
        </button>
        <button type="button" className="btn" disabled={!selecionado} data-tip="Aproxima a câmera do elemento selecionado." onClick={() => selecionado && cena.current?.focar(selecionado)}>
          Focar
        </button>
        <span className="sep" />
        {VISTAS.map((x) => (
          <button key={x.v} type="button" className="btn" data-tip={x.dica} onClick={() => cena.current?.vista(x.v)}>
            {x.rotulo}
          </button>
        ))}
      </div>
      <div
        ref={host}
        className="tela3d"
        data-testid="tela3d"
        onPointerDown={(e) => (toque.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={aoSoltar}
      />
      <Legenda />
    </div>
  );
}

function Legenda() {
  const tem = useProjeto((s) => !!s.cronograma);
  if (!tem) return null;
  return (
    <div className="legenda3d" aria-label="Legenda">
      <span>
        <i style={{ background: "#c4a45e" }} />
        Em execução
      </span>
      <span>
        <i style={{ background: "linear-gradient(90deg, #b5653a 50%, #9e9e99 50%)" }} />
        Concluído (cor do material)
      </span>
      <span>
        <i style={{ background: "transparent", borderStyle: "dashed" }} />
        Sem tarefa (fantasma)
      </span>
    </div>
  );
}
