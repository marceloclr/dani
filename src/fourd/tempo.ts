// ADR-05: datas como dia civil inteiro. Nunca usar new Date("aaaa-mm-dd") (vira meia-noite UTC
// e aparece como o dia anterior em fusos negativos, como America/Fortaleza).

const MS_DIA = 86_400_000;

/** Dia civil (dias desde 1970-01-01) a partir de ano, mês (1–12) e dia; null se a data não existe. */
export function diaCivil(ano: number, mes: number, dia: number): number | null {
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || !Number.isInteger(dia)) return null;
  const ms = Date.UTC(ano, mes - 1, dia);
  const d = new Date(ms);
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return Math.round(ms / MS_DIA);
}

/** Lê "aaaa-mm-dd" ou "dd/mm/aaaa" (também com "-" ou "." como separador no formato brasileiro). */
export function lerData(texto: string): number | null {
  const t = texto.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/.exec(t);
  if (m) return diaCivil(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return diaCivil(+m[3], +m[2], +m[1]);
  return null;
}

/** Componentes de um dia civil. */
export function partes(dia: number): { ano: number; mes: number; dia: number } {
  const d = new Date(dia * MS_DIA);
  return { ano: d.getUTCFullYear(), mes: d.getUTCMonth() + 1, dia: d.getUTCDate() };
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** "dd/mm/aaaa" */
export function formatarBR(dia: number): string {
  const p = partes(dia);
  return `${p2(p.dia)}/${p2(p.mes)}/${p.ano}`;
}

/** "aaaa-mm-dd" (valor de <input type="date">) */
export function formatarISO(dia: number): string {
  const p = partes(dia);
  return `${p.ano}-${p2(p.mes)}-${p2(p.dia)}`;
}

/** Duração inclusiva em dias. */
export const duracao = (ini: number, fim: number) => fim - ini + 1;

/** Hoje, como dia civil, pela data local do computador. */
export const hojeCivil = (): number => lerData(new Date().toLocaleDateString("sv-SE"))!;
