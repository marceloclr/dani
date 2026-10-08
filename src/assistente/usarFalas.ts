// Falas do vídeo no assistente: a aba Falas da planilha casada com os vídeos recebidos (ADR-30).
import { useMemo, useSyncExternalStore } from "react";
import { aoMudarFalas, arquivosDeFala } from "../app/anexos";
import { montarFalas, type FalasDoVideo } from "../app/falas";
import { useProjeto } from "../state/projectStore";

export function usarFalas(): FalasDoVideo {
  const linhas = useProjeto((s) => s.planilha?.falas);
  const ajuste = useProjeto((s) => s.video.apresentadora);
  const arquivos = useSyncExternalStore(aoMudarFalas, arquivosDeFala);
  const interno = useProjeto((s) => s.tipoModelo === "IFC");
  return useMemo(() => {
    // posição, altura e croma ajustados na Gestão continuam valendo para a sequência
    const base = ajuste ? { posicao: ajuste.posicao, alturaFracao: ajuste.alturaFracao, chave: ajuste.chave, tolerancia: ajuste.tolerancia, suavidade: ajuste.suavidade } : {};
    return montarFalas(linhas ?? [], arquivos, base, interno);
  }, [linhas, arquivos, ajuste, interno]);
}
