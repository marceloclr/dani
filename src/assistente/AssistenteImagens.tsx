// Vídeo de imagens (INC-19): o assistente para uma apresentação feita só de imagens — carregar o PDF (ou as
// imagens), a narração e as trilhas; conferir títulos, seleção, formato e duração; gerar o MP4.
import { useState, useSyncExternalStore } from "react";
import { adicionarTrilhas, aoMudarTrilhas, arquivosDeTrilha, removerTrilha } from "../app/anexos";
import { adicionarArquivos, adicionarNarracao, aoMudarImagens, estadoImagens, removerNarracao, removerTodas } from "../app/imagensDoVideo";
import { useProjeto } from "../state/projectStore";
import { CartaoArquivo, Remover } from "./PassoCarregar";
import { ConferirImagens } from "./ConferirImagens";
import { GerarImagens } from "./GerarImagens";

const PASSOS = ["Carregar", "Conferir", "Gerar"] as const;
const seg = (s: number) => `${s.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;

export const usarImagens = () => useSyncExternalStore(aoMudarImagens, estadoImagens);

function CarregarImagens() {
  const e = usarImagens();
  const trilhas = useSyncExternalStore(aoMudarTrilhas, arquivosDeTrilha);
  const [avisos, setAvisosDe] = useState<Record<string, string[]>>({});
  const setAvisos = (id: string, a: string[]) => setAvisosDe((x) => ({ ...x, [id]: a }));
  const [lendo, setLendo] = useState<string | null>(null);
  const marcadas = e.imagens.filter((i) => i.marcada).length;
  const soltas = e.imagens.filter((i) => i.pagina === null).length;

  return (
    <div className="passo-carregar" data-testid="img-carregar">
      <CartaoArquivo
        id="imagens"
        titulo="PDF ou imagens"
        situacao={e.imagens.length ? "ok" : "falta"}
        estado={lendo ?? (e.imagens.length ? `${e.imagens.length} imagens · ${marcadas} no vídeo` : "obrigatório")}
        aceitar="application/pdf,.pdf,image/jpeg,image/png,image/webp"
        multiplos
        rotulo={e.imagens.length ? "Enviar mais" : "Enviar PDF ou imagens"}
        dica="O PDF de apresentação do projeto (com os renders) ou as imagens soltas (JPEG, PNG ou WebP). Do PDF saem as imagens grandes de cada página, na ordem das páginas; logos e imagens repetidas ficam de fora. O texto da capa vira o título do vídeo. Para enviar vários de uma vez, segure Ctrl ao clicar nos arquivos ou arraste-os para o cartão."
        aoEscolher={async (f) => {
          try {
            setAvisos("imagens", (await adicionarArquivos(f, setLendo)).avisos);
          } finally {
            setLendo(null);
          }
        }}
        avisos={avisos.imagens}
      >
        {e.imagens.length > 0 && (
          <>
            <ol className="lista-arquivos" data-testid="lista-origens">
              {e.pdfs.map((p) => (
                <li key={p} data-ok>
                  <span className="mono">{p}</span>
                  <span className="tenue">{e.imagens.filter((i) => i.nome.startsWith(`${p} ·`)).length} imagens</span>
                </li>
              ))}
              {soltas > 0 && (
                <li data-ok>
                  <span className="mono">imagens soltas</span>
                  <span className="tenue">{soltas}</span>
                </li>
              )}
            </ol>
            {e.tituloDoVideo && (
              <p className="resumo-cartao">
                <strong>{e.tituloDoVideo}</strong>
              </p>
            )}
            <div className="botoes">
              <button type="button" className="btn btn-pequeno" data-testid="remover-imagens" onClick={removerTodas}>
                Remover todas
              </button>
            </div>
          </>
        )}
      </CartaoArquivo>

      <CartaoArquivo
        id="narracao"
        titulo="Narração"
        situacao={e.narracao ? "ok" : "opcional"}
        estado={e.narracao ? `${e.narracao.nome} · ${seg(e.narracao.duracaoS)}` : "opcional: pode vir depois"}
        aceitar="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus"
        rotulo={e.narracao ? "Trocar narração" : "Enviar narração"}
        dica="A voz da engenheira (MP3, M4A, WAV ou OGG). Com ela, o vídeo dura a narração e as imagens se dividem pela fala. Sem ela, gere o vídeo e o roteiro de tempos primeiro, grave a narração seguindo o roteiro e envie depois."
        aoEscolher={async ([f]) => setAvisos("narracao", await adicionarNarracao(f))}
        avisos={avisos.narracao}
      >
        {e.narracao && (
          <ol className="lista-arquivos">
            <li data-ok>
              <span className="mono">{e.narracao.nome}</span>
              <span className="tenue">{seg(e.narracao.duracaoS)}</span>
              <Remover nome={e.narracao.nome} aoRemover={removerNarracao} />
            </li>
          </ol>
        )}
      </CartaoArquivo>

      <CartaoArquivo
        id="trilhas-img"
        titulo="Trilha sonora"
        situacao={trilhas.size ? "ok" : "opcional"}
        estado={trilhas.size ? `${trilhas.size} trilha${trilhas.size > 1 ? "s" : ""}` : "opcional"}
        aceitar="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus"
        multiplos
        rotulo="Enviar trilhas"
        dica="Música de fundo (MP3, M4A, WAV ou OGG). A primeira entra no início; uma segunda, se houver, entra no final. O volume abaixa sozinho sob a narração e some no fim do vídeo. Use músicas com licença para redes sociais."
        aoEscolher={async (f) => setAvisos("trilhas-img", (await adicionarTrilhas(f)).avisos)}
        avisos={avisos["trilhas-img"]}
      >
        {trilhas.size > 0 && (
          <ol className="lista-arquivos" data-testid="lista-trilhas-img">
            {[...trilhas.values()].map((t, k) => (
              <li key={t.nome} data-ok>
                <span className="mono">{t.nome}</span>
                <span className="tenue">{k === 0 ? "início" : k === 1 ? "final" : "fora"} · {seg(t.duracaoS)}</span>
                <Remover nome={t.nome} aoRemover={() => void removerTrilha(t.nome)} />
              </li>
            ))}
          </ol>
        )}
      </CartaoArquivo>
    </div>
  );
}

export function AssistenteImagens() {
  const [passo, setPasso] = useState(0);
  const e = usarImagens();
  const gerando = useProjeto((s) => s.gerandoVideo);
  const pronto = e.imagens.some((i) => i.marcada);
  const liberado = (i: number) => !gerando && (i === 0 || pronto);
  return (
    <>
      <nav className="passos-assistente" aria-label="Passos">
        {PASSOS.map((p, i) => (
          <button key={p} type="button" className="aba-passo" aria-current={passo === i ? "step" : undefined} disabled={!liberado(i)} data-testid={`img-passo-${i + 1}`} onClick={() => setPasso(i)}>
            <span className="num-passo">{i + 1}</span>
            {p}
          </button>
        ))}
        <ModoDoAssistente />
      </nav>
      <div className="assistente-corpo">
        {passo === 0 && <CarregarImagens />}
        {passo === 1 && pronto && <ConferirImagens />}
        {passo === 2 && pronto && <GerarImagens />}
      </div>
      <footer className="assistente-nav">
        <button type="button" className="btn" disabled={passo === 0 || gerando} onClick={() => setPasso(passo - 1)}>
          ← {PASSOS[passo - 1] ?? ""}
        </button>
        {passo === 0 && !pronto && (
          <span className="pendencia" role="status" data-testid="img-pendencia">
            {e.imagens.length ? "Marque ao menos uma imagem." : "Falta o PDF ou as imagens."}
          </span>
        )}
        {passo < 2 && (
          <button type="button" className="btn primario" data-testid="img-avancar" disabled={!liberado(passo + 1)} onClick={() => setPasso(passo + 1)}>
            {PASSOS[passo + 1]} →
          </button>
        )}
      </footer>
    </>
  );
}

/** Troca entre o vídeo da obra (#/) e o vídeo de imagens (#/imagens). */
export function ModoDoAssistente() {
  const imagens = location.hash.startsWith("#/imagens");
  const gerando = useProjeto((s) => s.gerandoVideo);
  return (
    <div className="segmentos modo-assistente" role="tablist" aria-label="Tipo de vídeo">
      <a className="seg" role="tab" href="#/" aria-selected={!imagens} aria-disabled={gerando} data-testid="modo-obra" onClick={(ev) => gerando && ev.preventDefault()} data-tip="Vídeo da obra: o modelo 3D se construindo pelo cronograma, com a apresentação.">
        Vídeo da obra
      </a>
      <a className="seg" role="tab" href="#/imagens" aria-selected={imagens} aria-disabled={gerando} data-testid="modo-imagens" onClick={(ev) => gerando && ev.preventDefault()} data-tip="Vídeo de imagens: apresentação de projeto a partir de um PDF ou de imagens, com títulos dos ambientes e narração.">
        Vídeo de imagens
      </a>
    </div>
  );
}
