import { useRef } from "react";

interface Props {
  aceitar: string;
  rotulo: string;
  dica: string;
  classe?: string;
  testId?: string;
  aoEscolher(arquivo: File): void;
}

/** Botão que abre o seletor de arquivos do sistema. */
export function SeletorArquivo({ aceitar, rotulo, dica, classe = "btn", testId, aoEscolher }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={classe} data-tip={dica} onClick={() => ref.current?.click()}>
        {rotulo}
      </button>
      <input
        ref={ref}
        type="file"
        accept={aceitar}
        hidden
        data-testid={testId}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) aoEscolher(f);
        }}
      />
    </>
  );
}
