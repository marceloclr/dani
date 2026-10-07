// Insolação sobre a imagem (ADR-26), como no modulus: hora do dia, sol (altura e azimute), sol direto
// nas fachadas no dia da simulação e qual fachada recebe o sol agora.
import { useMemo } from "react";
import { useProjeto } from "../state/projectStore";
import { solDoProjeto } from "../app/solDaCena";
import { FACHADAS, cosIncidencia, hora, radiacaoNaFachada, rumo, rumoDaFachada } from "../rendering/sol";
import { formatarBR } from "../fourd/tempo";

const fmt = (n: number, casas = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas });
const NOME_FACHADA = { frontal: "Frontal", "lateral direita": "Lateral direita", fundos: "Fundos", "lateral esquerda": "Lateral esquerda" } as const;

export function PainelInsolacao({ minutos, aoMudar, aoFechar }: { minutos: number; aoMudar(m: number): void; aoFechar(): void }) {
  // assina o que muda o sol: data, local, norte e IFC
  const dia = useProjeto((s) => s.dia);
  const solCfg = useProjeto((s) => s.video.sol);
  const geo = useProjeto((s) => s.geoIfc);
  const crono = useProjeto((s) => s.cronograma);
  const r = solDoProjeto(useProjeto.getState(), minutos);
  const radiacao = useMemo(
    () => FACHADAS.map((f) => ({ f, kwh: radiacaoNaFachada(r.ctx.local, r.diaCivil, rumoDaFachada(f, r.ctx.norte)) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dia, solCfg, geo, crono, r.diaCivil, r.ctx.norte],
  );
  const max = Math.max(0.01, ...radiacao.map((x) => x.kwh));
  const p = r.posicao;
  const aoSol = FACHADAS.filter((f) => cosIncidencia(p, rumoDaFachada(f, r.ctx.norte)) > 0.05);
  const origem = { ajustado: "ajustado na tela", ifc: "do IFC", municipio: "do município da obra", padrao: "Fortaleza (padrão)" }[r.ctx.origemLocal];
  const origemNorte = { ajustado: "ajustado na tela", ifc: "do IFC", padrao: "frente tomada como voltada ao norte: ajuste na aba Vídeo" }[r.ctx.origemNorte];

  return (
    <div className="painel-insolacao" data-testid="painel-insolacao" role="region" aria-label="Insolação">
      <header>
        <strong>Insolação · {formatarBR(r.diaCivil)}</strong>
        <button type="button" className="btn mini" aria-label="Fechar a insolação" onClick={aoFechar}>
          ✕
        </button>
      </header>
      <label className="campo">
        <span>
          Hora <b className="num" data-testid="insolacao-hora">{hora(minutos)}</b>
        </span>
        <input type="range" min={5 * 60} max={19 * 60} step={15} value={minutos} onChange={(e) => aoMudar(Number(e.target.value))} data-testid="insolacao-controle" />
      </label>
      <p className="sol-agora calc" tabIndex={0} data-testid="insolacao-sol" data-tip={`Sol pelas fórmulas do NOAA (declinação, equação do tempo e ângulo horário), hora de Brasília.\nLocal: ${fmt(r.ctx.local.lat, 4)}°, ${fmt(r.ctx.local.lon, 4)}° (${origem}).\nFrente da casa voltada para ${Math.round(r.ctx.norte)}° (${rumo(r.ctx.norte)}; ${origemNorte}).\nNasce ${hora(r.efemerides.nascer)} · põe-se ${hora(r.efemerides.por)}.`}>
        {p.elevacao > 0 ? (
          <>
            Sol a <b>{Math.round(p.elevacao)}°</b> de altura, azimute <b>{Math.round(p.azimute)}°</b> ({rumo(p.azimute)}) · {aoSol.length ? `bate na fachada ${aoSol.map((f) => NOME_FACHADA[f].toLowerCase()).join(" e na ")}` : "sem sol direto nas fachadas"}
          </>
        ) : (
          <>Sol abaixo do horizonte (nasce {hora(r.efemerides.nascer)}, põe-se {hora(r.efemerides.por)})</>
        )}
      </p>
      <h4>Sol direto nas fachadas no dia</h4>
      <div className="barras-sol">
        {radiacao.map(({ f, kwh }) => (
          <div key={f} className="barra-sol calc" tabIndex={0} data-tip={`Fórmula: Σ DNI × cos(incidência) × 0,25 h, das 6h às 18h (passo de 15 min)\nDNI de Meinel: 1.353 × 0,7^(massa de ar^0,678) W/m²\nFachada ${NOME_FACHADA[f].toLowerCase()} voltada para ${Math.round(rumoDaFachada(f, r.ctx.norte))}° (${rumo(rumoDaFachada(f, r.ctx.norte))})\nResultado: ${fmt(kwh, 2)} kWh/m² no dia`}>
            <span>{NOME_FACHADA[f]}</span>
            <i style={{ width: `${(100 * kwh) / max}%` }} />
            <em className="num">{fmt(kwh, 1)} kWh/m²</em>
          </div>
        ))}
      </div>
      <p className="tenue pequeno">Laranja no chão: fachadas ao sol agora. As sombras são as do sol real nesta hora (só a radiação direta).</p>
    </div>
  );
}
