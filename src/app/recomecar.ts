// Recomeçar do zero: apaga tudo o que foi carregado e gerado nesta sessão (imagens, títulos, narração, trilhas,
// falas, fotos, planilha, IFC e o último vídeo) e o que o vídeo de imagens guardou no navegador; os projetos
// salvos só saem se pedido. No fim, a página recarrega limpa.
import { apagarGuardadoDasImagens } from "./guardaImagens";
import { zerarImagens } from "./imagensDoVideo";
import { excluir, listarProjetos, novoProjeto } from "./projetos";

export async function recomecarDoZero(apagarProjetos: boolean): Promise<void> {
  await apagarGuardadoDasImagens();
  zerarImagens();
  await novoProjeto();
  if (apagarProjetos) for (const r of await listarProjetos()) await excluir(r.id);
  location.hash = "#/";
  location.reload();
}
