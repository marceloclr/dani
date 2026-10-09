// Recomeçar do zero (pedido de 09/10): confirma e apaga tudo da sessão para começar sem os dados das gerações
// anteriores. Os projetos salvos só saem se a caixa for marcada.
import { useEffect, useState } from "react";
import { listarProjetos } from "../app/projetos";
import { recomecarDoZero } from "../app/recomecar";
import { Modal } from "./Modal";

export function ModalRecomecar({ aberto, aoFechar }: { aberto: boolean; aoFechar(): void }) {
  const [apagarProjetos, setApagarProjetos] = useState(false);
  const [nProjetos, setNProjetos] = useState(0);
  const [apagando, setApagando] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    setApagarProjetos(false);
    void listarProjetos().then((l) => setNProjetos(l.length)).catch(() => setNProjetos(0));
  }, [aberto]);
  return (
    <Modal aberto={aberto} titulo="Recomeçar do zero" aoFechar={aoFechar} testId="modal-recomecar">
      <div className="conteudo-recomecar">
        <p>Apaga tudo o que foi carregado e gerado nesta sessão, para começar um vídeo novo sem dados dos anteriores:</p>
        <ul>
          <li>imagens e PDFs, títulos, seleção e ordem do vídeo de imagens;</li>
          <li>narração, trilhas sonoras, vídeos de fala e fotos;</li>
          <li>planilha, IFC e o último vídeo gerado.</li>
        </ul>
        <p className="tenue">Os vídeos já baixados ficam na sua pasta de downloads. Não dá para desfazer.</p>
        {nProjetos > 0 && (
          <label className="marcar-imagem">
            <input type="checkbox" checked={apagarProjetos} data-testid="recomecar-projetos" onChange={(e) => setApagarProjetos(e.target.checked)} />
            <span>
              Também apagar os {nProjetos} projeto{nProjetos > 1 ? "s" : ""} salvo{nProjetos > 1 ? "s" : ""} neste navegador
            </span>
          </label>
        )}
        <div className="botoes">
          <button type="button" className="btn" onClick={aoFechar} disabled={apagando}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primario perigo"
            data-testid="confirmar-recomecar"
            disabled={apagando}
            onClick={() => {
              setApagando(true);
              void recomecarDoZero(apagarProjetos);
            }}
          >
            {apagando ? "Apagando…" : "Apagar e recomeçar"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
