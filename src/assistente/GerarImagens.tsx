// Vídeo de imagens (INC-19), passo Gerar: o MP4 na resolução escolhida, com a narração e as trilhas.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { aoMudarTrilhas, arquivosDeTrilha } from "../app/anexos";
import { dimensoesDoFormato, duracaoEfetiva } from "../app/imagensDoVideo";
import { CLIENTE } from "../app/marca";
import { nomeSeguro } from "../app/projetos";
import { totalDeQuadros } from "../rendering/cameras";
import { gerarVideoDeImagens } from "../rendering/videoDeImagens";
import { Cancelado, NOME_SAIDA, capacidades, dimensoesDaSaida, type ArquivoGerado, type Saida } from "../rendering/VideoRenderer";
import { useProjeto } from "../state/projectStore";
import { baixar, carimboArquivo } from "../utils/baixar";
import { usarImagens } from "./AssistenteImagens";

const FPS = 30;
const tempo = (s: number) => (s < 60 ? `${Math.ceil(s)} s` : `${Math.floor(s / 60)} min ${Math.ceil(s % 60)} s`);
/** A segunda trilha entra para fechar o vídeo: 8 s antes do fim (como a trilha "no final" do ADR-34). */
export const TRILHA_FINAL_ANTES_S = 8;

/** Onde cada trilha entra: a 1ª no início; a 2ª, 8 s antes do fim (vídeos com mais de 16 s); as outras ficam de fora. */
export function iniciosDasTrilhasDeImagens(n: number, segundos: number): (number | null)[] {
  return Array.from({ length: n }, (_, k) => (k === 0 ? 0 : k === 1 && segundos > 2 * TRILHA_FINAL_ANTES_S ? segundos - TRILHA_FINAL_ANTES_S : null));
}

let ultimo: (ArquivoGerado & { url: string }) | null = null;

