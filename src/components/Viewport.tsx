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
import { AJUDA_VOO, PreviaVoo, VooManual, type Comando } from "../rendering/voo";
import { VELOCIDADE_VOO, diaDoVoo, duracaoDoVooAutomatico } from "../rendering/drone";
import { aplicarSol, cicloDoVoo, definirInsolacaoAtiva, forcarHorario } from "../app/solDaCena";
import { PainelInsolacao } from "./PainelInsolacao";
import { NOME_LUZ, type Luz } from "../rendering/iluminacao";

/** `simples`: só a imagem (assistente, ADR-30); sem a barra de ferramentas nem a legenda. */
export function Viewport({ simples = false }: { simples?: boolean } = {}) {
  const host = useRef<HTMLDivElement>(null);
  const cena = useRef<Cena | null>(null);
  const toque = useRef<{ x: number; y: number } | null>(null);
  const [orbita, setOrbita] = useState(false);
  const drone = useRef<VooManual | null>(null);
  const previa = useRef<PreviaVoo | null>(null);
  const [modoDrone, setModoDrone] = useState<"manual" | "automatico" | null>(null);
  /** Insolação sobre a imagem (ADR-26): hora escolhida, em minutos; null = desligada. */
  const [insolacao, setInsolacao] = useState<number | null>(null);
  const realistaAtivo = useProjeto((s) => s.aparencia3d === "realista");

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
    aplicarSol(c);
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
      // sol real (ADR-26): muda com a data, a luz, a bússola, o local e o IFC
      if (!s.gerandoVideo && (s.dia !== a.dia || s.video.luz !== a.video.luz || s.video.sol !== a.video.sol || s.geoIfc !== a.geoIfc || s.cronograma !== a.cronograma)) aplicarSol(c);
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
      drone.current?.parar();
      previa.current?.parar();
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

  const pararDrone = () => {
    drone.current?.parar();
    previa.current?.parar();
  };
  const alternarManual = () => {
    if (modoDrone === "manual") return pararDrone();
    pararDrone();
    if (!cena.current) return;
    drone.current = new VooManual(cena.current, () => {
      drone.current = null;
      setModoDrone(null);
    });
    setOrbita(false);
    setModoDrone("manual");
  };
  /** Liga a insolação na hora atual do sol da luz escolhida, ou desliga e volta ao horário da luz. */
  const definirHoraInsolacao = (m: number | null) => {
    setInsolacao(m);
    definirInsolacaoAtiva(m !== null);
    forcarHorario(m);
    if (cena.current) aplicarSol(cena.current);
  };
  const alternarInsolacao = () => {
    if (insolacao !== null) return definirHoraInsolacao(null);
    const agora = cena.current ? aplicarSol(cena.current).minutos : 600;
    definirHoraInsolacao(Math.round(Math.min(Math.max(agora, 5 * 60), 19 * 60) / 15) * 15);
  };
  // a técnica não tem sol: desliga a insolação
  useEffect(() => {
    if (!realistaAtivo && insolacao !== null) definirHoraInsolacao(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realistaAtivo]);

  const alternarAutomatico = () => {
    if (modoDrone === "automatico") return pararDrone();
    pararDrone();
    if (insolacao !== null) definirHoraInsolacao(null); // o voo controla o horário
    if (!cena.current) return;
    const s = st();
    const dias = s.cronograma?.tarefas.length ? Math.max(...s.cronograma.tarefas.map((t) => t.fim)) + 1 : 0;
    setOrbita(false);
    setModoDrone("automatico");
    // velocidade de cruzeiro fixa: a duração sai do comprimento do voo (ADR-25)
    const c = cena.current;
    const voo = c.voo();
    // Ciclo do dia (ADR-26): o horário corre do amanhecer à noite, com a hora dourada diante da fachada ao sol
    const ciclo = s.video.luz === "ciclo" && voo ? cicloDoVoo(voo) : null;
    previa.current = new PreviaVoo(
      c,
      voo ? duracaoDoVooAutomatico(voo.comprimento) : 30,
      (u) => {
        if (dias) st().definirDia(diaDoVoo(u, dias, voo?.fimConstrucao));
        if (ciclo) {
          forcarHorario(ciclo(u));
          aplicarSol(c);
        }
      },
      () => {
        previa.current = null;
        setModoDrone(null);
        if (ciclo) {
          forcarHorario(null);
          aplicarSol(c);
        }
      },
    );
  };

  const aoSoltar = (e: React.PointerEvent) => {
    if (modoDrone) return; // no drone, arrastar é olhar, não selecionar
    const t = toque.current;
    toque.current = null;
    if (!t || !modoSelecao || !cena.current) return;
    if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > 4) return; // foi arrasto de câmera
    st().selecionar(cena.current.escolher(e.clientX, e.clientY));
  };

  return (
    <div className={`viewport${simples ? " simples" : ""}`}>
      {!simples && (
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
        <span className="sep" />
        <button
          type="button"
          className="btn"
          aria-pressed={modoDrone === "manual"}
          data-testid="drone-manual"
          data-tip={`Pilote um drone por dentro e por fora da obra enquanto ela é montada.\n${AJUDA_VOO}`}
          onClick={alternarManual}
        >
          Drone
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={modoDrone === "automatico"}
          data-testid="drone-automatico"
          data-tip={`Voo automático: o drone voa em volta e por dentro da obra enquanto ela é montada; com a obra pronta e humanizada, dá uma volta completa por fora, entra, sobe e desce a escada, sai pela porta da frente, dá outra volta por fora e para de frente para a fachada.\nVelocidade de cruzeiro: ${VELOCIDADE_VOO.toLocaleString("pt-BR")} m/s (duração = comprimento do voo ÷ ${VELOCIDADE_VOO.toLocaleString("pt-BR")} m/s).\nÉ o mesmo voo da câmera Drone do vídeo.`}
          onClick={alternarAutomatico}
        >
          Voo automático
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={insolacao !== null}
          disabled={!realistaAtivo}
          data-testid="insolacao"
          data-tip={"Insolação, como no modulus: escolha a hora e veja o sol real (local, data da simulação e norte da casa), as sombras andando, o arco do sol no dia e as fachadas ao sol em laranja, com o sol direto de cada fachada no dia.\nSó na aparência Realista."}
          onClick={alternarInsolacao}
        >
          Insolação
        </button>
        <SeletorAparencia />
        <SeletorLuz />
        {temCronograma && <SeletorVisao />}
      </div>
      )}
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
      {modoDrone === "manual" && <ComandosDrone voo={drone} aoSair={pararDrone} />}
      {modoDrone === "automatico" && (
        <div className="ajuda-drone" role="status">
          Voo automático em andamento ·{" "}
          <button type="button" className="link" onClick={pararDrone}>
            parar
          </button>
        </div>
      )}
      {temCronograma && !simples && <Legenda />}
      <FotoFlutuante />
      {insolacao !== null && <PainelInsolacao minutos={insolacao} aoMudar={definirHoraInsolacao} aoFechar={() => definirHoraInsolacao(null)} />}
      {gerandoVideo && <div className="aviso-video">Gerando vídeo: a pré-visualização está no painel Vídeo.</div>}
    </div>
  );
}

