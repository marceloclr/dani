// Sequência do vídeo no passo Conferir (ADR-34): o usuário ordena falas, narrações e fotos (botões ↑ ↓ ou
// arrastando), ajusta a duração das fotos e escolhe onde cada trilha entra e o volume dela.
import { useEffect, useRef, useState } from "react";
import { FOTO_MAX_S, FOTO_MIN_S, mover, type ItemSequencia } from "../app/sequencia";
import type { FalasDoVideo } from "../app/falas";
import { useProjeto } from "../state/projectStore";

const seg = (s: number) => `${s.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
const ROTULO: Record<ItemSequencia["tipo"], string> = { fala: "Vídeo", narracao: "Narração", foto: "Foto", obra: "Obra" };
const ICONE: Record<ItemSequencia["tipo"], string> = { fala: "▶", narracao: "♪", foto: "▣", obra: "◇" };

export function SequenciaDoVideo({ falas }: { falas: FalasDoVideo }) {
  const st = useProjeto.getState;
  const duracoesFoto = useProjeto((s) => s.video.duracoesFoto);
  const temOrdemSalva = useProjeto((s) => !!s.video.sequencia?.length);
  const itens = falas.itens;
  const ids = itens.map((i) => i.id);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const tocando = useRef<HTMLAudioElement | null>(null);
  useEffect(() => () => tocando.current?.pause(), []);

  const reordenar = (id: string, para: number) => st().definirVideo({ sequencia: mover(ids, id, para) });
  const ouvir = (blob: Blob) => {
    tocando.current?.pause();
    const a = new Audio(URL.createObjectURL(blob));
    a.volume = 0.7;
    tocando.current = a;
    void a.play().catch(() => undefined);
    setTimeout(() => {
      if (tocando.current === a) a.pause();
      URL.revokeObjectURL(a.src);
    }, 5000);
  };
  const atualizarTrilha = (nome: string, mudanca: { entra?: string; volume?: number }) =>
    st().definirVideo({ trilhas: falas.trilhas.map(({ nome: n, entra, volume }) => (n === nome ? { nome: n, entra, volume, ...mudanca } : { nome: n, entra, volume })) });

  if (!itens.length && !falas.trilhas.length) return null;
  return (
    <section className="bloco sequencia-video" style={{ ["--acento" as string]: "var(--latao)" }} data-testid="sequencia-video">
      <header>
        <h3>Sequência do vídeo</h3>
        <span className="legenda num">{seg(falas.totalS)}</span>
      </header>
      <ol className="lista-sequencia" aria-label="Ordem do vídeo">
        {itens.map((it, k) => (
          <li
            key={it.id}
            className={`item-sequencia tipo-${it.tipo}${arrastando === it.id ? " arrastando" : ""}`}
            draggable
            data-testid={`item-${it.id}`}
            onDragStart={(e) => {
              setArrastando(it.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => setArrastando(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (arrastando && arrastando !== it.id) reordenar(arrastando, k);
              setArrastando(null);
            }}
          >
            <span className="icone-item" aria-hidden>{ICONE[it.tipo]}</span>
            <span className="nome-item">
              <span className="tenue">{ROTULO[it.tipo]}</span> {it.tipo === "obra" ? <span className="tenue">em silêncio (sem voz)</span> : <span className="mono">{it.nome}</span>}
            </span>
            {it.tipo === "foto" ? (
              <select
                className="duracao-foto"
                aria-label={`Duração da foto ${it.nome}`}
                value={Math.round(duracoesFoto?.[it.id] ?? it.duracaoS)}
                onChange={(e) => st().definirVideo({ duracoesFoto: { ...(duracoesFoto ?? {}), [it.id]: Number(e.target.value) } })}
              >
                {Array.from({ length: FOTO_MAX_S - FOTO_MIN_S + 1 }, (_, i) => FOTO_MIN_S + i).map((s) => (
                  <option key={s} value={s}>{s} s</option>
                ))}
              </select>
            ) : (
              <span className="tenue num">{seg(it.duracaoS)}</span>
            )}
            <span className="mover-item">
              <button type="button" className="btn-icone" aria-label={`Subir ${it.nome}`} data-testid={`subir-${it.id}`} disabled={k === 0} onClick={() => reordenar(it.id, k - 1)}>↑</button>
              <button type="button" className="btn-icone" aria-label={`Descer ${it.nome}`} data-testid={`descer-${it.id}`} disabled={k === itens.length - 1} onClick={() => reordenar(it.id, k + 1)}>↓</button>
            </span>
          </li>
        ))}
        <li className="item-sequencia tipo-fim" aria-disabled>
          <span className="icone-item" aria-hidden>■</span>
          <span className="nome-item tenue">Respiro e marca</span>
          <span className="tenue num">{seg(falas.totalS - itens.reduce((s, i) => s + i.duracaoS, 0))}</span>
        </li>
      </ol>
      {temOrdemSalva && (
        <button type="button" className="btn btn-pequeno" data-testid="restaurar-ordem" onClick={() => st().definirVideo({ sequencia: undefined })}>
          Restaurar ordem
        </button>
      )}

      {falas.trilhas.length > 0 && (
        <>
          <h4 className="titulo-trilhas">Trilhas</h4>
          <ul className="lista-trilhas" data-testid="trilhas-sequencia">
            {falas.trilhas.map((t) => (
              <li key={t.nome}>
                <span className="mono nome-trilha">{t.nome}</span>
                <label className="campo campo-linha">
                  <span>Entra</span>
                  <select value={t.entra} data-testid={`entra-${t.nome}`} onChange={(e) => atualizarTrilha(t.nome, { entra: e.target.value })}>
                    <option value="inicio">no início</option>
                    {itens.map((it) => (
                      <option key={it.id} value={it.id}>antes de {it.nome}</option>
                    ))}
                    <option value="final">no final</option>
                  </select>
                </label>
                <label className="campo campo-linha" data-tip="Volume da trilha: ela ainda abaixa sozinha quando há voz.">
                  <span>Volume</span>
                  <input type="range" min={0} max={100} step={5} value={t.volume} aria-label={`Volume de ${t.nome}`} onChange={(e) => atualizarTrilha(t.nome, { volume: Number(e.target.value) })} />
                </label>
                <button type="button" className="btn-icone" aria-label={`Ouvir 5 s de ${t.nome}`} data-tip="Ouvir 5 s" onClick={() => ouvir(t.blob)}>▶</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
