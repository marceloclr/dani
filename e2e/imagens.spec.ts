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
  // o mesmo PDF de novo (aconteceu em 09/10 e as imagens apareciam duas vezes no vídeo): nada entra
  await page.getByTestId("entrada-imagens").setInputFiles({ name: "apresentacao.pdf", mimeType: "application/pdf", buffer: pdfDeApresentacao() });
  await expect(page.getByTestId("avisos-imagens")).toContainText("já estavam na lista", { timeout: 60_000 });
  await expect(page.getByTestId("estado-imagens")).toHaveText(/^3 imagens · \d no vídeo$/);
  await page.getByTestId("entrada-trilhas-img").setInputFiles({ name: "trilha.wav", mimeType: "audio/wav", buffer: wavDeTom(20) });
  await expect(page.getByTestId("lista-trilhas-img")).toContainText("início");

  // dica da quantidade: 30 s (padrão) pedem 12 imagens, de 8 a 15
  await expect(page.getByTestId("dica-imagens")).toContainText("Para 30 s, o ideal são 12 imagens (de 8 a 15)");
  await page.getByTestId("img-avancar").click();
  await expect(page.getByTestId("dica-conferir")).toContainText("Ideal para 30 s: 12 imagens (de 8 a 15)");
  await expect(page.getByTestId("duracao-img-15")).toHaveAttribute("data-tip", /o ideal são 6 imagens/);
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

