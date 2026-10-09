// Vídeo de imagens (INC-19), passo Conferir: título do vídeo, formato, duração, a lista de imagens (título do
// ambiente, no vídeo ou não, ordem) e a prévia tocando o vídeo sem som.
import { useEffect, useMemo, useRef, useState } from "react";
import { CLIENTE } from "../app/marca";
import {
  FORMATOS_IMAGENS,
  LADO_MAX,
  LADO_MIN,
  alternarMarcada,
  definirConfig,
  definirTitulo,
  dimensoesDoFormato,
  duracaoEfetiva,
  marcarTodas,
  moverImagem,
  opcoesDoVoo,
  removerImagem,
  selecionarAutomaticamente,
  type FormatoImagens,
  type ImagemRecebida,
} from "../app/imagensDoVideo";
import { DURACOES_IMAGENS, VOO_MAX_S, VOO_MIN_S, ambientesDe, planoDoVideo, roteiroDeTempos } from "../rendering/imagensNoVideo";
import { useProjeto } from "../state/projectStore";
import { nomeSeguro } from "../app/projetos";
import { baixar, carimboArquivo } from "../utils/baixar";
import { desenharAssinatura, desenharVinheta } from "../rendering/marcaVideo";
import { VOO_NA_PREVIA, desenharQuadroDeImagens } from "../rendering/videoDeImagens";
import { usarImagens } from "./AssistenteImagens";

