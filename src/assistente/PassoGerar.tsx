// Passo 3 do assistente (ADR-30): gera o MP4 (montagem pelas falas, com a voz) e oferece o download.
import { useEffect, useRef, useState } from "react";
import { obterCena } from "../app/estadoCena";
import { nomeSeguro } from "../app/projetos";
import { gerarVideoDaObra } from "../app/videoDaObra";
import { formatarISO, hojeCivil } from "../fourd/tempo";
import { Cancelado, NOME_SAIDA, capacidades, dimensoesDaSaida, type ArquivoGerado, type Saida } from "../rendering/VideoRenderer";
import { totalDeQuadros } from "../rendering/cameras";
import { RESOLUCOES, useProjeto } from "../state/projectStore";
import { baixar } from "../utils/baixar";
import type { FalasDoVideo } from "../app/falas";
import type { Cena } from "../rendering/montagem";

const tempo = (s: number) => (s < 60 ? `${Math.ceil(s)} s` : `${Math.floor(s / 60)} min ${Math.ceil(s % 60)} s`);

/** Nome dos arquivos gerados: obra e data, ex.: sobrado-de-exemplo-20261008. */
export function nomeDaEntrega(obra: string | undefined, dia = hojeCivil()): string {
  return `${nomeSeguro(obra || "obra")}-${formatarISO(dia).replace(/-/g, "")}`;
}

export function PassoGerar({ falas, cenas, segundos }: { falas: FalasDoVideo; cenas: Cena[]; segundos: number }) {
  const video = useProjeto((s) => s.video);
  const obra = useProjeto((s) => s.planilha?.obra.nome);
  const gerando = useProjeto((s) => s.gerandoVideo);
  const st = useProjeto.getState;
  const { largura, altura } = RESOLUCOES[video.formato];
  const [saidas, setSaidas] = useState<Saida[]>([]);
  const [saida, setSaida] = useState<Saida | null>(null);
  const [progresso, setProgresso] = useState<{ quadro: number; total: number; restanteS: number | null } | null>(null);
  const [resultado, setResultado] = useState<(ArquivoGerado & { url: string }) | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const controle = useRef<AbortController | null>(null);
  const quadro = useRef<HTMLDivElement>(null);

  // só as saídas MP4: as que este navegador consegue gerar neste formato
  useEffect(() => {
    let vivo = true;
    void capacidades(largura, altura, video.fps).then((c) => {
      if (!vivo) return;
      const mp4 = c.saidas.filter((x) => x.startsWith("mp4"));
      setSaidas(mp4);
      setSaida((a) => (a && mp4.includes(a) ? a : mp4.includes("mp4-alta") ? "mp4-alta" : mp4[0] ?? null));
    });
    return () => {
      vivo = false;
    };
  }, [largura, altura, video.fps]);
  useEffect(() => () => (resultado ? URL.revokeObjectURL(resultado.url) : undefined), [resultado]);

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
    setProgresso({ quadro: 0, total: totalDeQuadros(segundos, video.fps), restanteS: null });
    try {
      const arq = await gerarVideoDaObra(cena, {
        saida,
        segundos,
        camera: "montagem",
        cenas,
        roteiro: [],
        fala: falas.cfg && falas.trechos.length ? { fonte: falas.trechos, cfg: falas.cfg } : null,
        nomeBase: nomeDaEntrega(obra),
        sinal: ac.signal,
        aoProgredir: setProgresso,
        aoCriarCanvas: (c) => {
          c.className = "previa-canvas";
          quadro.current?.replaceChildren(c);
        },
      });
      setResultado({ ...arq, url: URL.createObjectURL(arq.blob) });
    } catch (e) {
      if (e instanceof Cancelado) setAviso("Geração cancelada.");
      else st().mostrarErro({ mensagem: "Não foi possível gerar o vídeo.", orientacao: "Tente a saída MP4 para WhatsApp ou um formato menor.", detalhes: String((e as Error)?.stack ?? e) });
    } finally {
      controle.current = null;
      quadro.current?.replaceChildren();
      setProgresso(null);
      st().definirGerandoVideo(false);
    }
  };

  const d = saida ? dimensoesDaSaida(saida, largura, altura, video.fps) : { largura, altura, fps: video.fps };
  const pct = progresso ? Math.round((progresso.quadro / progresso.total) * 100) : 0;

  return (
    <div className="passo-gerar" data-testid="passo-gerar">
      <section className="bloco" style={{ ["--acento" as string]: "var(--latao)" }}>
        <header>
          <h3>Vídeo</h3>
          <span className="legenda num calc" tabIndex={0} data-tip={`Fórmula: quadros = duração × fps\nDuração: ${segundos.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s${falas.trechos.length ? " (falas + marca)" : ""}\nfps: ${d.fps}\nQuadros: ${totalDeQuadros(segundos, d.fps)}`}>
            {d.largura} × {d.altura} · {tempo(segundos)}
          </span>
        </header>
        <div className="linha-gerar">
          <label className="campo campo-linha">
            <span>Saída</span>
            <select value={saida ?? ""} disabled={gerando || !saidas.length} data-testid="assistente-saida" onChange={(e) => setSaida(e.target.value as Saida)}>
              {saidas.map((s) => (
                <option key={s} value={s}>{NOME_SAIDA[s]}</option>
              ))}
            </select>
          </label>
          {gerando ? (
            <button type="button" className="btn" data-testid="assistente-cancelar" onClick={() => controle.current?.abort()}>
              Cancelar
            </button>
          ) : (
            <button type="button" className="btn primario" data-testid="assistente-gerar" disabled={!saida} data-tip="Gera o MP4 neste navegador, quadro a quadro, com a voz das falas." onClick={() => void gerar()}>
              Gerar vídeo
            </button>
          )}
        </div>
        {progresso && (
          <div className="progresso-gerar" role="status" aria-live="polite">
            <div className="barra-progresso">
              <span style={{ width: `${pct}%` }} />
            </div>
            <span className="num" data-testid="assistente-progresso">
              {pct}%{progresso.restanteS !== null ? ` · faltam ${tempo(progresso.restanteS)}` : ""}
            </span>
          </div>
        )}
        <div ref={quadro} className="quadro-gerando" />
        {aviso && <p className="tenue">{aviso}</p>}
        {resultado && (
          <div className="resultado-gerar" data-testid="assistente-resultado">
            <video src={resultado.url} controls playsInline className={`video-final formato-${video.formato}`} />
            <button type="button" className="btn primario" data-testid="assistente-baixar-video" onClick={() => baixar(resultado.blob, resultado.nome)}>
              Baixar {resultado.nome}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
