// Dica da quantidade de imagens (ou fotos) que combina com o tempo da voz e do vídeo: uma linha curta com ⓘ e,
// ao passar o mouse (ou focar pelo teclado), a explicação com a conta.
export function DicaQuantidade({ rotulo, texto, testId, situacao = "neutra" }: { rotulo: string; texto: string; testId?: string; situacao?: "ok" | "alerta" | "neutra" }) {
  return (
    <p className={`dica-quantidade dica-${situacao}`} tabIndex={0} data-tip={texto} data-testid={testId}>
      <span className="icone-dica" aria-hidden>
        ⓘ
      </span>
      {rotulo}
    </p>
  );
}
