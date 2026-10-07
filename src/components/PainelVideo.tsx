import { useEffect, useMemo, useRef, useState } from "react";
import { camadasPara, obterCena } from "../app/estadoCena";
import { duracaoObra } from "../fourd/simulacao";
import { PRESETS, diaDoQuadro, poseNoTempo, roteiroPadrao, totalDeQuadros, type PontoRoteiro, type Preset } from "../rendering/cameras";
import { FRACAO_CONSTRUCAO, diaDoVoo } from "../rendering/drone";
import { NOME_MARCA, SLOGAN } from "../app/marca";
import { Cancelado, DESCRICAO_SAIDA, NOME_SAIDA, capacidades, dimensoesDaSaida, dispositivoLimitado, estimarZipMB, gerarVideo, type ArquivoGerado, type Capacidades, type Saida } from "../rendering/VideoRenderer";
import { RESOLUCOES, useProjeto, type ConfigVideo, type FormatoVideo } from "../state/projectStore";
import { baixar } from "../utils/baixar";

const FPS: ConfigVideo["fps"][] = [24, 30];
const DURACOES: ConfigVideo["segundos"][] = [15, 30, 60, 90, 120];
const AVISO_SEM_H264 = "Este navegador não codifica H.264 por conta própria: o MP4 para WhatsApp sai pelo codificador do app (um pouco mais lento) e o MP4 em 1080p fica indisponível.";

