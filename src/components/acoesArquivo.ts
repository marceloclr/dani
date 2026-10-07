import { carregarCronograma } from "../app/carregamento";
import { abrirIfcComoProjeto } from "../app/projetos";

export const DICA_IFC = "Abre um modelo .ifc (IFC2x3, IFC4 ou IFC4x3) e cria um projeto salvo neste navegador. O arquivo é lido só aqui; nada é enviado para servidores.";
export const DICA_CRONO =
  "Abre um cronograma .csv, .xlsx ou .json.\nColunas: id, nome, inicio, fim, categoria\nDatas: aaaa-mm-dd, dd/mm/aaaa ou data do Excel\nSeparador do CSV: vírgula, ponto e vírgula ou tabulação";
export const ACEITA_CRONO = ".csv,.xlsx,.json,.txt";

export async function abrirIfc(f: File): Promise<void> {
  await abrirIfcComoProjeto(f.name, await f.arrayBuffer());
}

export async function abrirCronograma(f: File): Promise<void> {
  await carregarCronograma(f.name, new Uint8Array(await f.arrayBuffer()));
}
