import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  aberto: boolean;
  titulo: string;
  aoFechar(): void;
  children: ReactNode;
  largura?: number;
  testId?: string;
}

/** Diálogo modal nativo (<dialog>): foco preso, Esc fecha, fundo escurecido. */
export function Modal({ aberto, titulo, aoFechar, children, largura = 560, testId }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    if (!aberto && d.open) d.close();
  }, [aberto]);
  return (
    <dialog ref={ref} className="modal" style={{ width: `min(${largura}px, calc(100vw - 32px))` }} onClose={aoFechar} data-testid={testId} aria-label={titulo}>
      {aberto && (
        <>
          <header className="modal-topo">
            <h2>{titulo}</h2>
            <button type="button" className="btn mini" aria-label="Fechar" onClick={aoFechar}>
              ✕
            </button>
          </header>
          <div className="modal-corpo">{children}</div>
        </>
      )}
    </dialog>
  );
}
