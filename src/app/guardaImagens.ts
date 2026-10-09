// Vídeo de imagens (INC-19): guarda no navegador (IndexedDB) as imagens, os títulos, a seleção, a ordem, a
// narração e a configuração, para o trabalho continuar ao reabrir a página. Cada imagem é gravada uma vez;
// o estado (sem os arquivos) é regravado meio segundo depois da última mudança.
import { GRUPO_IMAGENS, chaveEstadoImagens, chaveImagem, chaveNarracaoImagens, excluirAnexo, gravarAnexo, lerAnexosDe } from "../storage/IndexedDb";
import { definirGuarda, restaurarImagens, type EstadoImagens, type ImagemRecebida } from "./imagensDoVideo";

type ImagemGuardada = Omit<ImagemRecebida, "blob" | "url">;
interface EstadoGuardado extends Omit<EstadoImagens, "imagens" | "narracao"> {
  imagens: ImagemGuardada[];
  narracao: { nome: string; duracaoS: number } | null;
}

let iniciada: Promise<void> | null = null;
const gravadas = new Set<string>();
let narracaoGravada: Blob | null = null;
let espera: ReturnType<typeof setTimeout> | undefined;
let fila: Promise<void> = Promise.resolve();

async function guardar(e: EstadoImagens): Promise<void> {
  const meta: EstadoGuardado = {
    ...e,
    imagens: e.imagens.map(({ blob: _b, url: _u, ...resto }) => resto),
    narracao: e.narracao ? { nome: e.narracao.nome, duracaoS: e.narracao.duracaoS } : null,
  };
  await gravarAnexo(GRUPO_IMAGENS, chaveEstadoImagens(), new Blob([JSON.stringify(meta)], { type: "application/json" }));
  for (const im of e.imagens)
    if (!gravadas.has(im.id)) {
      await gravarAnexo(GRUPO_IMAGENS, chaveImagem(im.id), im.blob);
      gravadas.add(im.id);
    }
  const atuais = new Set(e.imagens.map((i) => i.id));
  for (const id of [...gravadas])
    if (!atuais.has(id)) {
      await excluirAnexo(chaveImagem(id));
      gravadas.delete(id);
    }
  const narr = e.narracao?.blob ?? null;
  if (narr !== narracaoGravada) {
    if (narr) await gravarAnexo(GRUPO_IMAGENS, chaveNarracaoImagens(), narr);
    else await excluirAnexo(chaveNarracaoImagens());
    narracaoGravada = narr;
  }
}

/** Restaura o que estava guardado e passa a guardar cada mudança (uma vez por sessão). */
export function iniciarGuardaDeImagens(): Promise<void> {
  iniciada ??= (async () => {
    try {
      const anexos = await lerAnexosDe(GRUPO_IMAGENS);
      const json = anexos.get(chaveEstadoImagens());
      if (json) {
        const e = JSON.parse(await json.text()) as EstadoGuardado;
        const imagens = e.imagens.flatMap((i) => {
          const blob = anexos.get(chaveImagem(i.id));
          return blob ? [{ ...i, blob }] : [];
        });
        const blobNarracao = anexos.get(chaveNarracaoImagens());
        const narracao = e.narracao && blobNarracao ? { ...e.narracao, blob: blobNarracao } : null;
        restaurarImagens({ ...e, imagens, narracao, duracao: e.duracao === "narracao" && !narracao ? 30 : e.duracao });
        imagens.forEach((i) => gravadas.add(i.id));
        narracaoGravada = narracao?.blob ?? null;
      }
    } catch {
      /* sem IndexedDB (janela privada): o trabalho fica só nesta sessão */
    }
    definirGuarda((e) => {
      clearTimeout(espera);
      espera = setTimeout(() => {
        fila = fila.then(() => guardar(e)).catch(() => {});
      }, 500);
    });
  })();
  return iniciada;
}