/** Ajuda e direcional na tela, para pilotar também pelo toque. */
function ComandosDrone({ voo, aoSair }: { voo: React.MutableRefObject<VooManual | null>; aoSair(): void }) {
  const botao = (c: Comando, rotulo: string, nome: string) => (
    <button
      type="button"
      className="btn mini"
      aria-label={nome}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        voo.current?.comando(c, true);
      }}
      onPointerUp={() => voo.current?.comando(c, false)}
      onPointerCancel={() => voo.current?.comando(c, false)}
    >
      {rotulo}
    </button>
  );
  return (
    <div className="ajuda-drone" data-testid="ajuda-drone">
      <span>{AJUDA_VOO}</span>
      <div className="direcional">
        {botao("frente", "▲", "Para a frente")}
        {botao("esquerda", "◀", "Para a esquerda")}
        {botao("tras", "▼", "Para trás")}
        {botao("direita", "▶", "Para a direita")}
        {botao("subir", "⤒", "Subir")}
        {botao("descer", "⤓", "Descer")}
      </div>
      <button type="button" className="link" onClick={aoSair}>
        sair do drone
      </button>
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
        <button key={o.id} type="button" role="tab" className="seg" aria-selected={a === o.id} data-testid={`aparencia-${o.id}`} data-rotulo={o.rotulo} data-tip={o.dica} onClick={() => useProjeto.getState().definirAparencia3d(o.id)}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

/**
 * Luz da cena (ADR-24): vale no realista. Fica sempre na barra (inativa na técnica), para os botões não
 * mudarem de lugar ao trocar a aparência.
 */
function SeletorLuz() {
  const realista = useProjeto((s) => s.aparencia3d === "realista");
  const luz = useProjeto((s) => s.video.luz ?? "dia");
  const opcoes: { id: Luz; dica: string }[] = [
    { id: "nascer", dica: "20 min depois do nascer do sol, no dia da simulação, no local da obra e com o norte da casa." },
    { id: "dia", dica: "10h do dia da simulação: o sol real, no local da obra e com o norte da casa, com sombras." },
    { id: "entardecer", dica: "35 min antes do pôr do sol: sol baixo e dourado na fachada que o recebe, e as luzes da casa começando a acender (obra pronta)." },
    { id: "noite", dica: "50 min depois do pôr do sol: hora azul, luar e as luminárias da casa acesas em luz quente (2.700 K), no meio de cada cômodo (obra pronta)." },
    { id: "ciclo", dica: "Ciclo do dia: no Voo automático (e na câmera Drone do vídeo), o horário corre do amanhecer à noite, com a hora dourada diante da fachada que recebe o sol da tarde. Parado, mostra as 10h." },
  ];
  return (
    <div className={`segmentos visao3d luz3d${realista ? "" : " inativo"}`} role="tablist" aria-label="Luz">
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          className="seg"
          aria-selected={luz === o.id}
          aria-disabled={!realista}
          data-testid={`luz-${o.id}`}
          data-rotulo={NOME_LUZ[o.id]}
          data-tip={realista ? `${o.dica}\nVale também para o vídeo e o relatório.` : "A luz vale na aparência Realista."}
          onClick={() => realista && useProjeto.getState().definirVideo({ luz: o.id })}
        >
          {NOME_LUZ[o.id]}
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
          data-rotulo={v.rotulo}
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
