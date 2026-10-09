// INC-19: vídeo de imagens — PDF de apresentação → imagens e títulos → Conferir (formato, duração, roteiro)
// → MP4 com a trilha; o trabalho volta depois de recarregar a página.
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { jsPDF } from "jspdf";
import { BufferSource, Input, MP4 } from "mediabunny";

test.describe.configure({ timeout: 300_000 });

const jpg = (nome: string) => "data:image/jpeg;base64," + readFileSync(`public/texturas/${nome}_cor.jpg`).toString("base64");

/**
 * PDF como o de um estúdio: capa com texto e imagem de fundo; páginas com um render grande e a logo pequena
 * no canto; a página 2 com o nome do ambiente em texto; a página 4 repete o render da página 3.
 */
function pdfDeApresentacao(): Buffer {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: [1440, 810] });
  const logo = jpg("concrete_wall_008");
  doc.addImage(jpg("clay_roof_tiles_02"), "JPEG", 0, 0, 1440, 810);
  doc.setFontSize(80);
  doc.text("APRESENTAÇÃO DE PROJETO", 720, 380, { align: "center" });
  doc.setFontSize(28);
  doc.text("CASA TESTE", 720, 470, { align: "center" });
  const pagina = (imagem: string, titulo?: string) => {
    doc.addPage([1440, 810], "landscape");
    doc.addImage(imagem, "JPEG", 120, 0, 1200, 810);
    doc.addImage(logo, "JPEG", 1340, 20, 80, 80); // logo: pequena na página
    if (titulo) {
      doc.setFontSize(40);
      doc.text(titulo, 140, 760);
    }
  };
  pagina(jpg("coral_stone_wall"), "SALA DE ESTAR");
  pagina(jpg("concrete_wall_008"));
  pagina(jpg("concrete_wall_008")); // repetida
  return Buffer.from(doc.output("arraybuffer"));
}

test("PDF → imagens com títulos → MP4 com trilha, roteiro e trabalho guardado", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  await page.goto("/#/imagens");
  await expect(page.getByTestId("modo-imagens")).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("entrada-imagens").setInputFiles({ name: "apresentacao.pdf", mimeType: "application/pdf", buffer: pdfDeApresentacao() });
  // capa + 2 renders: a logo (pequena) e a página repetida ficam de fora
  await expect(page.getByTestId("estado-imagens")).toHaveText(/^3 imagens · \d no vídeo$/, { timeout: 60_000 });
  await expect(page.getByTestId("avisos-imagens")).toContainText("1 imagem(ns) repetida(s)");
  await page.getByTestId("entrada-trilhas-img").setInputFiles({ name: "trilha.wav", mimeType: "audio/wav", buffer: wavDeTom(20) });
  await expect(page.getByTestId("lista-trilhas-img")).toContainText("início");

  await page.getByTestId("img-avancar").click();
  // o texto da capa vira o título do vídeo; o maior texto da página, o título do ambiente
  await expect(page.getByTestId("titulo-video")).toHaveValue("Apresentação de projeto — Casa teste");
  await expect(page.getByTestId("marcar-img-0")).not.toBeChecked(); // a capa entra desmarcada
  await expect(page.getByTestId("titulo-img-1")).toHaveValue("SALA DE ESTAR");
  await page.getByTestId("titulo-img-2").fill("Cozinha");
  await page.getByTestId("formato-img-horizontal").click();
  await page.getByTestId("duracao-img-15").click();
  await page.getByTestId("selecionar-auto").click();
  // a seleção pela duração deixa a capa de fora
  await expect(page.getByTestId("resumo-plano")).toContainText("2 de 3 imagens no vídeo · 2 ambientes");
  await expect(page.getByTestId("marcar-img-0")).not.toBeChecked();
  await expect(page.getByTestId("aviso-plano")).toContainText("fica 7,8 s"); // 2 imagens em 15 s: poucas
  const [roteiro] = await Promise.all([page.waitForEvent("download"), page.getByTestId("baixar-roteiro").click()]);
  const txt = readFileSync(await roteiro.path(), "utf8");
  expect(txt).toContain("ROTEIRO DE NARRAÇÃO — Apresentação de projeto — Casa teste");
  expect(txt).toMatch(/SALA DE ESTAR \(1 imagem\)/);
  expect(txt).toMatch(/Cozinha \(1 imagem\)/);
  await expect(page.getByTestId("previa-imagens")).toBeVisible();

  await page.getByTestId("img-avancar").click();
  await expect(page.getByTestId("config-img")).toContainText("2 imagens · sem narração · 1 trilha");
  await page.getByTestId("img-saida").selectOption("mp4-whatsapp");
  const baixa = page.waitForEvent("download", { timeout: 240_000 });
  await page.getByTestId("img-gerar-video").click();
  const video = await baixa;
  expect(video.suggestedFilename()).toMatch(/^apresentacao-de-projeto-casa-teste-\d{8}-\d{4}-whatsapp\.mp4$/);
  const input = new Input({ formats: [MP4], source: new BufferSource(readFileSync(await video.path())) });
  expect(await input.computeDuration()).toBeCloseTo(15, 0);
  const vt = (await input.getPrimaryVideoTrack())!;
  expect([vt.displayWidth, vt.displayHeight]).toEqual([1280, 720]);
  expect(await input.getPrimaryAudioTrack()).not.toBeNull();

  // recarregar: imagens, títulos, seleção e formato voltam do navegador
  await page.waitForTimeout(800); // a guarda grava meio segundo depois da última mudança
  await page.reload();
  await expect(page.getByTestId("estado-imagens")).toHaveText("3 imagens · 2 no vídeo", { timeout: 30_000 });
  await page.getByTestId("img-avancar").click();
  await expect(page.getByTestId("titulo-img-2")).toHaveValue("Cozinha");
  await expect(page.getByTestId("formato-img-horizontal")).toHaveAttribute("aria-selected", "true");

  // enviado por engano: o × tira uma imagem; no Carregar, o × do PDF tira todas as que vieram dele
  await page.getByTestId("excluir-img-0").click(); // a capa
  await expect(page.getByTestId("resumo-plano")).toContainText("2 de 2 imagens no vídeo");
  await expect(page.getByTestId("titulo-img-1")).toHaveValue("Cozinha");
  await page.getByTestId("img-passo-1").click();
  await page.getByTestId("remover-apresentacao.pdf").click();
  await expect(page.getByTestId("estado-imagens")).toHaveText("obrigatório");
  await expect(page.getByTestId("img-pendencia")).toHaveText("Falta o PDF ou as imagens.");
  expect(erros).toEqual([]);
});

