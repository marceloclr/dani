// Sol e orientação (ADR-26): norte da casa (do IFC ou ajustado na bússola), local (IFC, município ou
// digitado) e o resumo do sol no dia da simulação, com a fachada que recebe o sol da tarde.
import { useProjeto } from "../state/projectStore";
import { solDoProjeto } from "../app/solDaCena";
import { fachadaAoSol, hora, posicaoDoSol, rumo } from "../rendering/sol";
import { formatarBR } from "../fourd/tempo";

const fmt = (n: number, casas = 0) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas });

/** Planta esquemática com a frente embaixo, o N girado e o sol do entardecer. */
function Bussola({ norte, azPor }: { norte: number; azPor: number }) {
  // planta vista de cima com a frente para baixo (180° na tela): um rumo A fica (A − norte) graus adiante,
  // no sentido horário
  const tela = (a: number) => ((180 + (a - norte)) * Math.PI) / 180;
  const ponta = (a: number, r: number) => [50 + r * Math.sin(tela(a)), 50 - r * Math.cos(tela(a))];
  const [nx, ny] = ponta(0, 40), [sx, sy] = ponta(azPor, 38);
  return (
    <svg className="bussola" viewBox="0 0 100 100" width="96" height="96" role="img" aria-label={`Frente voltada para ${Math.round(norte)}°, norte indicado`}>
      <circle cx="50" cy="50" r="44" fill="none" stroke="var(--linha)" />
      <rect x="34" y="34" width="32" height="32" rx="2" fill="var(--papel-2)" stroke="var(--tinta-3)" />
      <line x1="34" y1="66" x2="66" y2="66" stroke="var(--latao)" strokeWidth="3" />
      <text x="50" y="78" textAnchor="middle" fontSize="7" fill="var(--tinta-3)">frente</text>
      <line x1="50" y1="50" x2={nx} y2={ny} stroke="var(--carmim)" strokeWidth="2" />
      <text x={ponta(0, 47)[0]} y={ponta(0, 47)[1] + 2.5} textAnchor="middle" fontSize="8" fontWeight="600" fill="var(--carmim)">N</text>
      <circle cx={sx} cy={sy} r="4.5" fill="#fcd34d" stroke="#d97706" />
    </svg>
  );
}

export function SolOrientacao() {
  const cfg = useProjeto((s) => s.video.sol);
  useProjeto((s) => s.dia);
  useProjeto((s) => s.geoIfc);
  useProjeto((s) => s.cronograma);
  const st = useProjeto.getState;
  const r = solDoProjeto(st(), 600);
  const e = r.efemerides;
  const nasc = posicaoDoSol(r.ctx.local, r.diaCivil, e.nascer), por = posicaoDoSol(r.ctx.local, r.diaCivil, e.por - 35);
  const tarde = fachadaAoSol(por.azimute, r.ctx.norte), manha = fachadaAoSol(nasc.azimute, r.ctx.norte);
  const mudar = (v: Partial<NonNullable<typeof cfg>>) => st().definirVideo({ sol: { ...(cfg ?? {}), ...v } });
  const origemLocal = { ajustado: "digitado", ifc: "do IFC", municipio: "sede do município da obra", padrao: "Fortaleza (padrão)" }[r.ctx.origemLocal];
  const origemNorte = { ajustado: "ajustado", ifc: "do IFC", padrao: "não informado: frente ao norte" }[r.ctx.origemNorte];

  return (
    <div className="sol-orientacao" data-testid="sol-orientacao">
      <div className="sol-linha">
        <Bussola norte={r.ctx.norte} azPor={por.azimute} />
        <div className="sol-campos">
          <label className="campo" data-tip="Para onde a fachada frontal (a da porta de entrada) está voltada, em graus da bússola (0 = norte, 90 = leste, 180 = sul, 270 = oeste).">
            <span>
              Frente voltada para <b className="num">{Math.round(r.ctx.norte)}°</b> ({rumo(r.ctx.norte)}) · {origemNorte}
            </span>
            <input type="range" min={0} max={359} step={1} value={Math.round(r.ctx.norte)} onChange={(ev) => mudar({ norteGraus: Number(ev.target.value) })} data-testid="sol-norte" />
          </label>
          {r.ctx.origemNorte === "ajustado" && (
            <button type="button" className="btn mini" onClick={() => mudar({ norteGraus: null })} data-testid="sol-norte-ifc">
              Usar o norte do IFC
            </button>
          )}
          <p className="pequeno tenue num" data-testid="sol-local">
            Local: {fmt(r.ctx.local.lat, 4)}°, {fmt(r.ctx.local.lon, 4)}° · {origemLocal}
          </p>
        </div>
      </div>
      <p
        className="relacao calc"
        tabIndex={0}
        data-testid="sol-resumo"
        data-tip={`Fórmulas do NOAA (declinação, equação do tempo, ângulo horário e refração), hora de Brasília.\nNascer e pôr: elevação de −0,833° (borda do disco com a refração).\nFachada ao sol: a que olha para o lado do sol (cosseno da incidência positivo).`}
      >
        Sol em {formatarBR(r.diaCivil)}: nasce {hora(e.nascer)} (az {fmt(nasc.azimute)}°, bate na {manha.fachada}) e se põe {hora(e.por)} (az {fmt(posicaoDoSol(r.ctx.local, r.diaCivil, e.por).azimute)}°); no entardecer, bate na <b>{tarde.fachada}</b>.
      </p>
    </div>
  );
}