test("Recomeçar apaga a sessão e o trabalho guardado; os projetos salvos ficam se não pedir", async ({ page }) => {
  await page.goto("/#/imagens");
  await page.getByTestId("entrada-imagens").setInputFiles({ name: "apresentacao.pdf", mimeType: "application/pdf", buffer: pdfDeApresentacao() });
  await expect(page.getByTestId("estado-imagens")).toHaveText(/^3 imagens/, { timeout: 60_000 });
  await page.getByTestId("entrada-trilhas-img").setInputFiles({ name: "trilha.wav", mimeType: "audio/wav", buffer: wavDeTom(5) });
  await page.getByTestId("entrada-ifc-img").setInputFiles("public/modelos/sobrado-exemplo.ifc"); // cria um projeto salvo
  await expect(page.getByTestId("estado-ifc-img")).toContainText("157 elementos", { timeout: 90_000 });
  await page.waitForTimeout(800); // a guarda grava meio segundo depois
  await page.getByTestId("recomecar").click();
  await expect(page.getByTestId("recomecar-projetos")).not.toBeChecked();
  await page.getByTestId("confirmar-recomecar").click();
  // a página recarrega no vídeo da obra, sem nada carregado
  await expect(page.getByTestId("modo-obra")).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
  await expect(page.getByTestId("estado-planilha")).toHaveText("obrigatória");
  await page.getByTestId("modo-imagens").click();
  await expect(page.getByTestId("estado-imagens")).toHaveText("obrigatório");
  await expect(page.getByTestId("estado-ifc-img")).toHaveText("opcional: voo do drone");
  await expect(page.getByTestId("estado-trilhas-img")).toHaveText("opcional");
  // o projeto do IFC continua salvo; com a caixa marcada, sai também
  await page.getByTestId("recomecar").click();
  await expect(page.getByTestId("recomecar-projetos")).toBeVisible();
  await page.getByTestId("recomecar-projetos").check();
  await page.getByTestId("confirmar-recomecar").click();
  await expect(page.getByTestId("modo-obra")).toHaveAttribute("aria-selected", "true", { timeout: 30_000 });
  await page.getByTestId("recomecar").click();
  await expect(page.getByTestId("recomecar-projetos")).toHaveCount(0); // nenhum projeto salvo
});
test("legendas (INC-21): narração em vídeo, texto colado, trechos de fala, prévia, MP4 e trabalho guardado", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  await page.goto("/#/imagens");
  const fotos = ["coral_stone_wall", "concrete_wall_008", "clay_roof_tiles_02"].map((n) => ({ name: `${n}.jpg`, mimeType: "image/jpeg", buffer: readFileSync(`public/texturas/${n}_cor.jpg`) }));
  await page.getByTestId("entrada-imagens").setInputFiles(fotos);
  await expect(page.getByTestId("estado-imagens")).toHaveText(/^3 imagens/, { timeout: 60_000 });
  // narração num vídeo (o do celular ou do WhatsApp): entra o som dele
  await page.getByTestId("entrada-narracao").setInputFiles("e2e/fixtures/apresentadora-verde.mp4");
  await expect(page.getByTestId("estado-narracao")).toContainText("apresentadora-verde.mp4", { timeout: 30_000 });
  await page.getByTestId("img-avancar").click();
  await expect(page.getByTestId("duracao-narracao")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("bloco-legendas")).toBeVisible();
  await page.getByTestId("legendas-texto").fill("Hoje eu vou conversar sobre essa *obra* que nós entregamos. Ficou *linda*!");
  await expect(page.getByTestId("bloco-legendas")).toContainText(/\d+ grupos · 12 palavras/);
  // o som contínuo do vídeo de teste não tem pausas: as palavras se dividem por igual
  await expect(page.getByTestId("legendas-nota")).toContainText("não tem pausas claras");

  // uma voz com pausas: três falas separadas por silêncio
  await page.getByTestId("img-passo-1").click();
  await page.getByTestId("entrada-narracao").setInputFiles({ name: "voz.wav", mimeType: "audio/wav", buffer: wavDeFala(7, [[0.3, 2.2], [2.9, 4.6], [5.4, 6.8]]) });
  await expect(page.getByTestId("estado-narracao")).toContainText("voz.wav", { timeout: 30_000 });
  await page.getByTestId("img-avancar").click();
  await expect(page.getByTestId("legendas-nota")).toContainText("3 trechos de fala encontrados");
  await page.getByTestId("legendas-atraso").fill("0.3");
  await expect(page.getByTestId("bloco-legendas")).toContainText("+0,3 s");
  // prévia parada no meio da primeira fala: a legenda branca aparece no terço de baixo do quadro vertical
  const claros = async () =>
    page.getByTestId("previa-imagens").evaluate((c: HTMLCanvasElement) => {
      const d = c.getContext("2d")!.getImageData(0, Math.round(c.height * 0.55), c.width, Math.round(c.height * 0.14)).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245) n++;
      return n;
    });
  await page.getByLabel("Instante da prévia").fill("3");
  await page.waitForTimeout(400);
  const comLegenda = await claros();
  await page.getByTestId("legendas-ativas").uncheck();
  await page.waitForTimeout(400);
  const semLegenda = await claros();
  expect(comLegenda).toBeGreaterThan(semLegenda + 60);
  await page.getByTestId("legendas-ativas").check();

  await page.getByTestId("img-avancar").click();
  await page.getByTestId("img-saida").selectOption("mp4-whatsapp");
  const baixa = page.waitForEvent("download", { timeout: 240_000 });
  await page.getByTestId("img-gerar-video").click();
  const video = await baixa;
  const input = new Input({ formats: [MP4], source: new BufferSource(readFileSync(await video.path())) });
  expect(await input.computeDuration()).toBeCloseTo(7 + 1.2 + 1 + 2, 0);
  expect(await input.getPrimaryAudioTrack()).not.toBeNull();

  // recarregar: o texto, o atraso e os trechos de fala voltam do navegador
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByTestId("estado-imagens")).toHaveText(/^3 imagens/, { timeout: 30_000 });
  await page.getByTestId("img-avancar").click();
  await expect(page.getByTestId("legendas-texto")).toHaveValue(/essa \*obra\* que/);
  await expect(page.getByTestId("legendas-nota")).toContainText("3 trechos de fala encontrados");
  await expect(page.getByTestId("bloco-legendas")).toContainText("+0,3 s");
  expect(erros).toEqual([]);
});

