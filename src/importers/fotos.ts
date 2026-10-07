// Fotos da obra (ADR-14): data do EXIF e planilha fotos.csv opcional. Sem DOM.
import Papa from "papaparse";
import { diaCivil, lerData } from "../fourd/tempo";
import { decodificar } from "./texto";

/** Data de captura (DateTimeOriginal ou DateTime) de um JPEG, como dia civil; null se não houver. */
export function dataExif(bytes: Uint8Array): number | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 2;
  while (p + 4 < bytes.length) {
    if (bytes[p] !== 0xff) return null;
    const marcador = bytes[p + 1];
    const tamanho = dv.getUint16(p + 2);
    if (marcador === 0xe1 && dv.getUint32(p + 4) === 0x45786966) return lerTiff(dv, p + 10);
    if (marcador === 0xda) return null; // início da imagem: sem EXIF
    p += 2 + tamanho;
  }
  return null;
}

function lerTiff(dv: DataView, base: number): number | null {
  const le = dv.getUint16(base) === 0x4949;
  const u16 = (o: number) => dv.getUint16(base + o, le);
  const u32 = (o: number) => dv.getUint32(base + o, le);
  const texto = (o: number, n: number) => {
    let s = "";
    for (let i = 0; i < n; i++) {
      const c = dv.getUint8(base + o + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const lerIfd = (o: number) => {
    const n = u16(o);
    const tags = new Map<number, { tipo: number; qtd: number; valor: number }>();
    for (let i = 0; i < n; i++) {
      const e = o + 2 + i * 12;
      tags.set(u16(e), { tipo: u16(e + 2), qtd: u32(e + 4), valor: u32(e + 8) });
    }
    return tags;
  };
  try {
    const ifd0 = lerIfd(u32(4));
    const exif = ifd0.get(0x8769) ? lerIfd(ifd0.get(0x8769)!.valor) : new Map();
    const tag = exif.get(0x9003) ?? ifd0.get(0x0132);
    if (!tag || tag.tipo !== 2) return null;
    const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(texto(tag.valor, tag.qtd));
    return m ? diaCivil(+m[1], +m[2], +m[3]) : null;
  } catch {
    return null;
  }
}

export interface LinhaFotos {
  arquivo: string;
  dia: number | null;
  local: string;
  descricao: string;
  etapa: string | null;
}

/** Lê o fotos.csv (arquivo;data;local;descricao;etapa). Devolve as linhas por nome de arquivo (minúsculo) e os problemas. */
export function lerFotosCsv(bytes: Uint8Array): { linhas: Map<string, LinhaFotos>; problemas: string[] } {
  const { texto } = decodificar(bytes);
  const r = Papa.parse<Record<string, string>>(texto, { header: true, skipEmptyLines: "greedy", delimitersToGuess: [";", ",", "\t"] });
  const linhas = new Map<string, LinhaFotos>();
  const problemas: string[] = [];
  const pegar = (l: Record<string, string>, ...nomes: string[]) => {
    for (const [k, v] of Object.entries(l)) if (nomes.includes(k.trim().toLowerCase())) return (v ?? "").trim();
    return "";
  };
  r.data.forEach((l, i) => {
    const arquivo = pegar(l, "arquivo", "file", "foto", "nome_arquivo");
    if (!arquivo) return;
    const data = pegar(l, "data", "date", "dia");
    const dia = data ? lerData(data) : null;
    if (data && dia === null) problemas.push(`fotos.csv, linha ${i + 2}: data inválida ("${data}").`);
    linhas.set(arquivo.toLowerCase(), { arquivo, dia, local: pegar(l, "local", "location", "ambiente"), descricao: pegar(l, "descricao", "descrição", "description"), etapa: pegar(l, "etapa", "tarefa", "task", "id_tarefa") || null });
  });
  return { linhas, problemas };
}
