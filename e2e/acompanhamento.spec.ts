// Incremento 4: planejado × real, fotos, planta, relatório PDF e modelos de arquivo (prompts/incremento-4.md).
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";
import { jsPDF } from "jspdf";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

test.describe.configure({ timeout: 300_000 });

type Cena = { ultimosDesvios: { atrasado: number; adiantado: number }; planta: { visible: boolean; material: { map: { image?: { width: number } } | null } } | null };
const cena = (page: Page) => page.evaluate(() => {
  const c = (window as unknown as { __cena: Cena }).__cena;
  return { desvios: c.ultimosDesvios, planta: c.planta ? { visivel: c.planta.visible, largura: c.planta.material.map?.image?.width ?? 0 } : null };
});

async function importarExemplo(page: Page) {
  await page.goto("/");
  await page.getByTestId("abrir-projetos").click();
  await page.getByTestId("entrada-4dstudio").setInputFiles("public/modelos/exemplo.4dstudio");
  await expect(page.getByTestId("situacao")).toContainText("167 elementos", { timeout: 60_000 });
}

test("exemplo: planejado × real, fotos na timeline e relatório PDF", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  await importarExemplo(page);
  await expect(page.getByTestId("selo-demo")).toBeVisible();
  await expect(page.getByTestId("marca-foto")).toHaveCount(4);
  await expect(page.getByTestId("real-ALV-01")).toHaveClass(/atrasada/);

  await page.getByTestId("data-simulacao").fill("2026-04-20");
  await page.getByTestId("visao-comparar").click();
  await expect(page.locator(".legenda3d")).toContainText("Atrasado");
  const c = await cena(page);
  expect(c.desvios.atrasado).toBeGreaterThan(0); // laje e cobertura atrasadas em relação ao planejado
  await expect(page.getByTestId("foto-flutuante")).toContainText("20/04/2026");
  await page.screenshot({ path: "e2e/resultados/9-comparar.png" });

  await page.getByTestId("visao-real").click();
  await page.getByTestId("visao-planejado").click();
  expect((await cena(page)).desvios.atrasado).toBe(0);

  await page.getByTestId("aba-obra").click();
  await expect(page.getByTestId("avanco-planejado")).toHaveText(/^\d+%$/);
  await expect(page.getByTestId("avanco-real")).toHaveText(/^\d+%$/);
  await expect(page.getByTestId("resumo-desvios")).toContainText("6 tarefas atrasadas: Alvenaria (11 d)");
  await page.screenshot({ path: "e2e/resultados/10-obra.png" });

  // marcador de foto abre o visualizador
  await page.getByTestId("marca-foto").first().click();
  await expect(page.getByTestId("modal-foto")).toContainText("02/02/2026");
  await page.getByRole("button", { name: "Próxima →" }).click();
  await expect(page.getByTestId("modal-foto")).toContainText("02/03/2026");
  await page.keyboard.press("Escape");

  // relatório PDF
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("gerar-relatorio").click()]);
  expect(download.suggestedFilename()).toBe("relatorio-casa-de-exemplo-ficticia-2026-04-20.pdf");
  const caminho = `e2e/resultados/${download.suggestedFilename()}`;
  await download.saveAs(caminho);
  const bytes = new Uint8Array(readFileSync(caminho));
  expect(Buffer.from(bytes.subarray(0, 4)).toString()).toBe("%PDF");
  const doc = await pdfjs.getDocument({ data: bytes, standardFontDataUrl: "node_modules/pdfjs-dist/standard_fonts/" }).promise;
  let texto = "";
  for (let p = 1; p <= doc.numPages; p++) texto += (await (await doc.getPage(p)).getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join(" ") + "\n";
  expect(doc.numPages).toBeGreaterThanOrEqual(2);
  for (const t of ["Relatório da obra", "Casa de exemplo (fictícia)", "Data: 20/04/2026", "Avanço", "Etapas concluídas", "Em andamento", "Próximas etapas", "Desvios", "Fotos da obra", "DADOS DE DEMONSTRAÇÃO"]) {
    expect(texto, t).toContain(t);
  }
  expect(erros).toEqual([]);
});

