// Editor da montagem em cenas (ADR-25): faixa proporcional e lista editável das cenas do Reels.
import { PRESETS, type Preset } from "../rendering/cameras";
import { NOME_CENA, duracoes, type Cena, type CameraCena, type PessoaNaCena, type TipoCena } from "../rendering/montagem";

const fmt = (n: number, casas = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
const NOME_PESSOA: Record<PessoaNaCena, string> = { cheia: "Tela cheia", recortada: "Recortada", oculta: "Oculta" };

interface Props {
  cenas: Cena[];
  segundos: number;
  temFala: boolean;
  /** Recorte por fundo verde: a abertura mostraria o pano verde. */
  fundoVerde: boolean;
  /** Cena da prévia atual (destacada na faixa). */
  atual: number | null;
  aoMudar(cenas: Cena[] | null): void;
}

export function EditorMontagem({ cenas, segundos, temFala, fundoVerde, atual, aoMudar }: Props) {
  const seg = duracoes(cenas, segundos);
  const soma = cenas.reduce((s, c) => s + c.peso, 0) || 1;
  /** Muda a duração de uma cena mantendo as outras: o peso é proporcional aos segundos. */
  const definirSegundos = (i: number, s: number) => {
    const alvo = Math.max(0.8, Math.min(s, segundos - 0.8 * (cenas.length - 1)));
    const outros = segundos - seg[i];
    const novos = cenas.map((_, j) => (j === i ? alvo : (seg[j] / (outros || 1)) * (segundos - alvo)));
    aoMudar(cenas.map((c, j) => ({ ...c, peso: novos[j] / segundos })));
  };
  const mudar = (i: number, v: Partial<Cena>) => aoMudar(cenas.map((c, j) => (j === i ? { ...c, ...v } : c)));
  const mover = (i: number, d: -1 | 1) => {
    const l = [...cenas];
    [l[i], l[i + d]] = [l[i + d], l[i]];
    aoMudar(l);
  };
  const tipos: TipoCena[] = temFala ? ["fala", "revelacao", "obra", "marca"] : ["obra", "marca"];
  const acrescentar = () => {
    const nova: Cena = { id: `c${Date.now().toString(36)}`, tipo: "obra", peso: 3 / segundos, camera: "isometrica", obra: [1, 1], pessoa: temFala ? "recortada" : "oculta" };
    const marca = cenas.findIndex((c) => c.tipo === "marca");
    const l = [...cenas];
    l.splice(marca >= 0 ? marca : l.length, 0, nova);
    aoMudar(l);
  };

  return (
    <div className="montagem" data-testid="editor-montagem">
      <div
        className="faixa-cenas calc"
        tabIndex={0}
        data-testid="faixa-cenas"
        data-tip={`Fórmula: duração da cena = parte da cena ÷ soma das partes × duração do vídeo\nDuração do vídeo: ${fmt(segundos)} s\n${cenas.map((c, i) => `${NOME_CENA[c.tipo]}: ${fmt((c.peso / soma) * 100, 0)}% → ${fmt(seg[i])} s`).join("\n")}`}
      >
        {cenas.map((c, i) => (
          <span key={c.id} className={`bloco-cena tipo-${c.tipo}${atual === i ? " atual" : ""}`} style={{ flexGrow: c.peso }}>
            <span>{NOME_CENA[c.tipo]}</span>
            <span className="num">{fmt(seg[i])} s</span>
          </span>
        ))}
      </div>
      {fundoVerde && cenas.some((c) => c.tipo === "fala" || c.tipo === "revelacao") && (
        <p className="aviso-honesto" data-testid="aviso-montagem-verde">
          Com o recorte por fundo verde, a abertura mostra o pano verde. Para a revelação "terreno real → projeto", grave a fala no terreno e use o recorte por IA.
        </p>
      )}
      <ol className="lista-cenas" data-testid="lista-cenas">
        {cenas.map((c, i) => (
          <li key={c.id} className={atual === i ? "atual" : undefined}>
            <select aria-label="Tipo da cena" value={c.tipo} onChange={(e) => mudar(i, { tipo: e.target.value as TipoCena, ...(e.target.value === "revelacao" ? { obra: [0, 1] as [number, number] } : {}) })}>
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {NOME_CENA[t]}
                </option>
              ))}
            </select>
            <input type="number" aria-label="Duração (s)" min={0.8} step={0.5} value={Number(seg[i].toFixed(1))} onChange={(e) => definirSegundos(i, Number(e.target.value))} data-testid={`duracao-cena-${i}`} />
            <span className="tenue">s</span>
            {(c.tipo === "obra" || c.tipo === "revelacao") && (
              <>
                <select aria-label="Câmera da cena" value={c.camera} onChange={(e) => mudar(i, { camera: e.target.value as CameraCena })}>
                  <option value="drone">Drone</option>
                  {PRESETS.map((x) => (
                    <option key={x.id} value={x.id as Preset}>
                      {x.rotulo}
                    </option>
                  ))}
                </select>
                <label className="obra-cena" data-tip="Avanço da obra no começo e no fim da cena (0% = terreno, 100% = pronta).">
                  <input type="number" aria-label="Obra no começo (%)" min={0} max={100} step={10} value={Math.round(c.obra[0] * 100)} onChange={(e) => mudar(i, { obra: [Math.min(1, Math.max(0, Number(e.target.value) / 100)), c.obra[1]] })} />
                  <span className="tenue">→</span>
                  <input type="number" aria-label="Obra no fim (%)" min={0} max={100} step={10} value={Math.round(c.obra[1] * 100)} onChange={(e) => mudar(i, { obra: [c.obra[0], Math.min(1, Math.max(0, Number(e.target.value) / 100))] })} />
                  <span className="tenue">%</span>
                </label>
              </>
            )}
            {temFala && c.tipo === "obra" && (
              <select aria-label="Apresentadora na cena" value={c.pessoa} onChange={(e) => mudar(i, { pessoa: e.target.value as PessoaNaCena })}>
                {(Object.keys(NOME_PESSOA) as PessoaNaCena[]).map((x) => (
                  <option key={x} value={x}>
                    {NOME_PESSOA[x]}
                  </option>
                ))}
              </select>
            )}
            <span className="acoes-cena">
              <button type="button" className="btn mini" aria-label="Subir cena" disabled={i === 0} onClick={() => mover(i, -1)}>
                ↑
              </button>
              <button type="button" className="btn mini" aria-label="Descer cena" disabled={i === cenas.length - 1} onClick={() => mover(i, 1)}>
                ↓
              </button>
              <button type="button" className="btn mini" aria-label="Excluir cena" disabled={cenas.length <= 1} onClick={() => aoMudar(cenas.filter((_, j) => j !== i))} data-testid={`excluir-cena-${i}`}>
                ✕
              </button>
            </span>
          </li>
        ))}
      </ol>
      <div className="botoes">
        <button type="button" className="btn" onClick={acrescentar} data-testid="acrescentar-cena">
          Acrescentar cena
        </button>
        <button type="button" className="btn" data-tip={temFala ? "Abertura com a sua fala no terreno, revelação do projeto atrás de você, passeio do drone, volta e marca." : "A obra se monta, o drone passeia pela obra pronta e a marca fecha."} onClick={() => aoMudar(null)} data-testid="roteiro-reels">
          Roteiro Reels
        </button>
      </div>
      {!temFala && <p className="tenue pequeno">Envie o vídeo da sua fala (Apresentadora) para ter a abertura no terreno e a revelação.</p>}
    </div>
  );
}
