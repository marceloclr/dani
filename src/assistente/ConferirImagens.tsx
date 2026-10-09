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
  selecionarAutomaticamente,
  type FormatoImagens,
  type ImagemRecebida,
} from "../app/imagensDoVideo";
import { DURACOES_IMAGENS, ambientesDe, planoDoVideo } from "../rendering/imagensNoVideo";
import { desenharAssinatura, desenharVinheta } from "../rendering/marcaVideo";
import { desenharQuadroDeImagens } from "../rendering/videoDeImagens";
import { usarImagens } from "./AssistenteImagens";

const seg = (s: number) => `${s.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
const ROTULO_FORMATO: Record<FormatoImagens, string> = { vertical: "9:16", horizontal: "16:9", quadrado: "1:1", retrato: "4:5", personalizado: "Outro" };

/** Prévia: o vídeo desenhado em tempo real num canvas pequeno, sem som. */
function Previa({ imagens, segundos, largura, altura, titulo }: { imagens: ImagemRecebida[]; segundos: number; largura: number; altura: number; titulo: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tocando, setTocando] = useState(false);
  const [t, setT] = useState(0);
  // a prévia usa um quadro pequeno com a mesma proporção (o movimento só depende da proporção)
  const esc = Math.min(1, 540 / Math.max(largura, altura));
  const W = Math.round(largura * esc), H = Math.round(altura * esc);
  const plano = useMemo(() => planoDoVideo(imagens, segundos, W, H), [imagens, segundos, W, H]);
  const extras = useMemo(() => ({ capa: titulo, assinatura: desenharAssinatura(W, H, { nome: CLIENTE.nome, slogan: CLIENTE.slogan }), vinheta: segundos >= 6 ? desenharVinheta(W, H, { nome: CLIENTE.nome, slogan: CLIENTE.slogan, secundario: CLIENTE.instagram }) : null }), [W, H, titulo, segundos]);
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
  const plano = useMemo(() => planoDoVideo(e.imagens, segundos, largura, altura), [e.imagens, segundos, largura, altura]);
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
          <div className="botoes">
            <button type="button" className="btn" data-testid="selecionar-auto" data-tip="Marca as imagens que cabem na duração (cerca de 3 s cada), espalhadas entre os ambientes." onClick={selecionarAutomaticamente}>
              Escolher pela duração
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
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <div className="conferir-previa">
        {plano.itens.length > 0 && <Previa imagens={e.imagens} segundos={segundos} largura={largura} altura={altura} titulo={e.tituloDoVideo} />}
      </div>
    </div>
  );
}