export function GerarImagens() {
  const e = usarImagens();
  const trilhas = useSyncExternalStore(aoMudarTrilhas, arquivosDeTrilha);
  const gerando = useProjeto((s) => s.gerandoVideo);
  const st = useProjeto.getState;
  const { largura, altura } = dimensoesDoFormato(e);
  const segundos = duracaoEfetiva(e);
  const [saidas, setSaidas] = useState<Saida[]>([]);
  const [saida, setSaida] = useState<Saida | null>(null);
  const [progresso, setProgresso] = useState<{ quadro: number; total: number; restanteS: number | null } | null>(null);
  const [resultado, setResultadoLocal] = useState(ultimo);
  const setResultado = (r: typeof ultimo) => {
    if (ultimo && ultimo !== r) URL.revokeObjectURL(ultimo.url);
    ultimo = r;
    setResultadoLocal(r);
  };
  const [salvo, setSalvo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const controle = useRef<AbortController | null>(null);
  const quadro = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let vivo = true;
    void capacidades(largura, altura, FPS).then((c) => {
      if (!vivo) return;
      const mp4 = c.saidas.filter((x) => x.startsWith("mp4"));
      setSaidas(mp4);
      setSaida((a) => (a && mp4.includes(a) ? a : mp4.includes("mp4-alta") ? "mp4-alta" : mp4[0] ?? null));
    });
    return () => {
      vivo = false;
    };
  }, [largura, altura]);

  const gerar = async () => {
    if (!saida) return;
    setResultado(null);
    setSalvo(false);
    setAviso(null);
    const ac = new AbortController();
    controle.current = ac;
    st().definirGerandoVideo(true);
    st().mostrarErro(null);
    setProgresso({ quadro: 0, total: totalDeQuadros(segundos, FPS), restanteS: null });
    try {
      const lista = [...trilhas.values()];
      const inicios = iniciosDasTrilhasDeImagens(lista.length, segundos);
      const arq = await gerarVideoDeImagens({
        saida,
        largura,
        altura,
        fps: FPS,
        segundos,
        nomeBase: `${nomeSeguro(e.tituloDoVideo || "apresentacao")}-${carimboArquivo()}`,
        imagens: e.imagens,
        tituloDoVideo: e.tituloDoVideo,
        narracao: e.duracao === "narracao" && e.narracao ? { blob: e.narracao.blob, duracaoS: e.narracao.duracaoS } : null,
        trilhas: lista.flatMap((t, k) => (inicios[k] === null ? [] : [{ blob: t.blob, iniS: inicios[k]!, volume: 1 }])),
        assinatura: { nome: CLIENTE.nome, slogan: CLIENTE.slogan },
        vinheta: { nome: CLIENTE.nome, slogan: CLIENTE.slogan, secundario: CLIENTE.instagram },
        sinal: ac.signal,
        aoProgredir: setProgresso,
        aoCriarCanvas: (c) => {
          c.className = "previa-canvas";
          quadro.current?.replaceChildren(c);
        },
      });
      setResultado({ ...arq, url: URL.createObjectURL(arq.blob) });
      baixar(arq.blob, arq.nome);
      setSalvo(true);
    } catch (err) {
      if (err instanceof Cancelado) setAviso("Geração cancelada.");
      else st().mostrarErro({ mensagem: "Não foi possível gerar o vídeo.", orientacao: "Tente a saída MP4 para WhatsApp ou menos imagens.", detalhes: String((err as Error)?.stack ?? err) });
    } finally {
      controle.current = null;
      quadro.current?.replaceChildren();
      setProgresso(null);
      st().definirGerandoVideo(false);
    }
  };

  const d = saida ? dimensoesDaSaida(saida, largura, altura, FPS) : { largura, altura, fps: FPS };
  const pct = progresso ? Math.round((progresso.quadro / progresso.total) * 100) : 0;
  const marcadas = e.imagens.filter((i) => i.marcada).length;
  const semVoz = e.duracao !== "narracao" || !e.narracao;

  return (
    <div className="passo-gerar" data-testid="img-gerar">
      <section className="bloco" style={{ ["--acento" as string]: "var(--latao)" }}>
        <header>
          <h3>Vídeo de imagens</h3>
          <span className="legenda num">
            {d.largura} × {d.altura} · {tempo(segundos)}
          </span>
        </header>
        <p className="config-gerar" data-testid="config-img">
          {marcadas} imagens · {semVoz ? "sem narração" : `narração ${e.narracao!.nome}`} · {trilhas.size ? `${Math.min(2, trilhas.size)} trilha${trilhas.size > 1 ? "s" : ""}` : "sem trilha"}
        </p>
        <div className="linha-gerar">
          <label className="campo campo-linha">
            <span>Saída</span>
            <select value={saida ?? ""} disabled={gerando || !saidas.length} data-testid="img-saida" onChange={(ev) => setSaida(ev.target.value as Saida)}>
              {saidas.map((s) => (
                <option key={s} value={s}>
                  {NOME_SAIDA[s]}
                </option>
              ))}
            </select>
          </label>
          {gerando ? (
            <button type="button" className="btn" data-testid="img-cancelar" onClick={() => controle.current?.abort()}>
              Cancelar
            </button>
          ) : (
            <button type="button" className="btn primario" data-testid="img-gerar-video" disabled={!saida} onClick={() => void gerar()}>
              Gerar vídeo
            </button>
          )}
        </div>
        {progresso && (
          <div className="progresso-gerar" role="status" aria-live="polite">
            <div className="barra-progresso">
              <span style={{ width: `${pct}%` }} />
            </div>
            <span className="num" data-testid="img-progresso">
              {pct}%{progresso.restanteS !== null ? ` · faltam ${tempo(progresso.restanteS)}` : ""}
            </span>
          </div>
        )}
        <div ref={quadro} className="quadro-gerando" />
        {aviso && <p className="tenue">{aviso}</p>}
        {resultado && (
          <div className="resultado-gerar" data-testid="img-resultado">
            {salvo && (
              <p className="salvo-em" role="status" data-testid="img-salvo">
                Vídeo salvo na pasta de downloads: <strong className="mono">{resultado.nome}</strong>
              </p>
            )}
            <video src={resultado.url} controls playsInline className="video-final" />
            <button type="button" className="btn" onClick={() => baixar(resultado.blob, resultado.nome)}>
              Baixar de novo
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
