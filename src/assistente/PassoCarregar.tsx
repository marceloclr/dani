// Passo 1 do assistente (ADR-30): um cartão por tipo de arquivo, cada um com o que foi recebido e o que falta.
import { useRef, useState, type ReactNode } from "react";
import { adicionarFalas, adicionarFotos } from "../app/anexos";
import { abrirPlanilha } from "../app/planilha";
import { abrirIfcComoProjeto } from "../app/projetos";
import { formatarBR } from "../fourd/tempo";
import { useProjeto } from "../state/projectStore";
import type { FalasDoVideo } from "../app/falas";
import { MARCA_S } from "../rendering/montagem";

type Situacao = "ok" | "falta" | "opcional" | "aviso";
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
  children?: ReactNode;
}

/** Cartão de um tipo de arquivo: zona de soltar, botão e o estado do que chegou. */
function CartaoArquivo({ id, titulo, situacao, estado, aceitar, multiplos, rotulo, dica, aoEscolher, children }: PropsCartao) {
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
  const [avisos, setAvisos] = useState<string[]>([]);
  const st = useProjeto.getState;

  const erros = problemas.filter((p) => p.nivel === "erro").length;
  const ifcCitado = planilha?.obra.arquivoIfc ?? null;
  const ifcOk = tipoModelo === "IFC" && (!ifcCitado || arquivoModelo?.toLowerCase() === ifcCitado.toLowerCase());
  const fotosCitadas = planilha?.fotos ?? [];
  const recebidasFotos = new Set(fotos.map((f) => f.arquivo.toLowerCase()));
  const fotosFaltando = fotosCitadas.filter((f) => !recebidasFotos.has(f.arquivo.toLowerCase()));

  const abrir = async ([f]: File[]) => {
    setAvisos([]);
    const ok = await abrirPlanilha(f.name, new Uint8Array(await f.arrayBuffer()));
    if (!ok) st().mostrarErro({ mensagem: "Esta não é a planilha da obra.", orientacao: "Use a planilha modelo: ela tem as abas Obra e Cronograma." });
    else st().mostrarErro(null);
  };

  return (
    <div className="passo-carregar" data-testid="passo-carregar">
      <CartaoArquivo
        id="planilha"
        titulo="Planilha da obra"
        situacao={!planilha ? "falta" : erros ? "aviso" : "ok"}
        estado={!planilha ? "obrigatória" : `${planilha.arquivo} · ${cronograma?.tarefas.length ?? 0} etapas${erros ? ` · ${erros} erro${erros > 1 ? "s" : ""}` : ""}`}
        aceitar=".xlsx"
        rotulo={planilha ? "Trocar planilha" : "Enviar planilha"}
        dica="Planilha única (.xlsx) com as abas Obra, Modelo, Cronograma, Vínculos, Falas, Fotos, Vídeo e Documento."
        aoEscolher={abrir}
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
        situacao={ifcOk ? "ok" : ifcCitado ? "falta" : tipoModelo === "PARAMETRICO" ? "ok" : "opcional"}
        estado={
          ifcOk ? `${arquivoModelo} · ${nElementos} elementos`
            : ifcCitado ? `falta ${ifcCitado}`
              : tipoModelo === "PARAMETRICO" ? "casa gerada pela aba Modelo"
                : "opcional"
        }
        aceitar=".ifc"
        rotulo="Enviar IFC"
        dica="Modelo do arquiteto (IFC2x3, IFC4 ou IFC4x3). Sem IFC, a casa é gerada pelas medidas da aba Modelo."
        aoEscolher={async ([f]) => {
          if (ifcCitado && f.name.toLowerCase() !== ifcCitado.toLowerCase()) setAvisos([`A planilha cita "${ifcCitado}" e foi enviado "${f.name}".`]);
          await abrirIfcComoProjeto(f.name, await f.arrayBuffer());
        }}
      />

      <CartaoArquivo
        id="falas"
        titulo="Vídeos da engenheira"
        situacao={!planilha?.falas.length ? "opcional" : falas.faltando.length ? "falta" : "ok"}
        estado={!planilha?.falas.length ? "sem falas na planilha" : `${falas.trechos.length} de ${planilha.falas.length}${falas.trechos.length ? ` · ${seg(falas.totalS - MARCA_S)}` : ""}`}
        aceitar="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm"
        multiplos
        rotulo="Enviar vídeos"
        dica="Um ou mais vídeos (MP4, MOV ou WebM). O nome de cada arquivo deve ser o da coluna arquivo da aba Falas."
        aoEscolher={async (f) => setAvisos((await adicionarFalas(f)).avisos)}
      >
        {!!planilha?.falas.length && (
          <ol className="lista-arquivos" data-testid="lista-falas">
            {planilha.falas.map((l) => {
              const t = falas.trechos.find((x) => x.linha === l);
              return (
                <li key={l.arquivo} data-ok={!!t}>
                  <span className="mono">{l.arquivo}</span>
                  <span className="tenue">{t ? seg(t.fimS - t.inicioS) : "falta"}</span>
                </li>
              );
            })}
          </ol>
        )}
      </CartaoArquivo>

      <CartaoArquivo
        id="fotos"
        titulo="Fotos da obra"
        situacao={!fotosCitadas.length && !fotos.length ? "opcional" : fotosFaltando.length ? "aviso" : "ok"}
        estado={fotosCitadas.length ? `${fotosCitadas.length - fotosFaltando.length} de ${fotosCitadas.length}` : fotos.length ? `${fotos.length}` : "opcional"}
        aceitar="image/jpeg,image/png,image/webp"
        multiplos
        rotulo="Enviar fotos"
        dica="Fotos JPEG, PNG ou WebP. Data, local, descrição e etapa vêm da aba Fotos, pelo nome do arquivo."
        aoEscolher={async (f) => setAvisos((await adicionarFotos(f)).avisos)}
      />

      {avisos.length > 0 && (
        <ul className="avisos-carga" role="status" data-testid="avisos-carga">
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