const mb = (bytes: number) => `${(bytes / 1_048_576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
const fmt = (n: number, casas = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
const tempo = (s: number) => (s < 60 ? `${Math.ceil(s)} s` : `${Math.floor(s / 60)} min ${Math.ceil(s % 60)} s`);

interface Progresso {
  quadro: number;
  total: number;
  restanteS: number | null;
}

export function PainelVideo() {
  const cronograma = useProjeto((s) => s.cronograma);
  const video = useProjeto((s) => s.video);
  const gerando = useProjeto((s) => s.gerandoVideo);
  const st = useProjeto.getState;
  const { largura, altura } = RESOLUCOES[video.formato];
  const roteiro = video.roteiro ?? roteiroPadrao(video.segundos);
  const comDrone = video.camera === "drone";
  const dias = cronograma ? duracaoObra(cronograma.tarefas) : 0;
  const quadros = totalDeQuadros(video.segundos, video.fps);

  const [caps, setCaps] = useState<Capacidades | null>(null);
  const [saida, setSaida] = useState<Saida | null>(null);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [resultado, setResultado] = useState<(ArquivoGerado & { url: string; resumo: string }) | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [previa, setPrevia] = useState(0);
  const controle = useRef<AbortController | null>(null);
  const quadroPrevia = useRef<HTMLDivElement>(null);
  const limitado = useMemo(dispositivoLimitado, []);

  // saídas realmente suportadas para a resolução e o fps escolhidos
  useEffect(() => {
    let vivo = true;
    capacidades(largura, altura, video.fps).then((c) => {
      if (!vivo) return;
      setCaps(c);
      setSaida((atual) => (atual && c.saidas.includes(atual) ? atual : c.saidas[0]));
    });
    return () => {
      vivo = false;
    };
  }, [largura, altura, video.fps]);

  useEffect(() => () => (resultado ? URL.revokeObjectURL(resultado.url) : undefined), [resultado]);

  if (!cronograma) return <p className="tenue">Carregue um cronograma para gerar o vídeo da obra.</p>;

  const definirRoteiro = (r: PontoRoteiro[]) => st().definirVideo({ roteiro: r });

  const mostrarPrevia = (t: number) => {
    setPrevia(t);
    const cena = obterCena();
    if (!cena) return;
    cena.pararGiro();
    const voo = comDrone ? cena.voo() : null;
    if (voo) {
      cena.posicionarLivre(cena.camera, voo.quadro(t / video.segundos));
      st().definirDia(diaDoVoo(t / video.segundos, dias));
      cena.atualizarPortas(cena.camera.position);
      return;
    }
    cena.mostrarPose(poseNoTempo(roteiro, cena.enquadramento(), t, video.segundos));
    st().definirDia(diaDoQuadro(Math.round(t * video.fps), quadros, dias));
  };

  const capturar = () => {
    const cena = obterCena();
    if (!cena) return;
    const novo: PontoRoteiro = { segundo: previa, camera: "capturada", captura: cena.poseAtual() };
    definirRoteiro([...roteiro.filter((p) => Math.abs(p.segundo - previa) > 0.01), novo].sort((a, b) => a.segundo - b.segundo));
  };

  const gerar = async () => {
    const cena = obterCena();
    if (!cena || !saida) return;
    if (resultado) URL.revokeObjectURL(resultado.url);
    setResultado(null);
    setAviso(null);
    const ac = new AbortController();
    controle.current = ac;
    st().definirGerandoVideo(true);
    st().mostrarErro(null);
    setProgresso({ quadro: 0, total: quadros, restanteS: null });
    const r = roteiro;
    const e = cena.enquadramento();
    const voo = comDrone ? cena.voo() : null;
    const seg = video.segundos;
    try {
      const arq = await gerarVideo(cena, {
        saida,
        largura,
        altura,
        fps: video.fps,
        segundos: video.segundos,
        diasDeObra: dias,
        nomeBase: `obra-4d-${video.formato}-${video.segundos}s`,
        aplicarDia: (d) => cena.aplicar(camadasPara(st(), cena, d, true)),
        ...(video.assinatura !== false ? { assinatura: { nome: NOME_MARCA, slogan: SLOGAN } } : {}),
        poseNoTempo: (t) => poseNoTempo(r, e, t, video.segundos),
        ...(voo
          ? {
              quadroLivre: (t: number) => voo.quadro(t / seg),
              diaNoQuadro: (i: number, n: number) => diaDoVoo(n > 1 ? i / (n - 1) : 1, dias),
            }
          : {}),
        sinal: ac.signal,
        aoProgredir: setProgresso,
        aoCriarCanvas: (c) => {
          c.className = "previa-canvas";
          quadroPrevia.current?.replaceChildren(c);
        },
      });
      const d = dimensoesDaSaida(saida, largura, altura, video.fps);
      setResultado({ ...arq, url: URL.createObjectURL(arq.blob), resumo: `${d.largura} × ${d.altura} · ${d.fps} fps · ${totalDeQuadros(video.segundos, d.fps)} quadros` });
    } catch (err) {
      if (err instanceof Cancelado) setAviso("Geração cancelada. Nenhum arquivo foi criado.");
      else st().mostrarErro({ mensagem: "Não foi possível gerar o vídeo.", orientacao: "Tente outro formato de saída ou uma duração menor.", detalhes: String((err as Error)?.stack ?? err) });
    } finally {
      controle.current = null;
      quadroPrevia.current?.replaceChildren();
      setProgresso(null);
      st().definirGerandoVideo(false);
    }
  };

  const pct = progresso ? Math.round((progresso.quadro / progresso.total) * 100) : 0;
  const semMp4 = caps !== null && !caps.h264Nativo;
  const efetivo = saida ? dimensoesDaSaida(saida, largura, altura, video.fps) : { largura, altura, fps: video.fps };
  const quadrosSaida = totalDeQuadros(video.segundos, efetivo.fps);

  return (
    <div className="painel-video" data-testid="painel-video">
      <fieldset disabled={gerando}>
        <label className="campo">
          <span>Formato</span>
          <select data-testid="video-formato" value={video.formato} onChange={(e) => st().definirVideo({ formato: e.target.value as FormatoVideo })}>
            {(Object.keys(RESOLUCOES) as FormatoVideo[]).map((f) => (
              <option key={f} value={f}>
                {RESOLUCOES[f].rotulo}
              </option>
            ))}
          </select>
        </label>
        <div className="linha-campos">
          <label className="campo">
            <span>Quadros por segundo</span>
            <select data-testid="video-fps" value={video.fps} onChange={(e) => st().definirVideo({ fps: Number(e.target.value) as ConfigVideo["fps"] })}>
              {FPS.map((f) => (
                <option key={f} value={f}>
                  {f} fps
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Duração</span>
            <select data-testid="video-duracao" value={video.segundos} onChange={(e) => st().definirVideo({ segundos: Number(e.target.value) as ConfigVideo["segundos"] })}>
              {DURACOES.map((d) => (
                <option key={d} value={d}>
                  {d} s
                </option>
              ))}
            </select>
          </label>
        </div>
        <p
          className="relacao calc"
          tabIndex={0}
          data-testid="relacao-tempo"
          data-tip-t="Tempo da obra → tempo do vídeo"
          data-tip={
            comDrone
              ? `Fórmula: dias por segundo = dias de obra ÷ (duração × ${FRACAO_CONSTRUCAO})\nCom o drone, a obra é montada na primeira metade do vídeo; a segunda mostra a obra pronta.\nDias de obra: ${dias}\nMontagem: ${fmt(video.segundos * FRACAO_CONSTRUCAO)} s`
              : `Fórmula: dias por segundo = dias de obra ÷ duração do vídeo\nDias de obra: ${dias}\nDuração: ${video.segundos} s\nQuadros: ${video.segundos} s × ${video.fps} fps = ${quadros}\nCada quadro avança ${fmt(dias / quadros, 2)} dia`
          }
        >
          {comDrone
            ? `${dias} dias → ${fmt(video.segundos * FRACAO_CONSTRUCAO)} s de montagem: ${fmt(dias / (video.segundos * FRACAO_CONSTRUCAO))} dias por segundo, depois a obra pronta`
            : `${dias} dias → ${video.segundos} s: ${fmt(dias / video.segundos)} dias por segundo`}
        </p>

        <h4>Câmera do vídeo</h4>
        <div className="segmentos" role="tablist" aria-label="Câmera do vídeo">
          <button type="button" role="tab" className="seg" aria-selected={!comDrone} data-testid="camera-roteiro" data-tip="Vistas fixas em sequência (frontal, isométrica, lateral, superior) ou o seu roteiro de câmeras capturadas." onClick={() => st().definirVideo({ camera: "roteiro" })}>
            Roteiro de vistas
          </button>
          <button
            type="button"
            role="tab"
            className="seg"
            aria-selected={comDrone}
            data-testid="camera-drone"
            data-tip={"Na primeira metade, a obra é montada enquanto o drone voa em volta e entra pela porta.\nNa segunda, com a obra pronta e humanizada, gira pelas fachadas, entra, sobe e desce a escada.\nRecomendado: 60 s ou mais."}
            onClick={() => st().definirVideo({ camera: "drone" })}
          >
            Drone: voo e passeio
          </button>
        </div>
        {comDrone && (
          <p className="relacao" data-testid="resumo-drone">
            {obterCena()?.voo()?.resumo ?? "O voo é calculado a partir do modelo."}
            {video.segundos < 60 && " · com menos de 60 s o passeio fica rápido."}
          </p>
        )}
        {!comDrone && (
        <ul className="roteiro" data-testid="roteiro">
          {roteiro.map((p, i) => (
            <li key={i}>
              <input
                type="number"
                min={0}
                max={video.segundos}
                step={0.5}
                value={Number(p.segundo.toFixed(2))}
                aria-label="Segundo"
                onChange={(e) => definirRoteiro(roteiro.map((x, j) => (j === i ? { ...x, segundo: Math.min(Math.max(Number(e.target.value), 0), video.segundos) } : x)))}
              />
              <span className="tenue">s</span>
              <select
                aria-label="Câmera"
                value={p.camera}
                onChange={(e) => definirRoteiro(roteiro.map((x, j) => (j === i ? { segundo: x.segundo, camera: e.target.value as Preset } : x)))}
              >
                {PRESETS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.rotulo}
                  </option>
                ))}
                {p.camera === "capturada" && <option value="capturada">Câmera capturada</option>}
              </select>
              <button type="button" className="btn mini" disabled={roteiro.length <= 1} aria-label="Remover ponto" onClick={() => definirRoteiro(roteiro.filter((_, j) => j !== i))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        )}
        <label className="campo" data-tip="Mostra na viewport a câmera e o estado da obra neste segundo do vídeo.">
          <span>Prévia {comDrone ? "do voo" : "do roteiro"}: {fmt(previa)} s</span>
          <input type="range" min={0} max={video.segundos} step={0.1} value={previa} onChange={(e) => mostrarPrevia(Number(e.target.value))} />
        </label>
        {!comDrone && (
        <div className="botoes">
          <button type="button" className="btn" data-tip="Grava a câmera atual da viewport como ponto-chave no segundo da prévia." onClick={capturar}>
            Capturar câmera atual
          </button>
          <button type="button" className="btn" disabled={!video.roteiro} data-tip="Volta ao roteiro do §21: frontal, isométrica, lateral e superior." onClick={() => st().definirVideo({ roteiro: null })}>
            Roteiro padrão
          </button>
        </div>
        )}

        <label className="marcar" data-tip={`Faixa discreta no canto inferior esquerdo:\n${NOME_MARCA}\n${SLOGAN}`}>
          <input type="checkbox" checked={video.assinatura !== false} onChange={(e) => st().definirVideo({ assinatura: e.target.checked })} data-testid="video-assinatura" />
          Assinatura da marca no vídeo
        </label>

        <h4>Saída</h4>
        {semMp4 && (
          <p className="aviso-honesto" data-testid="aviso-mp4">
            {AVISO_SEM_H264}
          </p>
        )}
        <label className="campo">
          <span>Arquivo</span>
          <select data-testid="video-saida" value={saida ?? ""} onChange={(e) => setSaida(e.target.value as Saida)} disabled={!caps}>
            {!caps && <option value="">Verificando o navegador…</option>}
            {caps?.saidas.map((x) => (
              <option key={x} value={x}>
                {NOME_SAIDA[x]}
              </option>
            ))}
          </select>
        </label>
        {saida && (
          <p className="descricao-saida pequeno" data-testid="descricao-saida">
            {DESCRICAO_SAIDA[saida]}
            <span className="tenue">
              {" "}
              {efetivo.largura} × {efetivo.altura} · {efetivo.fps} fps · {quadrosSaida} quadros
            </span>
          </p>
        )}
        {saida === "png-zip" && (
          <p className="tenue pequeno calc" tabIndex={0} data-tip={`Estimativa: ${quadros} quadros × ${largura} × ${altura} pixels × ~0,35 byte por pixel`}>
            {quadros} imagens PNG, cerca de {fmt(estimarZipMB(largura, altura, quadros), 0)} MB.
          </p>
        )}
        {limitado && <p className="aviso-honesto">Este dispositivo pode ter dificuldade para gerar vídeo ({limitado}). Prefira 15 s ou um computador.</p>}
      </fieldset>

      {!progresso ? (
        <button type="button" className="btn primario largo" data-testid="gerar-video" disabled={!saida || gerando} onClick={gerar}>
          Gerar {saida === "png-zip" ? "quadros" : saida === "gif" ? "GIF" : "vídeo"}
        </button>
      ) : (
        <div className="progresso-video" role="status" aria-live="polite" data-testid="progresso-video">
          <strong>{saida === "png-zip" ? "GERANDO QUADROS" : "GERANDO VÍDEO"}</strong>
          <div className="barra-progresso">
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="num pequeno">
            {pct}% · Quadro {progresso.quadro} / {progresso.total}
            {progresso.restanteS !== null && ` · Tempo estimado: ${tempo(progresso.restanteS)}`}
          </div>
          <button type="button" className="btn" data-testid="cancelar-video" onClick={() => controle.current?.abort()}>
            Cancelar
          </button>
        </div>
      )}
      <div ref={quadroPrevia} className="previa" />

      {aviso && (
        <p className="tenue" data-testid="aviso-video">
          {aviso}
        </p>
      )}
      {resultado && (
        <div className="resultado-video" data-testid="resultado-video">
          {resultado.tipo === "video" && <video src={resultado.url} controls muted playsInline className="previa-canvas" />}
          {resultado.tipo === "gif" && <img src={resultado.url} alt="Prévia do GIF" className="previa-canvas" />}
          <a className="btn primario largo" href={resultado.url} download={resultado.nome} data-testid="baixar-video">
            Baixar {resultado.nome} ({mb(resultado.blob.size)})
          </a>
          <Compartilhar arquivo={resultado} />
          <p className="tenue pequeno">
            {resultado.descricao} · {resultado.resumo}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Compartilhar (ADR-20): com Web Share de arquivos (celular, Windows, ChromeOS, macOS), abre o seletor do sistema;
 * sem ele (Linux e outros), baixa o arquivo e abre o WhatsApp Web, onde o usuário arrasta o arquivo para a conversa.
 */
function Compartilhar({ arquivo }: { arquivo: ArquivoGerado }) {
  const file = useMemo(() => new File([arquivo.blob], arquivo.nome, { type: arquivo.blob.type }), [arquivo]);
  const pode = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  const [erro, setErro] = useState<string | null>(null);
  const [instrucao, setInstrucao] = useState(false);
  if (arquivo.tipo === "zip") return null;
  if (!pode) {
    return (
      <>
        <button
          type="button"
          className="btn largo"
          data-testid="whatsapp-computador"
          data-tip={"Este navegador não deixa sites anexarem arquivos em outros apps.\nO botão baixa o vídeo e abre o WhatsApp Web numa aba nova; lá, arraste o arquivo baixado para a conversa.\nNada é enviado pelo app."}
          onClick={() => {
            baixar(arquivo.blob, arquivo.nome);
            window.open("https://web.whatsapp.com/", "_blank", "noopener");
            setInstrucao(true);
          }}
        >
          Enviar pelo WhatsApp
        </button>
        {instrucao && (
          <p className="aviso-honesto" data-testid="instrucao-whatsapp">
            O arquivo <strong>{arquivo.nome}</strong> foi baixado. No WhatsApp Web, abra a conversa e arraste o arquivo da pasta Downloads para ela, ou use o clipe › Fotos e vídeos. No aplicativo do WhatsApp para computador, é igual.
          </p>
        )}
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        className="btn largo"
        data-testid="compartilhar-video"
        onClick={async () => {
          setErro(null);
          try {
            await navigator.share({ files: [file], title: arquivo.nome });
          } catch (e) {
            if ((e as Error).name !== "AbortError") setErro("Não foi possível compartilhar; use o botão Baixar.");
          }
        }}
      >
        Compartilhar… (WhatsApp e outros)
      </button>
      {erro && <p className="tenue pequeno">{erro}</p>}
    </>
  );
}
