// Relatório PDF da obra numa data (§59, ADR-15): imagem, avanço, etapas, desvios e fotos.
import { blobDaFoto } from "./anexos";
import { SLOGAN } from "./marca";
import { camadasPara } from "./estadoCena";
import { avancoPlanejado, avancoReal, desviosDasTarefas, temDadosReais } from "../fourd/real";
import { duracaoObra } from "../fourd/simulacao";
import { formatarBR } from "../fourd/tempo";
import type { Cena } from "../rendering/Cena";
import { poseDoPreset } from "../rendering/cameras";
import { useProjeto } from "../state/projectStore";
import type { Tarefa } from "../types";

const pct = (f: number) => `${Math.round(f * 100)}%`;

/** Reduz uma imagem para JPEG de no máximo `max` px no lado maior. */
async function jpeg(b: Blob, max: number): Promise<{ dados: Uint8Array; w: number; h: number }> {
  const img = await createImageBitmap(b);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  img.close();
  const out = await new Promise<Blob>((r, rej) => c.toBlob((x) => (x ? r(x) : rej(new Error("toBlob falhou"))), "image/jpeg", 0.85));
  return { dados: new Uint8Array(await out.arrayBuffer()), w: c.width, h: c.height };
}

/** Situação de cada tarefa no dia: pelo real, quando há dados reais; senão, pelo planejado. */
function situacao(tarefas: Tarefa[], dia: number, comReal: boolean) {
  const concluidas: Tarefa[] = [], andamento: Tarefa[] = [], proximas: Tarefa[] = [];
  for (const t of tarefas) {
    const ini = comReal ? t.realIni : t.ini;
    const fim = comReal ? t.realFim : t.fim;
    if (ini !== undefined && fim !== undefined && fim < dia) concluidas.push(t);
    else if (ini !== undefined && ini <= dia) andamento.push(t);
    else proximas.push(t);
  }
  proximas.sort((a, b) => a.ini - b.ini);
  return { concluidas, andamento, proximas: proximas.slice(0, 5) };
}

