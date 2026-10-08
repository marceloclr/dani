// Passo 2 do assistente (ADR-30): o que foi lido, os avisos e a prévia grande de cada cena do vídeo.
import { useEffect, useState } from "react";
import { obterCena } from "../app/estadoCena";
import { mostrarNaMontagem } from "../app/videoDaObra";
import { Viewport } from "../components/Viewport";
import { avancoPlanejado, avancoReal, temDadosReais } from "../fourd/real";
import { duracaoObra } from "../fourd/simulacao";
import { formatarBR, hojeCivil } from "../fourd/tempo";
import { NOME_LUZ, type Luz } from "../rendering/iluminacao";
import { NOME_CENA, NOME_PASSEIO, duracoes, type Cena } from "../rendering/montagem";
import { localizarNaSequencia, previaApresentadora, quadroDaFala } from "../rendering/apresentadora";
import { RESOLUCOES, useProjeto, type FormatoVideo } from "../state/projectStore";
import type { FalasDoVideo } from "../app/falas";
import { desenharFotoEmoldurada } from "../rendering/fotoNoVideo";
import { SequenciaDoVideo } from "./SequenciaDoVideo";

const FORMATOS: { id: FormatoVideo; rotulo: string }[] = [
  { id: "vertical", rotulo: "9:16" },
  { id: "horizontal", rotulo: "16:9" },
  { id: "quadrado", rotulo: "1:1" },
];
const LUZES: Luz[] = ["nascer", "dia", "entardecer", "noite", "ciclo"];
const pct = (f: number) => `${Math.round(f * 100)}%`;
const seg = (s: number) => `${s.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;

export function PassoConferir({ falas, cenas, segundos }: { falas: FalasDoVideo; cenas: Cena[]; segundos: number }) {
  const planilha = useProjeto((s) => s.planilha);
  const cronograma = useProjeto((s) => s.cronograma);
  const problemas = useProjeto((s) => s.problemasImportacao);
  const video = useProjeto((s) => s.video);
  const aparencia = useProjeto((s) => s.aparencia3d);
  const nFotos = useProjeto((s) => s.fotos.length);
  const st = useProjeto.getState;
  const [atual, setAtual] = useState(0);
  const passeio = useProjeto((s) => s.video.passeio ?? "externo");
  // o interior só existe se o voo achou a porta de entrada (a cena 3D é a da prévia)
  const [temInterior, setTemInterior] = useState(true);
  useEffect(() => {
    const id = setTimeout(() => {
      const ok = !!obterCena()?.voo()?.entrada;
      setTemInterior(ok);
      if (!ok && (useProjeto.getState().video.passeio ?? "externo") !== "externo") useProjeto.getState().definirVideo({ passeio: "externo" });
    }, 300);
    return () => clearTimeout(id);
  }, []);
  const [pessoa, setPessoa] = useState<string | null>(null);
  const [fotoPrevia, setFotoPrevia] = useState<string | null>(null);
  const seg_ = duracoes(cenas, segundos);
  const inicio = (i: number) => seg_.slice(0, i).reduce((a, b) => a + b, 0);

  // posiciona a câmera no meio da cena escolhida e traz o quadro da fala daquele instante
  useEffect(() => {
    let vivo = true;
    const t = inicio(atual) + seg_[atual] * 0.5;
    const c = obterCena();
    if (c) mostrarNaMontagem(c, cenas, t, segundos);
    setPessoa(null);
    setFotoPrevia(null);
    const cena = cenas[atual];
    // foto (ADR-34): a mesma moldura do vídeo, no meio da cena
    const foto = cena?.tipo === "foto" && cena.foto !== undefined ? falas.fotos[cena.foto] : null;
    if (foto) {
      void createImageBitmap(foto.blob, { imageOrientation: "from-image" })
        .then((img) => {
          const c = document.createElement("canvas");
          c.width = Math.round(largura / 2);
          c.height = Math.round(altura / 2);
          desenharFotoEmoldurada(c.getContext("2d")!, img, { data: foto.data, etapa: foto.etapa, descricao: foto.descricao }, seg_[atual] * 0.5, seg_[atual]);
          img.close();
          if (vivo) setFotoPrevia(c.toDataURL("image/png"));
        })
        .catch(() => undefined);
    }
    const linha = falas.linhaDoTempo;
    const l = linha.length ? localizarNaSequencia(linha, t) : null;
    const tr = l ? linha[l.indice] : null;
    // narrações e fotos (ADR-34) não têm a pessoa
    if (cena && cena.pessoa !== "oculta" && l && tr?.arquivo && !tr.semVideo && falas.cfg) {
      const arquivo = tr.arquivo;
      // no quadro inteiro, o vídeo original; recortada, a mesma composição do vídeo (IA ou fundo verde), em tamanho reduzido
      // na revelação, ela fica no mesmo lugar do quadro original, já sobre a obra (o fim da cortina)
      const cfg = cena.tipo === "revelacao" ? { ...falas.cfg, posicao: "centro" as const, alturaFracao: 1 } : falas.cfg;
      const pronto = cena.tipo === "fala"
        ? quadroDaFala(arquivo, l.tArquivo).then((q) => q.toDataURL("image/jpeg", 0.8))
        : previaApresentadora(arquivo, { ...cfg, duracaoS: tr.fimS + 0.1 }, Math.round(largura / 3), Math.round(altura / 3), l.tArquivo, true).then((q) => q.toDataURL("image/png"));
      void pronto.then((u) => vivo && setPessoa(u)).catch(() => undefined);
    }
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atual, cenas, segundos, falas, video.formato]);

  const refDia = planilha?.obra.dataReferencia ?? hojeCivil();
  const diaRel = cronograma ? refDia - cronograma.inicio : 0;
  const comReal = cronograma ? temDadosReais(cronograma.tarefas) : false;
  const { largura, altura } = RESOLUCOES[video.formato];
  const cena = cenas[atual];
  const avisos = [...problemas.map((p) => ({ nivel: p.nivel, texto: p.mensagem })), ...falas.avisos.map((a) => ({ nivel: "aviso" as const, texto: a })), ...falas.faltando.map((f) => ({ nivel: "aviso" as const, texto: `Falas: "${f}" não foi enviado; o vídeo sai sem essa fala.` }))];

  return (
    <div className="passo-conferir" data-testid="passo-conferir">
      <aside className="conferir-dados">
        <section className="bloco" style={{ ["--acento" as string]: "var(--grafite)" }}>
          <header>
            <h3>{planilha?.obra.nome || "Obra"}</h3>
          </header>
          <dl className="ficha" data-testid="ficha-conferir">
            {planilha?.obra.proprietario && (<><dt>Proprietário</dt><dd>{planilha.obra.proprietario}</dd></>)}
            {cronograma && (
              <>
                <dt>Prazo</dt>
                <dd className="num">{formatarBR(cronograma.inicio)} a {formatarBR(cronograma.inicio + duracaoObra(cronograma.tarefas) - 1)}</dd>
                <dt>Etapas</dt>
                <dd className="num">{cronograma.tarefas.length}</dd>
                <dt>Avanço em {formatarBR(refDia)}</dt>
                <dd className="num">
                  <span className="calc" tabIndex={0} data-tip={`Fórmula: dias executados ÷ dias de todas as etapas\nPlanejado: ${pct(avancoPlanejado(cronograma.tarefas, diaRel))}${comReal ? `\nReal (início, fim e avanço físico): ${pct(avancoReal(cronograma.tarefas, diaRel))}` : ""}`}>
                    {pct(avancoPlanejado(cronograma.tarefas, diaRel))} planejado{comReal ? ` · ${pct(avancoReal(cronograma.tarefas, diaRel))} real` : ""}
                  </span>
                </dd>
              </>
            )}
            <dt>Falas</dt>
            <dd className="num">{falas.trechos.length ? `${falas.trechos.length} · ${seg(falas.totalS)} de vídeo` : "nenhuma"}</dd>
            <dt>Fotos</dt>
            <dd className="num">{nFotos}</dd>
            <dt>Trilhas</dt>
            <dd className="num">{falas.trilhas.length || "nenhuma"}</dd>
          </dl>
        </section>
        <SequenciaDoVideo falas={falas} />
        {avisos.length > 0 && (
          <section className="bloco tenor-alerta" style={{ ["--acento" as string]: "var(--ocre)" }}>
            <header>
              <h3>Avisos</h3>
              <span className="legenda num">{avisos.length}</span>
            </header>
            <ul className="lista-avisos" data-testid="avisos-conferir">
              {avisos.map((a, i) => (
                <li key={i} data-nivel={a.nivel}>{a.texto}</li>
              ))}
            </ul>
          </section>
        )}
      </aside>

      <section className="conferir-previa">
        <div className="ajustes-previa">
          <div className="segmentos" role="tablist" aria-label="Formato" style={{ ["--acento" as string]: "var(--grafite)" }}>
            {FORMATOS.map((f) => (
              <button key={f.id} type="button" role="tab" className="seg" aria-selected={video.formato === f.id} data-testid={`formato-${f.id}`} data-tip={RESOLUCOES[f.id].rotulo} onClick={() => st().definirVideo({ formato: f.id })}>
                {f.rotulo}
              </button>
            ))}
          </div>
          <div className="segmentos" role="tablist" aria-label="Aparência" style={{ ["--acento" as string]: "var(--grafite)" }}>
            {(["realista", "tecnica"] as const).map((a) => (
              <button key={a} type="button" role="tab" className="seg" aria-selected={aparencia === a} onClick={() => st().definirAparencia3d(a)}>
                {a === "realista" ? "Realista" : "Técnica"}
              </button>
            ))}
          </div>
          <div className="segmentos" role="tablist" aria-label="Passeio" style={{ ["--acento" as string]: "var(--grafite)" }} data-testid="passeio">
            {(["externo", "interno", "ambos"] as const).map((p) => {
              const precisaInterior = p !== "externo";
              const bloqueado = precisaInterior && !temInterior;
              return (
                <button
                  key={p}
                  type="button"
                  role="tab"
                  className="seg"
                  aria-selected={passeio === p}
                  disabled={bloqueado}
                  data-testid={`passeio-${p}`}
                  data-tip={bloqueado ? "Sem porta de entrada encontrada no modelo: o drone não tem por onde entrar." : { externo: "Fim do vídeo: volta por fora, à altura de quem olha da rua.", interno: "Fim do vídeo: o drone entra pela porta e percorre os cômodos, a passo de quem caminha.", ambos: "Fim do vídeo: volta por fora e, depois de um corte, entra pela porta." }[p]}
                  onClick={() => st().definirVideo({ passeio: p })}
                >
                  {NOME_PASSEIO[p]}
                </button>
              );
            })}
          </div>
          <label className="campo campo-linha">
            <span>Luz</span>
            <select value={video.luz ?? "dia"} disabled={aparencia !== "realista"} data-testid="assistente-luz" onChange={(e) => st().definirVideo({ luz: e.target.value as Luz })}>
              {LUZES.map((l) => (
                <option key={l} value={l}>{NOME_LUZ[l]}</option>
              ))}
            </select>
          </label>
        </div>

        <div className={`moldura-previa formato-${video.formato}`} style={{ aspectRatio: `${largura} / ${altura}` }} data-testid="moldura-previa">
          <Viewport simples />
          {cena?.tipo === "marca" && <div className="previa-marca">DANIELLA POMPEU</div>}
          {pessoa && cena?.pessoa !== "oculta" && <img className="previa-pessoa" src={pessoa} alt="" data-testid="previa-pessoa" />}
          {fotoPrevia && cena?.tipo === "foto" && <img className="previa-foto" src={fotoPrevia} alt="" data-testid="previa-foto" />}
        </div>

        <ol className="faixa-cenas" aria-label="Cenas do vídeo" data-testid="faixa-cenas-assistente">
          {cenas.map((c, i) => (
            <li key={c.id} style={{ flex: seg_[i] }}>
              <button type="button" className={`bloco-cena tipo-${c.tipo}${i === atual ? " atual" : ""}`} aria-pressed={i === atual} data-tip={`${c.rotulo ?? NOME_CENA[c.tipo]} · ${seg(seg_[i])}\nDe ${seg(inicio(i))} a ${seg(inicio(i) + seg_[i])}`} onClick={() => setAtual(i)}>
                <span>{c.rotulo ?? NOME_CENA[c.tipo]}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

