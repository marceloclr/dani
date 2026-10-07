import { useEffect, useRef, useState } from "react";
import { aoCarregarMalhas, malhasAtuais } from "../app/carregamento";
import { camadasPara, definirCena } from "../app/estadoCena";
import { Cena } from "../rendering/Cena";
import { PRESETS } from "../rendering/cameras";
import { useProjeto } from "../state/projectStore";

export function Viewport() {
  const host = useRef<HTMLDivElement>(null);
  const cena = useRef<Cena | null>(null);
  const toque = useRef<{ x: number; y: number } | null>(null);
  const [orbita, setOrbita] = useState(false);

  const selecionado = useProjeto((s) => s.selecionado);
  const ocultos = useProjeto((s) => s.ocultosUsuario);
  const tarefaIsolada = useProjeto((s) => s.tarefaIsolada);
  const modoSelecao = useProjeto((s) => s.modoSelecao);
  const temCronograma = useProjeto((s) => !!s.cronograma);
  const gerandoVideo = useProjeto((s) => s.gerandoVideo);
  const st = useProjeto.getState;

  // cria a cena uma vez, recebe a geometria do worker e reaplica o estado a cada mudança da simulação
  useEffect(() => {
    const c = new Cena(host.current!);
    cena.current = c;
    definirCena(c);
    // terreno e paisagismo ficam fora do enquadramento: a câmera mira a casa
    const fora = () => new Set(st().elementos.filter((e) => e.ifcType === "IfcGeographicElement").map((e) => e.guid));
    const aplicar = () => {
      const s = st();
      if (!s.gerandoVideo) c.aplicar(camadasPara(s, c, s.dia));
    };
    const atuais = malhasAtuais();
    if (atuais) c.carregar(atuais, fora());
    aplicar();
    const sairMalhas = aoCarregarMalhas((m) => {
      c.carregar(m, fora());
      aplicar();
    });
    const sairEstado = useProjeto.subscribe((s, a) => {
      if (
        s.dia !== a.dia ||
        s.vinculos !== a.vinculos ||
        s.cronograma !== a.cronograma ||
        s.politica !== a.politica ||
        s.selecionado !== a.selecionado ||
        s.ocultosUsuario !== a.ocultosUsuario ||
        s.tarefaIsolada !== a.tarefaIsolada ||
        s.modoAnimacao !== a.modoAnimacao ||
        (a.gerandoVideo && !s.gerandoVideo)
      ) aplicar();
    });
    const tema = new MutationObserver(() => c.atualizarTema());
    tema.observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema"] });
    const preferencia = window.matchMedia("(prefers-color-scheme: dark)");
    const aoMudarPreferencia = () => c.atualizarTema();
    preferencia.addEventListener("change", aoMudarPreferencia);
    (window as unknown as { __cena?: Cena }).__cena = c; // usado pelos testes de ponta a ponta
    return () => {
      sairMalhas();
      sairEstado();
      tema.disconnect();
      preferencia.removeEventListener("change", aoMudarPreferencia);
      definirCena(null);
      c.dispose();
      cena.current = null;
    };
  }, [st]);

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
        {PRESETS.map((x) => (
          <button
            key={x.id}
            type="button"
            className="btn"
            aria-pressed={x.id === "orbita" ? orbita : undefined}
            data-tip={x.id === "orbita" ? "Liga e desliga a rotação automática em volta da casa." : x.dica}
            onClick={() => setOrbita(cena.current?.vista(x.id) ?? false)}
          >
            {x.rotulo}
          </button>
        ))}
      </div>
      <div
        ref={host}
        className="tela3d"
        data-testid="tela3d"
        onPointerDown={(e) => {
          toque.current = { x: e.clientX, y: e.clientY };
          if (orbita) {
            cena.current?.pararGiro();
            setOrbita(false);
          }
        }}
        onPointerUp={aoSoltar}
      />
      {temCronograma && <Legenda />}
      {gerandoVideo && <div className="aviso-video">Gerando vídeo: a pré-visualização está no painel Vídeo.</div>}
    </div>
  );
}

function Legenda() {
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