test("antes e depois (INC-21): par na lista, marcação junta, roteiro, prévia, MP4 e trabalho guardado", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  await page.goto("/#/imagens");
  const fotos = ["coral_stone_wall", "concrete_wall_008", "clay_roof_tiles_02"].map((n) => ({ name: `${n}.jpg`, mimeType: "image/jpeg", buffer: readFileSync(`public/texturas/${n}_cor.jpg`) }));
  await page.getByTestId("entrada-imagens").setInputFiles(fotos);
  await expect(page.getByTestId("estado-imagens")).toHaveText(/^3 imagens/, { timeout: 60_000 });
  await page.getByTestId("img-avancar").click();
  await page.getByTestId("duracao-img-15").click();
  await page.getByTestId("titulo-img-0").fill("Cozinha");
  await page.getByTestId("titulo-img-2").fill("Suíte");
  // a primeira é o antes; a segunda vira o depois (sem campo de título) e a última não tem o botão
  await page.getByTestId("par-img-0").click();
  await expect(page.getByTestId("par-img-0")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("depois-img-1")).toBeVisible();
  await expect(page.getByTestId("titulo-img-1")).toHaveCount(0);
  await expect(page.getByTestId("par-img-2")).toHaveCount(0);
  await expect(page.getByTestId("resumo-plano")).toContainText("3 de 3 imagens no vídeo · 2 ambientes");
  // desmarcar o depois desmarca o par inteiro; marcar de novo traz os dois
  await page.getByTestId("marcar-img-1").uncheck();
  await expect(page.getByTestId("marcar-img-0")).not.toBeChecked();
  await expect(page.getByTestId("resumo-plano")).toContainText("1 de 3 imagens no vídeo");
  await page.getByTestId("marcar-img-0").check();
  await expect(page.getByTestId("marcar-img-1")).toBeChecked();
  const [roteiro] = await Promise.all([page.waitForEvent("download"), page.getByTestId("baixar-roteiro").click()]);
  const txt = readFileSync(await roteiro.path(), "utf8");
  expect(txt).toContain("Antes e depois: Cozinha → concrete_wall_008.jpg");
  expect(txt).toMatch(/Cozinha \(2 imagens\)/);
  // prévia no meio da cortina: o filete dourado aparece numa coluna do quadro
  const plano = await page.getByTestId("previa-imagens").evaluate((c: HTMLCanvasElement) => [c.width, c.height]);
  expect(plano[1]).toBeGreaterThan(plano[0]);
  await page.getByTestId("img-avancar").click();
  await expect(page.getByTestId("config-img")).toContainText("3 imagens");
  await page.getByTestId("img-saida").selectOption("mp4-whatsapp");
  const baixa = page.waitForEvent("download", { timeout: 240_000 });
  await page.getByTestId("img-gerar-video").click();
  const video = await baixa;
  const input = new Input({ formats: [MP4], source: new BufferSource(readFileSync(await video.path())) });
  expect(await input.computeDuration()).toBeCloseTo(15, 0);

  // recarregar: o par volta do navegador; desfazer devolve o campo de título
  await page.waitForTimeout(800);
  await page.reload();
  await expect(page.getByTestId("estado-imagens")).toHaveText(/^3 imagens/, { timeout: 30_000 });
  await page.getByTestId("img-avancar").click();
  await expect(page.getByTestId("par-img-0")).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("par-img-0").click();
  await expect(page.getByTestId("titulo-img-1")).toBeVisible();
  expect(erros).toEqual([]);
});

/** WAV mono 48 kHz com "falas" (tom de 220 Hz) nos trechos dados e silêncio entre eles. */
function wavDeFala(segundos: number, trechos: [number, number][]): Buffer {
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
  for (let i = 0; i < n; i++) {
    const t = i / taxa;
    const fala = trechos.some(([a, z]) => t >= a && t < z);
    b.writeInt16LE(fala ? Math.round(Math.sin(2 * Math.PI * 220 * t) * 9000) : 0, 44 + i * 2);
  }
  return b;
}


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