export async function gerarRelatorio(cena: Cena): Promise<Blob> {
  const s = useProjeto.getState();
  if (!s.cronograma) throw new Error("Sem cronograma.");
  const { jsPDF } = await import("jspdf");
  const c = s.cronograma;
  const dia = Math.floor(s.dia);
  const total = duracaoObra(c.tarefas);
  const comReal = temDadosReais(c.tarefas);
  const dataCivil = c.inicio + dia;

  // imagem da obra na data, pela visão escolhida, sem seleção nem isolamento
  cena.silencioso = true;
  let imagem: Blob;
  try {
    cena.aplicar(camadasPara(s, cena, dia + 0.999, true));
    imagem = await cena.capturar(1600, 900, poseDoPreset("isometrica", cena.enquadramento()));
  } finally {
    cena.silencioso = false;
    cena.aplicar(camadasPara(useProjeto.getState(), cena, useProjeto.getState().dia));
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const M = 15, L = 210 - 2 * M;
  let y = M;
  const quebra = (h: number) => {
    if (y + h > 297 - 18) {
      doc.addPage();
      y = M;
    }
  };
  const texto = (t: string, tam = 10, estilo: "normal" | "bold" = "normal", cor: [number, number, number] = [28, 31, 35]) => {
    doc.setFont("helvetica", estilo);
    doc.setFontSize(tam);
    doc.setTextColor(...cor);
    const linhas = doc.splitTextToSize(t, L) as string[];
    const h = linhas.length * tam * 0.42;
    quebra(h);
    doc.text(linhas, M, y + tam * 0.35);
    y += h + 1.5;
  };
  const titulo = (t: string) => {
    y += 2;
    quebra(10);
    doc.setDrawColor(141, 113, 48); // latão
    doc.setLineWidth(0.6);
    doc.line(M, y, M + 12, y);
    y += 3;
    texto(t, 12, "bold");
  };

  texto("Relatório da obra", 18, "bold");
  texto(s.nomeProjeto ?? "Projeto", 12, "normal", [74, 80, 88]);
  texto(`Data: ${formatarBR(dataCivil)} · dia ${dia + 1} de ${total} · visão ${s.visao === "planejado" ? "planejada" : s.visao === "real" ? "real" : "comparada"}`, 10, "normal", [74, 80, 88]);
  y += 2;

  const img = await jpeg(imagem, 1600);
  const hImg = (L * img.h) / img.w;
  quebra(hImg);
  doc.addImage(img.dados, "JPEG", M, y, L, hImg);
  y += hImg + 4;

  titulo("Avanço");
  const ap = avancoPlanejado(c.tarefas, dia);
  if (comReal) {
    const ar = avancoReal(c.tarefas, dia);
    texto(`Planejado: ${pct(ap)} · Real: ${pct(ar)} · Diferença: ${ar - ap >= 0 ? "+" : ""}${Math.round((ar - ap) * 100)} pontos percentuais`);
  } else {
    texto(`Planejado: ${pct(ap)} · Real: sem dados reais informados`);
  }
  texto("Planejado = durações já decorridas ÷ durações totais. Real = avanço físico de cada tarefa ponderado pela duração.", 8, "normal", [115, 122, 131]);

  const sit = situacao(c.tarefas, dia, comReal);
  const lista = (rotulo: string, ts: Tarefa[], extra: (t: Tarefa) => string) => {
    titulo(`${rotulo} (${ts.length})`);
    if (!ts.length) texto("Nenhuma.", 10, "normal", [115, 122, 131]);
    for (const t of ts) texto(`• ${t.nome} — ${extra(t)}`);
  };
  const datas = (t: Tarefa) => `${formatarBR(c.inicio + t.ini)} a ${formatarBR(c.inicio + t.fim)}`;
  lista("Etapas concluídas", sit.concluidas, (t) => (comReal && t.realFim !== undefined ? `terminou em ${formatarBR(c.inicio + t.realFim)}` : `previsto ${datas(t)}`));
  lista("Em andamento", sit.andamento, (t) => `${comReal ? `${pct(t.avanco ?? 0)} executado, ` : ""}previsto ${datas(t)}`);
  lista("Próximas etapas", sit.proximas, (t) => `início previsto ${formatarBR(c.inicio + t.ini)}`);

  if (comReal) {
    const d = desviosDasTarefas(c.tarefas, dia).slice(0, 10);
    titulo(`Desvios (${d.length})`);
    if (!d.length) texto("Nenhum desvio até esta data.", 10, "normal", [115, 122, 131]);
    for (const x of d) texto(`• ${x.tarefa.nome}: ${x.motivo} (${Math.abs(x.dias)} ${Math.abs(x.dias) === 1 ? "dia" : "dias"}${x.dias < 0 ? " antes" : ""})`, 10, "normal", x.dias > 0 ? [139, 58, 58] : [63, 92, 120]);
  }

  // fotos dos 30 dias até a data
  const fotos = s.fotos.filter((f) => f.dia <= dataCivil && f.dia > dataCivil - 30).slice(-4);
  if (fotos.length) {
    titulo(`Fotos da obra (${fotos.length}, últimos 30 dias)`);
    const lado = (L - 6) / 2;
    for (let i = 0; i < fotos.length; i++) {
      const b = blobDaFoto(fotos[i].id);
      if (!b) continue;
      const f = await jpeg(b, 1000);
      const h = Math.min((lado * f.h) / f.w, 70);
      const w = (h * f.w) / f.h;
      if (i % 2 === 0) quebra(h + 10);
      const x = M + (i % 2) * (lado + 6);
      doc.addImage(f.dados, "JPEG", x, y, w, h);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(74, 80, 88);
      const leg = `${formatarBR(fotos[i].dia)}${fotos[i].local ? ` · ${fotos[i].local}` : ""}${fotos[i].descricao ? ` · ${fotos[i].descricao}` : ""}`;
      doc.text(doc.splitTextToSize(leg, lado) as string[], x, y + h + 3.5);
      if (i % 2 === 1 || i === fotos.length - 1) y += h + 10;
    }
  }

  // rodapé em todas as páginas
  const n = doc.getNumberOfPages();
  const avisos = [s.demoModelo || s.demoCronograma ? "DADOS DE DEMONSTRAÇÃO (fictícios)" : "", s.tipoModelo === "PARAMETRICO" ? "Modelo paramétrico: representação simplificada, não é projeto executivo" : "", c.estimado ? "Cronograma estimado automaticamente, não é cronograma executivo" : ""].filter(Boolean).join(" · ");
  const agora = new Date().toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  for (let p = 1; p <= n; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(115, 122, 131);
    doc.text(`Construction 4D Studio · ${SLOGAN} · gerado em ${agora} · página ${p} de ${n}`, M, 297 - 9);
    if (avisos) doc.text(avisos, M, 297 - 5.5);
  }
  return doc.output("blob");
}