test("IFC no vídeo de imagens: trilha preservada, voo no Conferir e no roteiro, × tira o IFC", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  await page.goto("/#/imagens");
  await page.getByTestId("entrada-trilhas-img").setInputFiles({ name: "trilha.wav", mimeType: "audio/wav", buffer: wavDeTom(20) });
  await expect(page.getByTestId("lista-trilhas-img")).toContainText("trilha.wav");
  await page.getByTestId("entrada-imagens").setInputFiles({ name: "apresentacao.pdf", mimeType: "application/pdf", buffer: pdfDeApresentacao() });
  await expect(page.getByTestId("estado-imagens")).toHaveText(/^3 imagens/, { timeout: 60_000 });
  await expect(page.getByTestId("estado-ifc-img")).toHaveText("opcional: voo do drone");
  await page.getByTestId("entrada-ifc-img").setInputFiles("public/modelos/sobrado-exemplo.ifc");
  await expect(page.getByTestId("estado-ifc-img")).toHaveText("sobrado-exemplo.ifc · 157 elementos", { timeout: 90_000 });
  // abrir o IFC sem planilha limpa os anexos: a trilha tem de continuar
  await expect(page.getByTestId("lista-trilhas-img")).toContainText("trilha.wav");

  await page.getByTestId("img-avancar").click();
  await expect(page.getByTestId("bloco-voo")).toBeVisible();
  await expect(page.getByTestId("voo-abertura")).toHaveAttribute("aria-selected", "true"); // padrão com IFC
  await page.getByTestId("duracao-img-30").click();
  await page.getByTestId("voo-ambos").click();
  await page.getByTestId("voo-duracao").selectOption("6");
  const [roteiro] = await Promise.all([page.waitForEvent("download"), page.getByTestId("baixar-roteiro").click()]);
  const txt = readFileSync(await roteiro.path(), "utf8");
  expect(txt).toMatch(/0:00,0 – 0:06,0 {2}Voo do drone pela casa \(abertura\)/);
  expect(txt).toMatch(/0:24,0 – 0:30,0 {2}Voo do drone pela casa \(encerramento\)/);
  await page.getByTestId("img-avancar").click();
  await expect(page.getByTestId("config-img")).toContainText("voo do drone (abertura e encerramento, 6 s)");

  // × do IFC: o voo some do Conferir e a trilha continua
  await page.getByTestId("img-passo-1").click();
  await page.getByTestId("remover-sobrado-exemplo.ifc").click();
  await expect(page.getByTestId("estado-ifc-img")).toHaveText("opcional: voo do drone");
  await expect(page.getByTestId("lista-trilhas-img")).toContainText("trilha.wav");
  await page.getByTestId("img-avancar").click();
  await expect(page.getByTestId("bloco-voo")).toHaveCount(0);
  expect(erros).toEqual([]);
});

/** WAV mono 48 kHz com um tom de 330 Hz (trilha de teste). */
function wavDeTom(segundos: number): Buffer {
  const taxa = 48000, n = taxa * segundos, b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(taxa, 24);
  b.writeUInt32LE(taxa * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 330 * i) / taxa) * 8000), 44 + i * 2);
  return b;
}
