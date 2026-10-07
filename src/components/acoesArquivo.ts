import { carregarCronograma, carregarIfc } from "../app/carregamento";

export const DICA_IFC = "Abre um modelo .ifc (IFC2x3, IFC4 ou IFC4x3). O arquivo é lido só neste navegador; nada é enviado para servidores.";
export const DICA_CRONO =
  "Abre um cronograma .csv ou .json.\nColunas: id, nome, inicio, fim, categoria\nDatas: aaaa-mm-dd ou dd/mm/aaaa\nSeparador: vírgula, ponto e vírgula ou tabulação";

export async function abrirIfc(f: File): Promise<void> {
  await carregarIfc(f.name, await f.arrayBuffer());
}

export async function abrirCronograma(f: File): Promise<void> {
  carregarCronograma(f.name, new Uint8Array(await f.arrayBuffer()));
}
