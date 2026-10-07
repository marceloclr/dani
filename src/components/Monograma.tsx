import { MONOGRAMA_DP, MONOGRAMA_TRACO } from "../app/marca";

/** Monograma da cliente (provisório até o logo oficial, ADR-24), no traço da cor atual. */
export function Monograma({ tamanho = 40, titulo }: { tamanho?: number; titulo?: string }) {
  return (
    <svg className="monograma" width={tamanho} height={tamanho} viewBox="0 0 100 100" role={titulo ? "img" : undefined} aria-hidden={titulo ? undefined : true} aria-label={titulo}>
      <path d={MONOGRAMA_DP} fill="none" stroke="currentColor" strokeWidth={MONOGRAMA_TRACO} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
