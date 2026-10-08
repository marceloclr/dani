// Sol da cena (ADR-26): junta o estado do projeto (data da simulação, município, IFC, bússola e luz
// escolhida) e põe o sol real na cena. O voo automático, a Insolação e o vídeo podem forçar um horário.
import type { Cena } from "../rendering/Cena";
import { useProjeto } from "../state/projectStore";
import { MUNICIPIOS } from "../fourd/feriados";
import { horarioDoVoo, instanteDaHoraDourada, resolverContexto, type ContextoSol } from "../rendering/cicloDia";
import type { Voo } from "../rendering/drone";
import { minutosDaLuz } from "../rendering/iluminacao";
import { FACHADAS, cosIncidencia, direcaoNaCena, minutosDaLuzDia, nascerEPor, posicaoDoSol, rumoDaFachada, solNaFachada, type Efemerides, type Fachada, type PosicaoSol } from "../rendering/sol";
import type { P3 } from "../rendering/navegacao";

type Estado = ReturnType<typeof useProjeto.getState>;

/** Local e norte valendo no projeto aberto. */
export function contextoDoProjeto(s: Estado = useProjeto.getState()): ContextoSol {
  const m = MUNICIPIOS.find((x) => x.id === s.cronograma?.municipio);
  return resolverContexto(s.video.sol, s.geoIfc ?? {}, m ? { lat: m.lat, lon: m.lon } : null);
}

/** Dia civil da simulação (o dia da obra na data do cronograma; sem cronograma, hoje). */
export function diaCivilDaSimulacao(s: Estado = useProjeto.getState(), dia = s.dia): number {
  if (s.cronograma) {
    const fim = s.cronograma.tarefas.length ? Math.max(...s.cronograma.tarefas.map((t) => t.fim)) : 0;
    return s.cronograma.inicio + Math.floor(Math.min(dia, fim));
  }
  const h = new Date();
  return Math.round(Date.UTC(h.getFullYear(), h.getMonth(), h.getDate()) / 86_400_000);
}

export interface SolCalculado {
  ctx: ContextoSol;
  diaCivil: number;
  minutos: number;
  posicao: PosicaoSol;
  efemerides: Efemerides;
}

/** Horário forçado (minutos locais) pelo voo automático ou pela Insolação; null = o da luz escolhida. */
let horarioForcado: number | null = null;
export function forcarHorario(m: number | null): void {
  horarioForcado = m;
}
export const horarioForcadoAtual = () => horarioForcado;

/** Sol do projeto num instante: o horário forçado ou o da luz escolhida, no dia da simulação. */
export function solDoProjeto(s: Estado = useProjeto.getState(), minutos?: number, diaCivil?: number): SolCalculado {
  const ctx = contextoDoProjeto(s);
  const d = diaCivil ?? diaCivilDaSimulacao(s);
  const efemerides = nascerEPor(ctx.local, d);
  // Dia (e o Ciclo parado): sol a 35° de frente para a fachada, com sombras longas (ADR-31)
  const luz = s.video.luz ?? "dia";
  const m = minutos ?? horarioForcado ?? (luz === "dia" || luz === "ciclo" ? minutosDaLuzDia(ctx.local, d, ctx.norte) : minutosDaLuz(luz, efemerides));
  return { ctx, diaCivil: d, minutos: m, posicao: posicaoDoSol(ctx.local, d, m), efemerides };
}

/** Insolação sobre a imagem ligada (botão Insolação da viewport, ou no vídeo quando pedido). */
let insolacaoAtiva = false;
export function definirInsolacaoAtiva(v: boolean): void {
  insolacaoAtiva = v;
}
export const insolacaoLigada = () => insolacaoAtiva;

/** Arco do sol no dia (5h às 19h, de 15 em 15 min, só acima do horizonte), o sol e a incidência por fachada. */
export function dadosDeInsolacao(r: SolCalculado): { arco: P3[]; sol: P3 | null; fachadas: Record<Fachada, number> } {
  const arco: P3[] = [];
  for (let m = 5 * 60; m <= 19 * 60; m += 15) {
    const p = posicaoDoSol(r.ctx.local, r.diaCivil, m);
    if (p.elevacao > 0) arco.push(direcaoNaCena(p, r.ctx.norte));
  }
  const fachadas = Object.fromEntries(FACHADAS.map((f) => [f, cosIncidencia(r.posicao, rumoDaFachada(f, r.ctx.norte))])) as Record<Fachada, number>;
  return { arco, sol: r.posicao.elevacao > 0 ? direcaoNaCena(r.posicao, r.ctx.norte) : null, fachadas };
}

/** Põe na cena o sol do projeto (ou o de `minutos`/`diaCivil`, quando informados) e a insolação, se ligada. */
export function aplicarSol(cena: Cena, minutos?: number, diaCivil?: number, fachadaAoSol = false): SolCalculado {
  const r = solDoProjeto(useProjeto.getState(), minutos, diaCivil);
  // no vídeo com a luz Dia, a fachada frontal sempre ao sol (ADR-33); a insolação continua com o sol real
  const pos = fachadaAoSol ? solNaFachada(r.posicao, r.ctx.norte) : r.posicao;
  cena.definirSol(direcaoNaCena(pos, r.ctx.norte), pos.elevacao);
  cena.definirInsolacao(insolacaoAtiva && useProjeto.getState().aparencia3d === "realista" ? dadosDeInsolacao(r) : null);
  return r;
}

/**
 * Horário (minutos) em cada instante do voo no Ciclo do dia (ADR-26), no dia da simulação ao fim da obra:
 * amanhecer → meio-dia (obra pronta) → 15h30 (interior) → hora dourada diante da fachada ao sol → noite.
 */
export function cicloDoVoo(voo: Voo, s: Estado = useProjeto.getState()): (u: number) => number {
  const r = solDoProjeto(s, 600, diaCivilDaSimulacao(s, Number.MAX_SAFE_INTEGER));
  const dourada = instanteDaHoraDourada(voo.quadro, voo.centro, voo.marcas, r.ctx.local, r.diaCivil, r.efemerides, r.ctx.norte);
  return (u) => horarioDoVoo(u, voo.marcas, dourada.u, r.efemerides);
}
