import { useProjeto } from "../state/projectStore";

/** Erro em linguagem simples, com detalhes técnicos recolhidos (§40). */
export function ErroAmigavel() {
  const erro = useProjeto((s) => s.erro);
  const fechar = useProjeto((s) => s.mostrarErro);
  if (!erro) return null;
  return (
    <div className="erro" role="alert" data-testid="erro">
      <div className="erro-txt">
        <strong>{erro.mensagem}</strong>
        {erro.orientacao && <span>{erro.orientacao}</span>}
        {erro.detalhes && (
          <details>
            <summary>Detalhes técnicos</summary>
            <pre>{erro.detalhes}</pre>
          </details>
        )}
      </div>
      <button type="button" className="btn" onClick={() => fechar(null)} aria-label="Fechar aviso">
        Fechar
      </button>
    </div>
  );
}
