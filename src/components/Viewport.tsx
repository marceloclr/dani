import { useEffect, useRef, useState } from "react";
import { aoCarregarMalhas, malhasAtuais } from "../app/carregamento";
import { camadasPara, definirCena } from "../app/estadoCena";
import { Cena } from "../rendering/Cena";
import { PRESETS } from "../rendering/cameras";
import { useProjeto } from "../state/projectStore";
import { aoMudarImagemPlanta, urlDaFoto, urlDaPlantaAtual } from "../app/anexos";
import { fotoAte, temDadosReais } from "../fourd/real";
import { formatarBR } from "../fourd/tempo";
import { useUi } from "../state/uiStore";
import type { Visao } from "../types";

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
    // material, classe e tipo de cada elemento, para os materiais realistas (ADR-21)
    const metas = () => new Map(st().elementos.map((e) => [e.guid, { material: e.material, ifcType: e.ifcType, objectType: e.objectType }]));
    c.definirAparencia(st().aparencia3d);
    const aplicar = () => {
      const s = st();
      if (!s.gerandoVideo) c.aplicar(camadasPara(s, c, s.dia));
    };
    const atuais = malhasAtuais();
    if (atuais) c.carregar(atuais, fora(), metas());
    aplicar();
    const sairMalhas = aoCarregarMalhas((m) => {
      c.carregar(m, fora(), metas());
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
        s.visao !== a.visao ||
        (a.gerandoVideo && !s.gerandoVideo)
      ) aplicar();
      if (s.planta !== a.planta) c.definirPlanta(s.planta, urlDaPlantaAtual());
      if (s.aparencia3d !== a.aparencia3d) c.definirAparencia(s.aparencia3d);
    });
    c.definirPlanta(st().planta, urlDaPlantaAtual());
    const sairPlanta = aoMudarImagemPlanta(() => c.definirPlanta(st().planta, urlDaPlantaAtual()));
    const tema = new MutationObserver(() => c.atualizarTema());
    tema.observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema"] });
    const preferencia = window.matchMedia("(prefers-color-scheme: dark)");
    const aoMudarPreferencia = () => c.atualizarTema();
    preferencia.addEventListener("change", aoMudarPreferencia);
    (window as unknown as { __cena?: Cena }).__cena = c; // usado pelos testes de ponta a ponta
    return () => {
      sairMalhas();
      sairEstado();
      sairPlanta();
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
        <SeletorAparencia />
        {temCronograma && <SeletorVisao />}
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
      <FotoFlutuante />
      {gerandoVideo && <div className="aviso-video">Gerando vídeo: a pré-visualização está no painel Vídeo.</div>}
    </div>
  );
}

const VISOES: { id: Visao; rotulo: string; dica: string }[] = [
  { id: "planejado", rotulo: "Planejado", dica: "A obra segundo as datas planejadas do cronograma." },
  { id: "real", rotulo: "Real", dica: "A obra segundo as datas reais (início e fim real de cada tarefa). Tarefa sem início real ainda não começou." },
  { id: "comparar", rotulo: "Comparar", dica: "Mostra o real e marca os desvios: em carmim o que devia existir e ainda não existe; em ardósia o que está adiantado." },
];

function SeletorAparencia() {
  const a = useProjeto((s) => s.aparencia3d);
  const opcoes: { id: "realista" | "tecnica"; rotulo: string; dica: string }[] = [
    { id: "realista", rotulo: "Realista", dica: "Tijolo, reboco, telha, madeira, vidro e grama com textura, sol com sombras, céu e sombreamento nos cantos. Vale também para o vídeo e o relatório." },
    { id: "tecnica", rotulo: "Técnica", dica: "Cores lisas por material e o que está em execução em latão: mais leve e mais fácil de ler o andamento." },
  ];
  return (
    <div className="segmentos visao3d aparencia3d" role="tablist" aria-label="Aparência">
      {opcoes.map((o) => (
        <button key={o.id} type="button" role="tab" className="seg" aria-selected={a === o.id} data-testid={`aparencia-${o.id}`} data-tip={o.dica} onClick={() => useProjeto.getState().definirAparencia3d(o.id)}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

function SeletorVisao() {
  const visao = useProjeto((s) => s.visao);
  const comReal = useProjeto((s) => (s.cronograma ? temDadosReais(s.cronograma.tarefas) : false));
  return (
    <div className="segmentos visao3d" role="tablist" aria-label="Visão">
      {VISOES.map((v) => (
        <button
          key={v.id}
          type="button"
          role="tab"
          className="seg"
          aria-selected={visao === v.id}
          data-testid={`visao-${v.id}`}
          data-tip={v.id !== "planejado" && !comReal ? `${v.dica}\nEste cronograma ainda não tem datas reais: informe-as ao editar as tarefas ou importe um cronograma com inicio_real e fim_real.` : v.dica}
          onClick={() => useProjeto.getState().definirVisao(v.id)}
        >
          {v.rotulo}
        </button>
      ))}
    </div>
  );
}

/** Foto real mais recente até a data da simulação (§30, §31). */
function FotoFlutuante() {
  const mostrar = useProjeto((s) => s.mostrarFotos);
  const fotos = useProjeto((s) => s.fotos);
  const diaCivil = useProjeto((s) => (s.cronograma ? s.cronograma.inicio + Math.floor(s.dia) : null));
  if (!mostrar || diaCivil === null || !fotos.length) return null;
  const f = fotoAte(fotos, diaCivil);
  const url = f && urlDaFoto(f.id);
  if (!f || !url) return null;
  return (
    <button type="button" className="foto3d" data-testid="foto-flutuante" onClick={() => useUi.getState().abrir({ foto: f.id })} aria-label={`Foto real de ${formatarBR(f.dia)}`}>
      <img src={url} alt={f.descricao || f.arquivo} />
      <span>
        Foto real · {formatarBR(f.dia)}
        {f.local ? ` · ${f.local}` : ""}
      </span>
    </button>
  );
}

function Legenda() {
  const visao = useProjeto((s) => s.visao);
  const realista = useProjeto((s) => s.aparencia3d === "realista");
  if (visao === "comparar") {
    return (
      <div className="legenda3d" aria-label="Legenda">
        <span>
          <i style={{ background: "#b54a4a" }} />
          Atrasado
        </span>
        <span>
          <i style={{ background: "#4f7aa8" }} />
          Adiantado
        </span>
        <span>
          <i style={{ background: "linear-gradient(90deg, #b5653a 50%, #9e9e99 50%)" }} />
          Em dia
        </span>
      </div>
    );
  }
  if (realista) {
    return (
      <div className="legenda3d" aria-label="Legenda">
        <span>Aparência realista: a obra se forma conforme o cronograma</span>
        <span>
          <i style={{ background: "transparent", borderStyle: "dashed" }} />
          Sem tarefa (fantasma)
        </span>
      </div>
    );
  }
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