test("enviar fotos com fotos.csv; planta PNG e PDF", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("abrir-demo").click();
  await expect(page.getByTestId("selo-demo")).toBeVisible({ timeout: 60_000 });

  // fotos: as imagens do exemplo, com o fotos-modelo.csv
  const zip = unzipSync(new Uint8Array(readFileSync("public/modelos/exemplo.4dstudio")));
  const meta = JSON.parse(new TextDecoder().decode(zip["attachments.json"])) as { fotos: { arquivo: string; caminho: string }[] };
  const arquivos: { name: string; mimeType: string; buffer: Buffer }[] = meta.fotos.map((f) => ({ name: f.arquivo, mimeType: "image/jpeg", buffer: Buffer.from(zip[f.caminho]) }));
  arquivos.push({ name: "fotos-modelo.csv", mimeType: "text/csv", buffer: readFileSync("public/modelos/fotos-modelo.csv") });
  await page.getByTestId("aba-obra").click();
  await page.getByTestId("entrada-fotos").setInputFiles(arquivos);
  await expect(page.getByTestId("lista-fotos").locator("li")).toHaveCount(4);
  await expect(page.getByTestId("marca-foto")).toHaveCount(4);
  await page.getByTestId("data-simulacao").fill("2026-04-05");
  await expect(page.getByTestId("foto-flutuante")).toContainText("01/04/2026");
  await expect(page.getByTestId("foto-flutuante")).toContainText("Sala de pé-direito duplo");
  await page.getByTestId("mostrar-fotos").uncheck();
  await expect(page.getByTestId("foto-flutuante")).toHaveCount(0);

  // planta PNG
  await page.getByTestId("entrada-planta").setInputFiles("docs/demo-etapas.png");
  await expect(page.getByTestId("ajuste-planta")).toBeVisible();
  await expect.poll(async () => (await cena(page)).planta?.largura ?? 0).toBeGreaterThan(0);
  expect((await cena(page)).planta!.visivel).toBe(true);
  await page.getByTestId("planta-largura").fill("20");

  // planta PDF (primeira página vira imagem pelo pdf.js)
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  pdf.setLineWidth(1);
  pdf.rect(40, 30, 200, 140);
  pdf.line(140, 30, 140, 170);
  pdf.text("PLANTA BAIXA (teste)", 50, 25);
  await page.getByTestId("entrada-planta").setInputFiles({ name: "planta.pdf", mimeType: "application/pdf", buffer: Buffer.from(pdf.output("arraybuffer")) });
  await expect(page.getByTestId("ajuste-planta")).toContainText("planta.pdf");
  await expect.poll(async () => (await cena(page)).planta?.largura ?? 0).toBeGreaterThan(1000);
  await page.getByTestId("data-simulacao").fill("2026-02-20");
  await page.screenshot({ path: "e2e/resultados/11-planta.png" });
});

test("modelos de arquivo: diálogo e downloads idênticos", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("abrir-modelos").click();
  await expect(page.getByTestId("modal-modelos")).toContainText("inicio_real");
  for (const nome of ["cronograma-modelo.xlsx", "cronograma-modelo.csv", "cronograma-modelo.json", "fotos-modelo.csv", "sobrado-exemplo.ifc", "cronograma-sobrado.csv", "casa-exemplo.ifc", "exemplo.4dstudio"]) {
    const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId(`baixar-${nome}`).click()]);
    expect(d.suggestedFilename()).toBe(nome);
    const caminho = `e2e/resultados/modelo-${nome}`;
    await d.saveAs(caminho);
    expect(readFileSync(caminho).equals(readFileSync(`public/modelos/${nome}`)), nome).toBe(true);
  }
  await page.screenshot({ path: "e2e/resultados/12-modelos.png" });
  // o XLSX baixado é aceito pelo app
  await page.keyboard.press("Escape");
  await page.getByTestId("abrir-demo").click();
  await expect(page.getByTestId("selo-demo")).toBeVisible({ timeout: 60_000 });
  await page.locator('input[type=file][accept=".csv,.xlsx,.json,.txt"]').first().setInputFiles("e2e/resultados/modelo-cronograma-modelo.xlsx");
  await expect(page.getByTestId("real-LAJ-01")).toBeAttached();
});
