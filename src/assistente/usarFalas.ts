// Falas e sequência do vídeo no assistente: a aba Falas da planilha casada com os vídeos e áudios recebidos
// (ADR-30), mais as fotos e as trilhas, na ordem escolhida no Conferir (ADR-34).
import { useMemo, useSyncExternalStore } from "react";
import { aoMudarFalas, aoMudarTrilhas, arquivosDeFala, arquivosDeTrilha, blobDaFoto } from "../app/anexos";
import { montarFalas, type FalasDoVideo, type FotoParaVideo } from "../app/falas";
import { duracaoObra } from "../fourd/simulacao";
import { formatarBR } from "../fourd/tempo";
import { useProjeto } from "../state/projectStore";

export function usarFalas(): FalasDoVideo {
  const linhas = useProjeto((s) => s.planilha?.falas);
  const ajuste = useProjeto((s) => s.video.apresentadora);
  const arquivos = useSyncExternalStore(aoMudarFalas, arquivosDeFala);
  const audiosTrilha = useSyncExternalStore(aoMudarTrilhas, arquivosDeTrilha);
  // passeio final escolhido (ADR-32): externo (padrão), interno ou ambos; o voo inteiro fica na Gestão
  const passeio = useProjeto((s) => s.video.passeio ?? "externo");
  const fotos = useProjeto((s) => s.fotos);
  const cronograma = useProjeto((s) => s.cronograma);
  const ordem = useProjeto((s) => s.video.sequencia);
  const duracoesFoto = useProjeto((s) => s.video.duracoesFoto);
  const trilhasCfg = useProjeto((s) => s.video.trilhas);
  const semVozS = useProjeto((s) => s.video.segundos);
  return useMemo(() => {
    // posição, altura e croma ajustados na Gestão continuam valendo para a sequência
    const base = ajuste ? { posicao: ajuste.posicao, alturaFracao: ajuste.alturaFracao, chave: ajuste.chave, tolerancia: ajuste.tolerancia, suavidade: ajuste.suavidade } : {};
    // fotos (ADR-34): avanço da obra no dia de cada uma e a legenda (data, etapa e descrição)
    const dias = cronograma ? duracaoObra(cronograma.tarefas) : 0;
    const nomeEtapa = new Map(cronograma?.tarefas.map((t) => [t.id, t.nome]) ?? []);
    const paraVideo: FotoParaVideo[] = fotos.flatMap((f) => {
      const blob = blobDaFoto(f.id);
      if (!blob) return [];
      const obra = cronograma && dias > 0 ? Math.min(1, Math.max(0, (f.dia - cronograma.inicio) / dias)) : null;
      return [{ nome: f.arquivo, blob, obra, data: formatarBR(f.dia), etapa: (f.etapa && nomeEtapa.get(f.etapa)) || "", descricao: f.descricao || f.local }];
    });
    const trilhas = [...audiosTrilha.values()].map((t) => ({ nome: t.nome, blob: t.blob, duracaoS: t.duracaoS }));
    return montarFalas(linhas ?? [], arquivos, base, passeio, { fotos: paraVideo, ordem, duracoesFoto, trilhas, trilhasCfg, semVozS: semVozS ?? 20 });
  }, [linhas, arquivos, ajuste, passeio, fotos, cronograma, ordem, duracoesFoto, audiosTrilha, trilhasCfg, semVozS]);
}
