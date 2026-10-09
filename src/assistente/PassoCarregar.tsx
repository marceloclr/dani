// Passo 1 do assistente (ADR-30): um cartão por tipo de arquivo, cada um com o que foi recebido e o que falta.
import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { adicionarFalas, adicionarFotos, adicionarTrilhas, aoMudarTrilhas, arquivosDeTrilha, removerFala, removerTrilha } from "../app/anexos";
import { abrirPlanilha, usarCasaDaPlanilha } from "../app/planilha";
import { abrirIfcComoProjeto } from "../app/projetos";
import { formatarBR } from "../fourd/tempo";
import { useProjeto } from "../state/projectStore";
import type { FalasDoVideo } from "../app/falas";
import { fotosRecomendadas } from "../app/sequencia";
import { DicaQuantidade } from "../components/DicaQuantidade";

export type Situacao = "ok" | "falta" | "opcional" | "aviso";
const COR: Record<Situacao, string> = { ok: "var(--musgo)", falta: "var(--carmim)", opcional: "var(--neutro)", aviso: "var(--ocre)" };
const seg = (s: number) => `${s.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;

interface PropsCartao {
  id: string;
  titulo: string;
  situacao: Situacao;
  estado: string;
  aceitar: string;
  multiplos?: boolean;
  rotulo: string;
  dica: string;
  aoEscolher(f: File[]): Promise<void> | void;
  /** Resultado da verificação do último envio (formato, leitura, nome). */
  avisos?: string[];
  children?: ReactNode;
}

/** Botão × que tira um arquivo enviado (para o cartão errado, por exemplo). */
export function Remover({ nome, aoRemover }: { nome: string; aoRemover(): void }) {
  return (
    <button type="button" className="btn-icone remover-arquivo" aria-label={`Remover ${nome}`} data-tip="Remover este arquivo" data-testid={`remover-${nome}`} onClick={aoRemover}>
      ×
    </button>
  );
}

/** Cartão de um tipo de arquivo: zona de soltar, botão e o estado do que chegou. */
export function CartaoArquivo({ id, titulo, situacao, estado, aceitar, multiplos, rotulo, dica, aoEscolher, avisos = [], children }: PropsCartao) {
  const ref = useRef<HTMLInputElement>(null);
  const [sobre, setSobre] = useState(false);
  const [lendo, setLendo] = useState(false);
  const receber = async (lista: FileList | null) => {
    const f = Array.from(lista ?? []);
    if (!f.length) return;
    setLendo(true);
    try {
      await aoEscolher(multiplos ? f : [f[0]]);
    } finally {
      setLendo(false);
    }
  };
  return (
    <section
      className={`bloco cartao-arquivo${sobre ? " sobre" : ""}`}
      style={{ ["--acento" as string]: COR[situacao] }}
      data-testid={`cartao-${id}`}
      data-situacao={situacao}
      onDragOver={(e) => {
        e.preventDefault();
        setSobre(true);
      }}
      onDragLeave={() => setSobre(false)}
      onDrop={(e) => {
        e.preventDefault();
        setSobre(false);
        void receber(e.dataTransfer.files);
      }}
    >
      <header>
        <h3>{titulo}</h3>
        <span className="selo" style={{ ["--cor" as string]: COR[situacao] }}>
          <span className="pt" />
          <span data-testid={`estado-${id}`}>{lendo ? "Lendo…" : estado}</span>
        </span>
      </header>
      {children}
      {avisos.length > 0 && (
        <ul className="avisos-cartao" role="status" data-testid={`avisos-${id}`}>
          {avisos.slice(0, 6).map((a) => (
            <li key={a}>{a}</li>
          ))}
          {avisos.length > 6 && <li className="tenue">e mais {avisos.length - 6}: veja todos no passo Conferir</li>}
        </ul>
      )}
      <div className="botoes">
        <button type="button" className="btn" data-tip={dica} disabled={lendo} onClick={() => ref.current?.click()}>
          {rotulo}
        </button>
        <input
          ref={ref}
          type="file"
          hidden
          accept={aceitar}
          multiple={multiplos}
          data-testid={`entrada-${id}`}
          onChange={(e) => {
            void receber(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
    </section>
  );
}

export function PassoCarregar({ falas }: { falas: FalasDoVideo }) {
  const planilha = useProjeto((s) => s.planilha);
  const cronograma = useProjeto((s) => s.cronograma);
  const tipoModelo = useProjeto((s) => s.tipoModelo);
  const arquivoModelo = useProjeto((s) => s.arquivoModelo);
  const nElementos = useProjeto((s) => s.elementos.length);
  const problemas = useProjeto((s) => s.problemasImportacao);
  const fotos = useProjeto((s) => s.fotos);
  const [avisos, setAvisosDe] = useState<Record<string, string[]>>({});
  const setAvisos = (id: string, a: string[]) => setAvisosDe((x) => ({ ...x, [id]: a }));
  const st = useProjeto.getState;

  const erros = problemas.filter((p) => p.nivel === "erro").length;
  const ifcCitado = planilha?.obra.arquivoIfc ?? null;
  const ifcOk = tipoModelo === "IFC" && (!ifcCitado || arquivoModelo?.toLowerCase() === ifcCitado.toLowerCase());
  const casaDaPlanilha = tipoModelo === "PARAMETRICO";
  /** Modelos de exemplo que o próprio app serve (para baixar quando a planilha modelo os cita). */
  const exemploDoApp = ifcCitado && ["sobrado-exemplo.ifc", "casa-exemplo.ifc"].includes(ifcCitado.toLowerCase()) ? ifcCitado.toLowerCase() : null;
  const fotosCitadas = planilha?.fotos ?? [];
  const recebidasFotos = new Set(fotos.map((f) => f.arquivo.toLowerCase()));
  const fotosFaltando = fotosCitadas.filter((f) => !recebidasFotos.has(f.arquivo.toLowerCase()));
  const trilhas = useSyncExternalStore(aoMudarTrilhas, arquivosDeTrilha);
  // tempo de voz (falas e narrações), sem respiro nem marca
  const tempoDeVoz = falas.trechos.reduce((s, t) => s + t.fimS - t.inicioS, 0);
  const nVideos = falas.trechos.filter((t) => !t.semVideo).length, nNarracoes = falas.trechos.length - nVideos;
  const contagem = [nVideos ? `${nVideos} vídeo${nVideos > 1 ? "s" : ""}` : "", nNarracoes ? `${nNarracoes} narraç${nNarracoes > 1 ? "ões" : "ão"}` : ""].filter(Boolean).join(", ");
  // linhas da lista: as da aba Falas (com as que faltam) e as narrações que ela não cita (ADR-34)
  const citadasNaAba = new Set((planilha?.falas ?? []).map((l) => l.arquivo.toLowerCase()));
  const linhasDaLista = falas.automaticas
    ? falas.trechos.map((t) => t.linha)
    : [...(planilha?.falas ?? []), ...falas.trechos.filter((t) => !citadasNaAba.has(t.linha.arquivo.toLowerCase())).map((t) => t.linha)];

  const abrir = async ([f]: File[]) => {
    setAvisos("planilha", []);
    const ok = await abrirPlanilha(f.name, new Uint8Array(await f.arrayBuffer()));
    if (!ok) st().mostrarErro({ mensagem: "Esta não é a planilha da obra.", orientacao: "Use a planilha modelo: ela tem as abas Obra e Cronograma." });
    else st().mostrarErro(null);
  };

  return (
    <div className="passo-carregar" data-testid="passo-carregar">
      <CartaoArquivo
        id="planilha"
        titulo="Planilha"
        situacao={!planilha ? "falta" : erros ? "aviso" : "ok"}
        estado={!planilha ? "obrigatória" : `${planilha.arquivo} · ${cronograma?.tarefas.length ?? 0} etapas${erros ? ` · ${erros} erro${erros > 1 ? "s" : ""}` : ""}`}
        aceitar=".xlsx"
        rotulo={planilha ? "Trocar planilha" : "Enviar planilha"}
        dica="Planilha única (.xlsx) com as abas Obra, Modelo, Cronograma, Vínculos, Falas, Fotos, Vídeo e Documento."
        aoEscolher={abrir}
        avisos={[...(avisos.planilha ?? []), ...problemas.map((p) => p.mensagem)]}
      >
        {planilha ? (
          <p className="resumo-cartao">
            <strong>{planilha.obra.nome || "Obra sem nome"}</strong>
            {planilha.obra.dataReferencia !== null && <span className="tenue"> · referência {formatarBR(planilha.obra.dataReferencia)}</span>}
          </p>
        ) : (
          <p className="resumo-cartao">
            <a className="link" href="modelos/obra-dani.xlsx" download data-testid="baixar-planilha-modelo">
              Baixar planilha modelo
            </a>
          </p>
        )}
      </CartaoArquivo>

      <CartaoArquivo
        id="ifc"
        titulo="Projeto IFC"
        situacao={ifcOk || casaDaPlanilha ? "ok" : ifcCitado ? "falta" : "opcional"}
        estado={
          ifcOk ? `${arquivoModelo} · ${nElementos} elementos`
            : casaDaPlanilha ? `casa da aba Modelo · ${nElementos} elementos`
              : ifcCitado ? `falta ${ifcCitado}`
                : "opcional"
        }
        aceitar=".ifc"
        rotulo="Enviar IFC"
        dica="Modelo do arquiteto (IFC2x3, IFC4 ou IFC4x3). Sem IFC, a casa é gerada pelas medidas da aba Modelo."
        aoEscolher={async ([f]) => {
          setAvisos("ifc", ifcCitado && f.name.toLowerCase() !== ifcCitado.toLowerCase() ? [`A planilha cita "${ifcCitado}" e foi enviado "${f.name}".`] : []);
          await abrirIfcComoProjeto(f.name, await f.arrayBuffer());
        }}
        avisos={avisos.ifc}
      >
        {ifcCitado && !ifcOk && !casaDaPlanilha && (
          <div className="alternativas-ifc">
            {exemploDoApp && (
              <a className="link" href={`modelos/${exemploDoApp}`} download data-testid="baixar-ifc-exemplo">
                Baixar {exemploDoApp}
              </a>
            )}
            {planilha?.modelo && (
              <button type="button" className="btn" data-testid="usar-casa-modelo" data-tip="Gera a casa pelas medidas da aba Modelo da planilha (terreno, área, pavimentos, pé-direito e cobertura), sem o IFC." onClick={() => void usarCasaDaPlanilha()}>
                Usar a casa da aba Modelo
              </button>
            )}
          </div>
        )}
      </CartaoArquivo>

      <CartaoArquivo
        id="falas"
        titulo="Apresentação"
        situacao={!falas.trechos.length && !falas.faltando.length ? "opcional" : falas.faltando.length ? "falta" : falas.naoCitados.length ? "aviso" : "ok"}
        estado={
          !falas.trechos.length && !falas.faltando.length ? "nenhum arquivo"
            : falas.automaticas ? `${contagem} · ${seg(tempoDeVoz)}`
              : `${falas.trechos.length} de ${falas.trechos.length + falas.faltando.length}${falas.trechos.length ? ` · ${seg(tempoDeVoz)}` : ""}`
        }
        aceitar="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm,audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus"
        multiplos
        rotulo="Enviar vídeos ou áudios"
        dica="Vídeos da engenheira falando (MP4, MOV ou WebM) e/ou áudios de narração (MP3, M4A, WAV ou OGG): a narração toca sobre a obra, sem a pessoa. Cada arquivo é aberto aqui para conferir formato e duração. Com a aba Falas preenchida, o nome do arquivo deve ser o da coluna arquivo. A ordem se ajusta no passo Conferir. Para enviar vários de uma vez, segure Ctrl ao clicar nos arquivos ou arraste-os para o cartão."
        aoEscolher={async (f) => setAvisos("falas", (await adicionarFalas(f)).avisos)}
        avisos={avisos.falas}
      >
        {(falas.trechos.length > 0 || falas.faltando.length > 0 || falas.naoCitados.length > 0) && (
          <ol className="lista-arquivos" data-testid="lista-falas">
            {linhasDaLista.map((l) => {
              const t = falas.trechos.find((x) => x.linha.arquivo.toLowerCase() === l.arquivo.toLowerCase());
              return (
                <li key={l.arquivo} data-ok={!!t}>
                  <span className="mono">{l.arquivo}</span>
                  <span className="tenue">{t ? `${t.semVideo ? "narração · " : ""}${seg(t.fimS - t.inicioS)}` : "falta"}</span>
                  {t && <Remover nome={l.arquivo} aoRemover={() => void removerFala(l.arquivo)} />}
                </li>
              );
            })}
            {falas.naoCitados.map((n) => (
              <li key={n} data-ok="fora">
                <span className="mono">{n}</span>
                <span className="tenue">não citado na aba Falas</span>
              </li>
            ))}
          </ol>
        )}
        {falas.automaticas && <p className="nota-cartao">Aba Falas vazia: os arquivos entram na ordem de envio.</p>}
        {tempoDeVoz > 0 && (
          <DicaQuantidade
            testId="dica-falas"
            rotulo={`${seg(tempoDeVoz)} de voz: combinam até ${fotosRecomendadas(tempoDeVoz).ideal} foto${fotosRecomendadas(tempoDeVoz).ideal > 1 ? "s" : ""}`}
            texto={`O vídeo dura o tempo da voz (${seg(tempoDeVoz)}), mais 3 s por foto, mais 1 s de respiro e a marca no fim.\n${fotosRecomendadas(tempoDeVoz).texto}\nNos Reels, falas curtas (até uns 15 s cada) costumam segurar melhor a atenção; com mais de 60 s no total, considere dividir em dois vídeos.`}
          />
        )}
      </CartaoArquivo>

      <CartaoArquivo
        id="fotos"
        titulo="Fotos"
        situacao={!fotosCitadas.length && !fotos.length ? "opcional" : fotosFaltando.length ? "aviso" : "ok"}
        estado={fotosCitadas.length ? `${fotosCitadas.length - fotosFaltando.length} de ${fotosCitadas.length}` : fotos.length ? `${fotos.length}` : "opcional"}
        aceitar="image/jpeg,image/png,image/webp"
        multiplos
        rotulo="Enviar fotos"
        dica="Fotos JPEG, PNG ou WebP. Data, local, descrição e etapa vêm da aba Fotos, pelo nome do arquivo. No vídeo, cada foto entra emoldurada, com data e etapa, no ponto da obra do dia dela (a ordem se ajusta no Conferir)."
        aoEscolher={async (f) => setAvisos("fotos", (await adicionarFotos(f)).avisos)}
        avisos={avisos.fotos}
      >
        <DicaQuantidade
          testId="dica-fotos"
          situacao={fotos.length <= fotosRecomendadas(tempoDeVoz).ideal ? (fotos.length ? "ok" : "neutra") : "alerta"}
          rotulo={`Ideal: até ${fotosRecomendadas(tempoDeVoz).ideal} foto${fotosRecomendadas(tempoDeVoz).ideal > 1 ? "s" : ""}${fotos.length ? ` · enviadas: ${fotos.length}` : ""}`}
          texto={`${fotosRecomendadas(tempoDeVoz).texto}\nCada foto fica 3 s na tela (de 2 a 6 s, ajustável no Conferir), emoldurada sobre a obra no dia dela.${fotos.length > fotosRecomendadas(tempoDeVoz).ideal ? `\nCom ${fotos.length} fotos, o vídeo ganha ${seg(fotos.length * 3)} sem voz: tire algumas no Conferir ou grave mais fala.` : ""}`}
        />
      </CartaoArquivo>

      <CartaoArquivo
        id="trilhas"
        titulo="Trilha sonora"
        situacao={trilhas.size ? "ok" : "opcional"}
        estado={trilhas.size ? `${trilhas.size} trilha${trilhas.size > 1 ? "s" : ""}` : "opcional"}
        aceitar="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus"
        multiplos
        rotulo="Enviar trilhas"
        dica="Músicas de fundo (MP3, M4A, WAV ou OGG): uma para o início, uma para o final e, se quiser, outras no meio. O volume abaixa sozinho quando há voz e some no fim do vídeo. Onde cada uma entra se ajusta no Conferir. Use músicas com licença para redes sociais. Para enviar vários de uma vez, segure Ctrl ao clicar nos arquivos ou arraste-os para o cartão."
        aoEscolher={async (f) => setAvisos("trilhas", (await adicionarTrilhas(f)).avisos)}
        avisos={avisos.trilhas}
      >
        {trilhas.size > 0 && (
          <ol className="lista-arquivos" data-testid="lista-trilhas">
            {[...trilhas.values()].map((t) => (
              <li key={t.nome} data-ok>
                <span className="mono">{t.nome}</span>
                <span className="tenue">{seg(t.duracaoS)}</span>
                <Remover nome={t.nome} aoRemover={() => void removerTrilha(t.nome)} />
              </li>
            ))}
          </ol>
        )}
      </CartaoArquivo>

    </div>
  );
}
