// Assistente (ADR-30): a tela principal. Três passos — carregar os arquivos, conferir e gerar — sobre a
// planilha da obra. Tudo o que o estúdio fazia continua na área de Gestão e ajustes (#/gestao).
import { useState } from "react";
import { Viewport } from "../components/Viewport";
import { normalizar, roteiroReels } from "../rendering/montagem";
import { useProjeto } from "../state/projectStore";
import { PassoCarregar } from "./PassoCarregar";
import { PassoConferir } from "./PassoConferir";
import { PassoGerar } from "./PassoGerar";
import { usarFalas } from "./usarFalas";

const PASSOS = ["Carregar", "Conferir", "Gerar"] as const;

export function Assistente() {
  const [passo, setPasso] = useState(0);
  const falas = usarFalas();
  const temPlanilha = useProjeto((s) => !!s.planilha);
  const pronto = useProjeto((s) => !!s.tipoModelo && !!s.cronograma);
  const segundosEscolhidos = useProjeto((s) => s.video.segundos);
  // com falas, o vídeo segue as falas (+ a marca); sem elas, a duração da aba Vídeo e o roteiro sem pessoa
  const segundos = falas.trechos.length ? falas.totalS : segundosEscolhidos;
  const passeio = useProjeto((s) => s.video.passeio ?? "externo");
  const cenas = falas.trechos.length ? falas.cenas : normalizar(roteiroReels(false, passeio), segundos, false); // passeio escolhido (ADR-32)
  const gerando = useProjeto((s) => s.gerandoVideo);
  // durante a geração, sair do passo descartaria o vídeo: a navegação fica travada
  const liberado = (i: number) => !gerando && (i === 0 || (temPlanilha && pronto));
  // o que falta para seguir, dito ao lado do botão
  const ifcCitado = useProjeto((s) => s.planilha?.obra.arquivoIfc ?? null);
  const temModelo = useProjeto((s) => !!s.tipoModelo);
  const temCronograma = useProjeto((s) => !!s.cronograma);
  const pendencia = !temPlanilha ? "Falta a planilha da obra." : !temModelo ? (ifcCitado ? `Falta o IFC ${ifcCitado} (ou use a casa da aba Modelo).` : "Falta a casa: preencha a aba Modelo ou envie um IFC.") : !temCronograma ? "Falta um cronograma válido: veja os erros no cartão da planilha." : null;

  return (
    <main className="assistente" data-testid="assistente">
      <nav className="passos-assistente" aria-label="Passos">
        {PASSOS.map((p, i) => (
          <button key={p} type="button" className="aba-passo" aria-current={passo === i ? "step" : undefined} disabled={!liberado(i)} data-testid={`passo-${i + 1}`} onClick={() => setPasso(i)}>
            <span className="num-passo">{i + 1}</span>
            {p}
          </button>
        ))}
      </nav>
      <div className="assistente-corpo">
        {passo === 0 && <PassoCarregar falas={falas} />}
        {passo === 1 && pronto && <PassoConferir falas={falas} cenas={cenas} segundos={segundos} />}
        {passo === 2 && pronto && (
          <>
            <PassoGerar falas={falas} cenas={cenas} segundos={segundos} />
            {/* a cena 3D precisa existir para gerar: fica fora da vista, no tamanho do formato */}
            <div className="cena-oculta" aria-hidden>
              <Viewport simples />
            </div>
          </>
        )}
      </div>
      <footer className="assistente-nav">
        <button type="button" className="btn" disabled={passo === 0 || gerando} onClick={() => setPasso(passo - 1)}>
          ← {PASSOS[passo - 1] ?? ""}
        </button>
        {passo === 0 && pendencia && (
          <span className="pendencia" role="status" data-testid="pendencia">
            {pendencia}
          </span>
        )}
        {passo < 2 && (
          <button type="button" className="btn primario" data-testid="avancar" disabled={!liberado(passo + 1)} onClick={() => setPasso(passo + 1)}>
            {PASSOS[passo + 1]} →
          </button>
        )}
      </footer>
    </main>
  );
}
