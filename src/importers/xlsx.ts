// Cronograma em XLSX (§12, ADR-05): primeira planilha, mesmas colunas do CSV.
// SheetJS 0.20.3 vem do tarball oficial, instalado com o projeto; é carregado sob demanda.
import { ehColunaData, importarLinhas, type ResultadoImportacao } from "./cronograma";
import { formatarISO } from "../fourd/tempo";

/** Número de série do Excel → dia civil. Sistema 1900 (com o falso 29/02/1900) ou 1904. */
export function serialParaDia(serial: number, sistema1904 = false): number {
  const inteiro = Math.floor(serial);
  return sistema1904 ? inteiro + 1462 - 25569 : inteiro - 25569;
}

export async function importarXlsx(bytes: Uint8Array): Promise<ResultadoImportacao> {
  const XLSX = await import("xlsx");
  let wb: import("xlsx").WorkBook;
  try {
    wb = XLSX.read(bytes, { type: "array", cellDates: false });
  } catch (e) {
    return { cronograma: null, formato: "XLSX", problemas: [{ nivel: "erro", mensagem: `Não foi possível ler a planilha: ${(e as Error).message}` }] };
  }
  const nome = wb.SheetNames[0];
  if (!nome) return { cronograma: null, formato: "XLSX", problemas: [{ nivel: "erro", mensagem: "A planilha está vazia." }] };
  const sistema1904 = !!wb.Workbook?.WBProps?.date1904;
  const brutas = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[nome], { raw: true, defval: "" });
  // datas do Excel chegam como número de série; texto passa direto (aaaa-mm-dd ou dd/mm/aaaa)
  const linhas = brutas.map((l) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(l)) out[k] = typeof v === "number" && ehColunaData(k) ? formatarISO(serialParaDia(v, sistema1904)) : v;
    return out;
  });
  return importarLinhas(linhas, `XLSX (planilha "${nome}")`);
}
