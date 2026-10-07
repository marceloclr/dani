import { urlDaFoto } from "../app/anexos";
import { formatarBR } from "../fourd/tempo";
import { useProjeto } from "../state/projectStore";
import { useUi } from "../state/uiStore";
import { Modal } from "./Modal";

/** Visualizador de fotos da obra, com navegação pela ordem das datas. */
export function ModalFoto() {
  const id = useUi((s) => s.foto);
  const abrir = useUi((s) => s.abrir);
  const fotos = useProjeto((s) => s.fotos);
  const cronograma = useProjeto((s) => s.cronograma);
  const i = fotos.findIndex((f) => f.id === id);
  const f = i >= 0 ? fotos[i] : null;
  const etapa = f?.etapa ? cronograma?.tarefas.find((t) => t.id === f.etapa)?.nome : null;
  const irPara = (k: number) => abrir({ foto: fotos[k].id });
  return (
    <Modal aberto={!!f} titulo={f ? `Foto de ${formatarBR(f.dia)}` : "Foto"} aoFechar={() => abrir({ foto: null })} largura={860} testId="modal-foto">
      {f && (
        <>
          <img className="foto-grande" src={urlDaFoto(f.id) ?? ""} alt={f.descricao || f.arquivo} />
          <p className="pequeno">
            <strong>{f.descricao || f.arquivo}</strong>
            {f.local ? ` · ${f.local}` : ""}
            {etapa ? ` · etapa: ${etapa}` : ""}
            <span className="tenue"> · {f.arquivo}</span>
          </p>
          <div className="botoes fim">
            <button type="button" className="btn" disabled={i <= 0} onClick={() => irPara(i - 1)}>
              ← Anterior
            </button>
            <span className="espaco tenue pequeno">
              {i + 1} de {fotos.length}
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (cronograma) useProjeto.getState().definirDia(f.dia - cronograma.inicio);
                abrir({ foto: null });
              }}
              data-tip="Leva a simulação para a data desta foto."
            >
              Ver a obra nesta data
            </button>
            <button type="button" className="btn" disabled={i >= fotos.length - 1} onClick={() => irPara(i + 1)}>
              Próxima →
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
