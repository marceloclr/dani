// Apresentadora em primeiro plano (ADR-24): envio do vídeo da fala, recorte (IA ou fundo verde),
// posição, tamanho e duração pela fala, com prévia do recorte.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { aoMudarApresentadora, blobDaApresentadora, carregarApresentadora, removerApresentadora } from "../app/anexos";
import { useProjeto } from "../state/projectStore";
import { duracaoDoVideo, type ConfigApresentadora, type PosicaoApresentadora, type Recorte } from "../rendering/composicao";
import { SeletorArquivo } from "./SeletorArquivo";

const fmt = (n: number, casas = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });
const hex = (c: [number, number, number]) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const doHex = (h: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];

const DICA_GRAVACAO =
  "Para não parecer amador:\n• celular na vertical, em 4K ou 1080p, apoiado (tripé)\n• luz de frente, suave (janela ou ring light), sem contraluz\n• microfone de lapela\n• fundo liso ou pano verde bem esticado e iluminado por igual\n• enquadramento da cintura para cima, olhando para a lente\nFormatos: MP4 ou MOV do celular, ou WebM. No iPhone, prefira \"Mais compatível\" (H.264).";

export function SecaoApresentadora({ largura, altura, segundosEscolhidos }: { largura: number; altura: number; segundosEscolhidos: number }) {
  const cfg = useProjeto((s) => s.video.apresentadora ?? null);
  const blob = useSyncExternalStore(aoMudarApresentadora, blobDaApresentadora);
  const st = useProjeto.getState;
  const [previa, setPrevia] = useState<string | null>(null);
  const [quadro, setQuadro] = useState<HTMLCanvasElement | null>(null);
  const [carregando, setCarregando] = useState(false);
  const relogio = useRef(0);

  const mudar = (v: Partial<ConfigApresentadora>) => cfg && st().definirVideo({ apresentadora: { ...cfg, ...v } });

  // prévia do recorte: refeita quando muda o arquivo, o recorte, a posição ou o tamanho
  const chavePrevia = cfg ? `${cfg.recorte}|${cfg.chave}|${cfg.tolerancia}|${cfg.suavidade}|${cfg.posicao}|${cfg.alturaFracao}|${largura}x${altura}` : "";
  useEffect(() => {
    if (!cfg || !blob) {
      setPrevia(null);
      return;
    }
    const meu = ++relogio.current;
    setCarregando(true);
    const k = Math.min(1, 360 / Math.max(largura, altura));
    import("../rendering/apresentadora")
      .then(async (m) => {
        const [p, q] = await Promise.all([m.previaApresentadora(blob, cfg, Math.round(largura * k), Math.round(altura * k)), quadro ? Promise.resolve(quadro) : m.quadroDaFala(blob)]);
        if (meu !== relogio.current) return;
        setPrevia(p.toDataURL("image/png"));
        setQuadro(q);
      })
      .catch(() => meu === relogio.current && setPrevia(null))
      .finally(() => meu === relogio.current && setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob, chavePrevia]);
  useEffect(() => setQuadro(null), [blob]);

  /** Conta-gotas: a cor do fundo verde é a do ponto clicado no quadro original. */
  const pegarCor = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!quadro) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * quadro.width);
    const y = Math.floor(((e.clientY - r.top) / r.height) * quadro.height);
    const d = quadro.getContext("2d")!.getImageData(x, y, 1, 1).data;
    mudar({ chave: [d[0], d[1], d[2]] });
  };

  if (!cfg || !blob) {
    return (
      <div className="apresentadora" data-testid="secao-apresentadora">
        {cfg && !blob && (
          <p className="aviso-honesto" data-testid="aviso-apresentadora-ausente">
            O vídeo da apresentadora ({cfg.arquivo}) não está salvo neste navegador: o arquivo .4dstudio não leva o vídeo, para não ficar pesado. Envie de novo; a configuração é mantida.
          </p>
        )}
        <p className="tenue pequeno">Uma pessoa real falando em primeiro plano, com a obra em segundo plano. O vídeo final leva a voz dela.</p>
        <SeletorArquivo aceitar="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" rotulo="Enviar vídeo da fala" dica={DICA_GRAVACAO} testId="entrada-apresentadora" aoEscolher={carregarApresentadora} />
      </div>
    );
  }

  const efetiva = duracaoDoVideo(segundosEscolhidos, cfg);
  return (
    <div className="apresentadora" data-testid="secao-apresentadora">
      <p className="pequeno">
        <strong>{cfg.arquivo}</strong>{" "}
        <span className="tenue num">
          {cfg.largura} × {cfg.altura} · {fmt(cfg.duracaoS)} s
        </span>
      </p>
      <div className="apresentadora-previas">
        {previa ? <img src={previa} alt="Prévia do recorte da apresentadora" data-testid="previa-apresentadora" className={carregando ? "carregando" : ""} /> : <div className="previa-vazia">{carregando ? "Preparando a prévia…" : "Sem prévia"}</div>}
        {cfg.recorte === "verde" && quadro && (
          <canvas
            className="conta-gotas"
            width={quadro.width}
            height={quadro.height}
            ref={(c) => c?.getContext("2d")?.drawImage(quadro, 0, 0)}
            onClick={pegarCor}
            data-tip="Clique no fundo verde para escolher a cor que some."
            aria-label="Quadro original: clique no fundo verde"
          />
        )}
      </div>
      <div className="linha-campos">
        <label className="campo" data-tip={"Recorte por IA: separa a pessoa de qualquer fundo (segmentação de selfie do MediaPipe, no próprio navegador).\nFundo verde: some a cor escolhida; recorte mais limpo, exige pano verde bem iluminado."}>
          <span>Recorte</span>
          <select data-testid="apresentadora-recorte" value={cfg.recorte} onChange={(e) => mudar({ recorte: e.target.value as Recorte })}>
            <option value="ia">Automático por IA</option>
            <option value="verde">Fundo verde</option>
          </select>
        </label>
        <label className="campo">
          <span>Posição</span>
          <select data-testid="apresentadora-posicao" value={cfg.posicao} onChange={(e) => mudar({ posicao: e.target.value as PosicaoApresentadora })}>
            <option value="esquerda">Esquerda</option>
            <option value="centro">Centro</option>
            <option value="direita">Direita</option>
          </select>
        </label>
      </div>
      {cfg.recorte === "verde" && (
        <div className="linha-campos">
          <label className="campo">
            <span>Cor do fundo</span>
            <input type="color" value={hex(cfg.chave)} onChange={(e) => mudar({ chave: doHex(e.target.value) })} data-testid="apresentadora-chave" />
          </label>
          <label className="campo" data-tip="Quanto da cor em volta do verde também some. Aumente se sobrar verde; diminua se a pessoa ficar transparente.">
            <span>Tolerância {fmt(cfg.tolerancia * 100, 0)}%</span>
            <input type="range" min={0.04} max={0.4} step={0.01} value={cfg.tolerancia} onChange={(e) => mudar({ tolerancia: Number(e.target.value) })} />
          </label>
          <label className="campo" data-tip="Largura da borda suave entre o fundo e a pessoa.">
            <span>Borda {fmt(cfg.suavidade * 100, 0)}%</span>
            <input type="range" min={0.02} max={0.3} step={0.01} value={cfg.suavidade} onChange={(e) => mudar({ suavidade: Number(e.target.value) })} />
          </label>
        </div>
      )}
      <label className="campo calc" tabIndex={0} data-tip={`Fórmula: altura da pessoa = ${fmt(cfg.alturaFracao * 100, 0)}% × ${altura} px = ${Math.round(cfg.alturaFracao * altura)} px\nLargura pela proporção do vídeo dela (${cfg.largura} × ${cfg.altura}).`}>
        <span>Tamanho {fmt(cfg.alturaFracao * 100, 0)}% da altura</span>
        <input type="range" min={0.4} max={1} step={0.02} value={cfg.alturaFracao} onChange={(e) => mudar({ alturaFracao: Number(e.target.value) })} data-testid="apresentadora-tamanho" />
      </label>
      <label
        className="marcar calc"
        data-tip={`Fórmula: duração = duração da fala arredondada para cima ao décimo de segundo, entre 6 s e 5 min\nFala: ${fmt(cfg.duracaoS, 2)} s → vídeo: ${fmt(efetiva)} s`}
      >
        <input type="checkbox" checked={cfg.acompanharFala} onChange={(e) => mudar({ acompanharFala: e.target.checked })} data-testid="apresentadora-acompanhar" />
        Duração do vídeo acompanha a fala ({fmt(duracaoDoVideo(segundosEscolhidos, { ...cfg, acompanharFala: true }))} s)
      </label>
      {!cfg.acompanharFala && cfg.duracaoS > segundosEscolhidos + 0.05 && (
        <p className="aviso-honesto">A fala tem {fmt(cfg.duracaoS)} s e o vídeo {segundosEscolhidos} s: o fim da fala fica de fora.</p>
      )}
      <p className="tenue pequeno">GIF e quadros PNG saem sem som. O vídeo da fala fica salvo só neste navegador.</p>
      <div className="botoes">
        <SeletorArquivo aceitar="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" rotulo="Trocar vídeo" dica={DICA_GRAVACAO} testId="entrada-apresentadora" aoEscolher={carregarApresentadora} />
        <button type="button" className="btn" data-testid="remover-apresentadora" onClick={() => void removerApresentadora()}>
          Remover apresentadora
        </button>
      </div>
    </div>
  );
}
