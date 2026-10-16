// Render no Blender (INC-23): baixar o pacote e usar o MP4 que o Blender devolve no lugar da cena 3D.
import { useRef, useState, useSyncExternalStore } from "react";
import { aoMudarBlender, assinaturaDoPacote, dadosDoNome, definirRenderDoBlender, registrarPacote, renderDoBlender, type OrigemDoPacote, type PacoteBlender } from "../app/pacoteBlender";
import { Cancelado } from "../rendering/VideoRenderer";
import { SeletorArquivo } from "./SeletorArquivo";
import { baixar } from "../utils/baixar";
import { useProjeto } from "../state/projectStore";

interface Props {
  origem: OrigemDoPacote;
  /** Monta o pacote com as escolhas atuais do vídeo. */
  gerarPacote(sinal: AbortSignal, aoProgredir: (p: { quadro: number; total: number }) => void): Promise<PacoteBlender>;
  desabilitado?: boolean;
}

const DICA_PACOTE =
  "Baixa um ZIP com a cena 3D e a câmera, a luz e a obra de cada quadro deste vídeo.\nExtraia e dê dois cliques em renderizar.bat (precisa do Blender instalado): Rascunho em minutos, Final em horas.\nO MP4 que o Blender gera volta aqui, em \"Usar o render do Blender\".";
const DICA_RENDER =
  "O vídeo sai com o render do Blender no lugar da cena 3D do navegador; a apresentadora, a marca, as legendas e o áudio entram por cima, como sempre.\nUse o MP4 do pacote com a mesma duração, câmera e luz deste vídeo.";

export function SecaoBlender({ origem, gerarPacote, desabilitado }: Props) {
  const render = useSyncExternalStore(aoMudarBlender, () => renderDoBlender(origem));
  const assinatura = useSyncExternalStore(aoMudarBlender, () => assinaturaDoPacote(origem));
  const [progresso, setProgresso] = useState<{ quadro: number; total: number } | null>(null);
  const [feito, setFeito] = useState<PacoteBlender | null>(null);
  const controle = useRef<AbortController | null>(null);
  const st = useProjeto.getState;

  const baixarPacote = async () => {
    const ac = new AbortController();
    controle.current = ac;
    setFeito(null);
    st().mostrarErro(null);
    setProgresso({ quadro: 0, total: 1 });
    try {
      const p = await gerarPacote(ac.signal, (q) => setProgresso({ quadro: q.quadro, total: q.total }));
      registrarPacote(origem, p.assinatura);
      baixar(p.blob, p.nome);
      setFeito(p);
    } catch (err) {
      if (!(err instanceof Cancelado)) st().mostrarErro({ mensagem: "Não foi possível montar o pacote do Blender.", orientacao: "Confira se a cena 3D abriu e tente de novo.", detalhes: String((err as Error)?.stack ?? err) });
    } finally {
      controle.current = null;
      setProgresso(null);
    }
  };

  const dados = render ? dadosDoNome(render.name) : null;
  const outroPacote = !!(dados && assinatura && dados.assinatura !== assinatura);
  const pct = progresso ? Math.round((progresso.quadro / Math.max(progresso.total, 1)) * 100) : 0;

  return (
    <div className="secao-blender" data-testid={`blender-${origem}`}>
      <div className="botoes">
        {!progresso ? (
          <button type="button" className="btn" data-testid="blender-pacote" data-tip={DICA_PACOTE} disabled={desabilitado} onClick={baixarPacote}>
            Pacote para o Blender
          </button>
        ) : (
          <button type="button" className="btn" data-testid="blender-cancelar" onClick={() => controle.current?.abort()}>
            Cancelar ({pct}%)
          </button>
        )}
        <SeletorArquivo aceitar="video/mp4,.mp4" rotulo="Usar o render do Blender" dica={DICA_RENDER} testId="blender-render" aoEscolher={(f) => definirRenderDoBlender(origem, f)} />
      </div>
      {feito && (
        <p className="tenue pequeno" role="status" data-testid="blender-pacote-pronto">
          Pacote salvo na pasta de downloads: <strong className="mono">{feito.nome}</strong> ({feito.quadros} quadros, código {feito.assinatura}). Extraia e rode o renderizar.bat.
        </p>
      )}
      {render && (
        <p className="pequeno" data-testid="blender-render-escolhido">
          Render do Blender: <strong className="mono">{render.name}</strong>
          {dados ? ` · ${dados.qualidade === "final" ? "Final" : "Rascunho"}` : ""}{" "}
          <button type="button" className="btn mini" aria-label="Voltar à cena do navegador" data-testid="blender-tirar" onClick={() => definirRenderDoBlender(origem, null)}>
            ×
          </button>
        </p>
      )}
      {outroPacote && (
        <p className="aviso-honesto pequeno" data-testid="blender-outro-pacote">
          Este render é de outro pacote (código {dados!.assinatura}; o último foi {assinatura}). Se a câmera, a luz ou a duração mudaram, ele não casa com o vídeo.
        </p>
      )}
    </div>
  );
}