const seg = (s: number) => `${s.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
const ROTULO_FORMATO: Record<FormatoImagens, string> = { vertical: "9:16", horizontal: "16:9", quadrado: "1:1", retrato: "4:5", personalizado: "Outro" };

/** Prévia: o vídeo desenhado em tempo real num canvas pequeno, sem som. */
function Previa({ imagens, segundos, largura, altura, titulo, voo, transicoes }: { imagens: ImagemRecebida[]; segundos: number; largura: number; altura: number; titulo: string; voo: { aberturaS?: number; encerramentoS?: number }; transicoes: "variadas" | "dissolver" }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tocando, setTocando] = useState(false);
  const [t, setT] = useState(0);
  // a prévia usa um quadro pequeno com a mesma proporção (o movimento só depende da proporção)
  const esc = Math.min(1, 540 / Math.max(largura, altura));
  const W = Math.round(largura * esc), H = Math.round(altura * esc);
  const plano = useMemo(() => planoDoVideo(imagens, segundos, W, H, voo, transicoes), [imagens, segundos, W, H, voo, transicoes]);
  const extras = useMemo(() => ({ voo: plano.voos.length ? VOO_NA_PREVIA : null, capa: titulo, assinatura: desenharAssinatura(W, H, { nome: CLIENTE.nome, slogan: CLIENTE.slogan }), vinheta: segundos >= 6 ? desenharVinheta(W, H, { nome: CLIENTE.nome, slogan: CLIENTE.slogan, secundario: CLIENTE.instagram }) : null }), [W, H, titulo, segundos, plano]);
  const cache = useRef(new Map<string, Promise<ImageBitmap>>());
  useEffect(
    () => () => {
      // fecha e esquece (o React monta duas vezes no desenvolvimento: o cache não pode guardar imagens fechadas)
      cache.current.forEach((p) => void p.then((b) => b.close()));
      cache.current.clear();
    },
    [],
  );
  const abrir = (ix: number[]) =>
    Promise.all(
      ix.map(async (i) => {
        const im = imagens[i];
        let p = cache.current.get(im.id);
        if (!p) {
          // o bastante para cobrir o quadro da prévia com o zoom do movimento
          const k = Math.min(1, Math.max(W / im.largura, H / im.altura) * 1.15);
          p = createImageBitmap(im.blob, { resizeWidth: Math.round(im.largura * k), resizeQuality: "medium" });
          cache.current.set(im.id, p);
        }
        const bmp = await p;
        return { i, bmp, k: bmp.width / im.largura };
      }),
    );
  // desenha o instante t (parado) ou toca em tempo real
  useEffect(() => {
    const c = ref.current?.getContext("2d");
    if (!c || !plano.itens.length) return;
    let vivo = true;
    // a prévia pode sair da tela no meio de um quadro (imagens já fechadas): o quadro perdido não importa
    const desenhar = (instante: number) => desenharQuadroDeImagens(c, W, H, plano, instante, abrir, extras).catch(() => {});
    if (!tocando) {
      void desenhar(t);
      return () => {
        vivo = false;
      };
    }
    const t0 = performance.now() - t * 1000;
    const passo = async () => {
      if (!vivo) return;
      const agora = (performance.now() - t0) / 1000;
      if (agora >= segundos) {
        setTocando(false);
        setT(0);
        return;
      }
      await desenhar(agora);
      if (!vivo) return;
      setT(agora);
      requestAnimationFrame(() => void passo());
    };
    void passo();
    return () => {
      vivo = false;
    };
    // abrir muda a cada render, mas usa o cache: fica fora das dependências de propósito
  }, [tocando, plano, extras, W, H, segundos, tocando ? 0 : t]);
  return (
    <div className="previa-imagens">
      <canvas ref={ref} width={W} height={H} className={`canvas-previa-imagens${altura > largura ? " em-pe" : ""}`} data-testid="previa-imagens" />
      <div className="controles-previa">
        <button type="button" className="btn btn-pequeno" data-testid="tocar-previa" onClick={() => setTocando(!tocando)}>
          {tocando ? "Pausar" : "▶ Prévia"}
        </button>
        <input type="range" min={0} max={segundos} step={0.1} value={t} aria-label="Instante da prévia" onChange={(ev) => (setTocando(false), setT(Number(ev.target.value)))} />
        <span className="num tenue">{seg(Math.floor(t * 10) / 10)}</span>
      </div>
      <p className="nota-cartao">Prévia sem som e mais leve; o vídeo gerado sai na resolução escolhida, com a narração e a trilha.</p>
    </div>
  );
}

export function ConferirImagens() {
  const e = usarImagens();
  const { largura, altura } = dimensoesDoFormato(e);
  const segundos = duracaoEfetiva(e);
  const temModelo = useProjeto((s) => !!s.tipoModelo);
  const voo = useMemo(() => opcoesDoVoo(e.voo, temModelo), [e.voo, temModelo]);
  const plano = useMemo(() => planoDoVideo(e.imagens, segundos, largura, altura, voo, e.transicoes), [e.imagens, segundos, largura, altura, voo, e.transicoes]);
  const marcadas = e.imagens.filter((i) => i.marcada).length;
  const ambientes = ambientesDe(e.imagens);
  // título que vale para cada imagem (o digitado ou o do ambiente anterior), para a dica do campo
  const doAmbiente: string[] = [];
  ambientes.forEach((a) => a.indices.forEach((i) => (doAmbiente[i] = a.titulo ?? "")));

  return (
    <div className="passo-conferir conferir-imagens" data-testid="img-conferir">
      <div className="conferir-dados">
        <section className="bloco">
          <header>
            <h3>Vídeo</h3>
            <span className="legenda num">{largura} × {altura} · {seg(segundos)}</span>
          </header>
          <label className="campo">
            <span>Título do vídeo (capa)</span>
            <input type="text" value={e.tituloDoVideo} placeholder="Ex.: Apresentação de projeto — Casa JP&M" data-testid="titulo-video" onChange={(ev) => definirConfig({ tituloDoVideo: ev.target.value })} />
          </label>
          <div className="campo">
            <span>Formato</span>
            <div className="segmentos" role="radiogroup" aria-label="Formato">
              {(Object.keys(ROTULO_FORMATO) as FormatoImagens[]).map((f) => (
                <button key={f} type="button" className="seg" role="radio" aria-selected={e.formato === f} aria-checked={e.formato === f} data-testid={`formato-img-${f}`} data-tip={f === "personalizado" ? "Largura e altura à sua escolha (até 1920 px e a área de 1080p)." : FORMATOS_IMAGENS[f].rotulo} onClick={() => definirConfig({ formato: f })}>
                  {ROTULO_FORMATO[f]}
                </button>
              ))}
            </div>
          </div>
          {e.formato === "personalizado" && (
            <div className="linha-dimensoes">
              <label className="campo">
                <span>Largura (px)</span>
                <input type="number" min={LADO_MIN} max={LADO_MAX} step={2} value={e.personalizado.largura} data-testid="largura-img" onChange={(ev) => definirConfig({ personalizado: { ...e.personalizado, largura: Number(ev.target.value) } })} />
              </label>
              <label className="campo">
                <span>Altura (px)</span>
                <input type="number" min={LADO_MIN} max={LADO_MAX} step={2} value={e.personalizado.altura} data-testid="altura-img" onChange={(ev) => definirConfig({ personalizado: { ...e.personalizado, altura: Number(ev.target.value) } })} />
              </label>
            </div>
          )}
          <div className="campo">
            <span>Duração</span>
            <div className="segmentos" role="radiogroup" aria-label="Duração">
              {e.narracao && (
                <button type="button" className="seg" role="radio" aria-selected={e.duracao === "narracao"} aria-checked={e.duracao === "narracao"} data-testid="duracao-narracao" data-tip="O vídeo dura a narração, mais a vinheta, um respiro e o encerramento." onClick={() => definirConfig({ duracao: "narracao" })}>
                  Narração
                </button>
              )}
              {DURACOES_IMAGENS.map((d) => (
                <button key={d} type="button" className="seg" role="radio" aria-selected={e.duracao === d} aria-checked={e.duracao === d} data-testid={`duracao-img-${d}`} onClick={() => definirConfig({ duracao: d })}>
                  {d} s
                </button>
              ))}
            </div>
          </div>
          <div className="campo">
            <span>Transições</span>
            <div className="segmentos" role="radiogroup" aria-label="Transições">
              <button type="button" className="seg" role="radio" aria-selected={e.transicoes === "variadas"} aria-checked={e.transicoes === "variadas"} data-testid="transicoes-variadas" data-tip="Dentro do ambiente: dissolver e aproximar, com uma marcante a cada três. Na troca de ambiente: empurrar, varrer e abrir em círculo, em rodízio." onClick={() => definirConfig({ transicoes: "variadas" })}>
                Variadas
              </button>
              <button type="button" className="seg" role="radio" aria-selected={e.transicoes === "dissolver"} aria-checked={e.transicoes === "dissolver"} data-testid="transicoes-dissolver" data-tip="Todas as imagens entram dissolvendo, mais sóbrio." onClick={() => definirConfig({ transicoes: "dissolver" })}>
                Só dissolver
              </button>
            </div>
          </div>
          <div className="botoes">
            <button type="button" className="btn" data-testid="selecionar-auto" data-tip="Marca as imagens que cabem na duração (cerca de 3 s cada), espalhadas entre os ambientes." onClick={selecionarAutomaticamente}>
              Escolher pela duração
            </button>
            <button
              type="button"
              className="btn"
              data-testid="baixar-roteiro"
              disabled={!plano.itens.length}
              data-tip="Roteiro de tempos (TXT) para gravar a narração: quando falar, quanto tempo cada ambiente fica na tela e a ordem das imagens."
              onClick={() => {
                const txt = roteiroDeTempos(plano, e.imagens.map((i) => i.titulo || (i.pagina !== null ? `p. ${i.pagina}` : i.nome)), e.tituloDoVideo, { largura, altura });
                baixar(new Blob(["﻿" + txt.replace(/\n/g, "\r\n")], { type: "text/plain;charset=utf-8" }), `${nomeSeguro(e.tituloDoVideo || "apresentacao")}-roteiro-${carimboArquivo()}.txt`);
              }}
            >
              Baixar roteiro
            </button>
          </div>
          <p className="resumo-cartao" data-testid="resumo-plano">
            {marcadas} de {e.imagens.length} imagens no vídeo · {ambientes.filter((a) => a.titulo).length} ambientes{plano.porImagemS > 0 ? ` · ${seg(Math.round(plano.porImagemS * 10) / 10)} cada` : ""}
          </p>
          {plano.aviso && (
            <p className="aviso-plano" role="alert" data-testid="aviso-plano">
              {plano.aviso}
            </p>
          )}
        </section>
        {temModelo && (
          <section className="bloco" data-testid="bloco-voo">
            <header>
              <h3>Voo do drone</h3>
              <span className="legenda">casa 3D pronta</span>
            </header>
            <div className="campo">
              <span>Onde</span>
              <div className="segmentos" role="radiogroup" aria-label="Voo do drone">
                {(["nenhum", "abertura", "encerramento", "ambos"] as const).map((o) => (
                  <button key={o} type="button" className="seg" role="radio" aria-selected={e.voo.onde === o} aria-checked={e.voo.onde === o} data-testid={`voo-${o}`} onClick={() => definirConfig({ voo: { ...e.voo, onde: o } })}>
                    {{ nenhum: "Nenhum", abertura: "Abertura", encerramento: "Encerramento", ambos: "Os dois" }[o]}
                  </button>
                ))}
              </div>
            </div>
            {e.voo.onde !== "nenhum" && (
              <div className="linha-dimensoes">
                <label className="campo">
                  <span>Duração de cada voo</span>
                  <select value={e.voo.duracaoS} data-testid="voo-duracao" onChange={(ev) => definirConfig({ voo: { ...e.voo, duracaoS: Number(ev.target.value) } })}>
                    {Array.from({ length: VOO_MAX_S - VOO_MIN_S + 1 }, (_, k) => VOO_MIN_S + k).map((s) => (
                      <option key={s} value={s}>
                        {s} s
                      </option>
                    ))}
                  </select>
                </label>
                <label className="campo">
                  <span>Percurso</span>
                  <select value={e.voo.percurso} data-testid="voo-percurso" onChange={(ev) => definirConfig({ voo: { ...e.voo, percurso: ev.target.value as "volta" | "porta" } })}>
                    <option value="volta">Volta por fora</option>
                    <option value="porta">Volta e entrada pela porta</option>
                  </select>
                </label>
              </div>
            )}
            <p className="nota-cartao">O voo aparece no vídeo gerado; na prévia, um quadro marca o lugar dele. Gerar fica mais lento: o trecho 3D é desenhado quadro a quadro.</p>
          </section>
        )}
        <section className="bloco">
          <header>
            <h3>Imagens</h3>
            <span className="botoes-inline">
              <button type="button" className="btn btn-pequeno" onClick={() => marcarTodas(true)}>
                Todas
              </button>
              <button type="button" className="btn btn-pequeno" onClick={() => marcarTodas(false)}>
                Nenhuma
              </button>
            </span>
          </header>
          <p className="nota-cartao">Digite o título só na primeira imagem de cada ambiente: as seguintes continuam nele até o próximo título.</p>
          <ol className="lista-imagens" data-testid="lista-imagens">
            {e.imagens.map((im, k) => (
              <li key={im.id} className={im.marcada ? "" : "fora-do-video"} data-testid={`img-${k}`}>
                <img src={im.url} alt="" loading="lazy" className="miniatura" />
                <div className="dados-imagem">
                  <label className="marcar-imagem">
                    <input type="checkbox" checked={im.marcada} data-testid={`marcar-img-${k}`} onChange={() => alternarMarcada(im.id)} />
                    <span className="tenue">{im.pagina !== null ? `p. ${im.pagina}` : im.nome}</span>
                  </label>
                  <input type="text" className="titulo-imagem" value={im.titulo} placeholder={doAmbiente[k] ? `${doAmbiente[k]} (continua)` : "Título do ambiente"} aria-label={`Título do ambiente da imagem ${k + 1}`} data-testid={`titulo-img-${k}`} onChange={(ev) => definirTitulo(im.id, ev.target.value)} />
                </div>
                <div className="mover-item">
                  <button type="button" className="btn-icone" aria-label="Subir" disabled={k === 0} onClick={() => moverImagem(im.id, -1)}>
                    ↑
                  </button>
                  <button type="button" className="btn-icone" aria-label="Descer" disabled={k === e.imagens.length - 1} onClick={() => moverImagem(im.id, 1)}>
                    ↓
                  </button>
                  <button type="button" className="btn-icone remover-imagem" aria-label={`Excluir a imagem ${k + 1}`} data-tip="Excluir esta imagem (enviada por engano). Para só tirá-la do vídeo, desmarque." data-testid={`excluir-img-${k}`} onClick={() => removerImagem(im.id)}>
                    ×
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <div className="conferir-previa">
        {plano.itens.length > 0 && <Previa imagens={e.imagens} segundos={segundos} largura={largura} altura={altura} titulo={e.tituloDoVideo} voo={voo} transicoes={e.transicoes} />}
      </div>
    </div>
  );
}
