// INC-15 (ADR-30): o assistente — carregar por tipo de arquivo, conferir e gerar o MP4 com as falas em sequência.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import * as XLSX from "xlsx";

test.describe.configure({ timeout: 300_000 });

const FALA = readFileSync("e2e/fixtures/apresentadora-verde.mp4"); // 8 s, 540 × 960, tom de 440 Hz

/** A planilha modelo com duas falas curtas, aparência Técnica (rápida sem GPU) e 24 fps. */
function planilhaComFalas(): Buffer {
  const wb = XLSX.read(readFileSync("public/modelos/obra-dani.xlsx"), { type: "buffer" });
  XLSX.utils.sheet_add_aoa(wb.Sheets["Falas"], [
    [1, "abertura.mp4", "Apresentação", "terreno", "fundo verde", 0, 2],
    [2, "etapas.mp4", "Etapas da obra", "sobre a obra", "fundo verde", 1, 3],
  ], { origin: "A2" });
  const video = wb.Sheets["Vídeo"];
  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(video, { defval: "" });
  const trocar = (campo: string, valor: string) => {
    const i = linhas.findIndex((l) => l.campo === campo);
    video[XLSX.utils.encode_cell({ r: i + 1, c: 1 })] = { t: "s", v: valor };
  };
  trocar("Aparência", "Técnica");
  trocar("Quadros por segundo", "24");
  trocar("Formato", "horizontal 16:9");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("assistente: planilha, IFC e duas falas → conferir → MP4 com a voz das duas", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("assistente")).toBeVisible();
  await expect(page.getByTestId("passo-2")).toBeDisabled();
  await expect(page.getByTestId("cartao-planilha")).toHaveAttribute("data-situacao", "falta");

  await page.getByTestId("entrada-planilha").setInputFiles({ name: "obra-dani.xlsx", mimeType: "application/octet-stream", buffer: planilhaComFalas() });
  await expect(page.getByTestId("estado-planilha")).toContainText("18 etapas");
  await expect(page.getByTestId("estado-ifc")).toHaveText("falta sobrado-exemplo.ifc");
  await expect(page.getByTestId("estado-falas")).toHaveText("0 de 2");

  // os arquivos podem vir em qualquer ordem: as falas antes do IFC continuam depois dele
  await page.getByTestId("entrada-falas").setInputFiles([
    { name: "abertura.mp4", mimeType: "video/mp4", buffer: FALA },
    { name: "etapas.mp4", mimeType: "video/mp4", buffer: FALA },
  ]);
  await expect(page.getByTestId("estado-falas")).toHaveText(/^2 de 2 · 4 s$/, { timeout: 30_000 });
  await page.getByTestId("entrada-ifc").setInputFiles("public/modelos/sobrado-exemplo.ifc");
  await expect(page.getByTestId("estado-ifc")).toHaveText("sobrado-exemplo.ifc · 157 elementos", { timeout: 90_000 });
  await expect(page.getByTestId("estado-falas")).toHaveText(/^2 de 2/);

  // conferir: ficha, faixa de cenas pelas falas e a prévia no formato do vídeo
  await page.getByTestId("avancar").click();
  await expect(page.getByTestId("ficha-conferir")).toContainText("02/03/2026 a 26/11/2026");
  await expect(page.getByTestId("ficha-conferir")).toContainText("2 · 6,5 s de vídeo");
  const cenas = page.getByTestId("faixa-cenas-assistente").locator("button");
  await expect(cenas.first()).toHaveText("Fala no terreno");
  await expect(cenas.last()).toHaveText("Marca");
  const caixa = await page.getByTestId("moldura-previa").boundingBox();
  expect(caixa!.width / caixa!.height).toBeCloseTo(16 / 9, 1);
  await page.getByTestId("formato-vertical").click();
  await expect.poll(async () => { const b = (await page.getByTestId("moldura-previa").boundingBox())!; return b.width / b.height; }).toBeCloseTo(9 / 16, 1);
  await page.getByTestId("formato-horizontal").click();

  // gerar: MP4 para WhatsApp com a voz (as duas falas = 4 s de tom) e o nome da obra
  await page.getByTestId("avancar").click();
  await page.getByTestId("assistente-saida").selectOption("mp4-whatsapp");
  // ao terminar, o vídeo é salvo sozinho; durante a geração, não dá para sair do passo
  const automatico = page.waitForEvent("download", { timeout: 240_000 });
  await page.getByTestId("assistente-gerar").click();
  await expect(page.getByTestId("passo-2")).toBeDisabled();
  await expect(page.getByTestId("ir-gestao")).toHaveAttribute("aria-disabled", "true");
  const download = await automatico;
  await expect(page.getByTestId("assistente-salvo")).toContainText(download.suggestedFilename());
  await expect(page.getByTestId("passo-2")).toBeEnabled();
  expect(download.suggestedFilename()).toMatch(/^sobrado-de-exemplo-\d{8}(-whatsapp)?\.mp4$/);
  const caminho = await download.path();
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type:format=duration", "-of", "json", caminho]).toString());
  expect(j.streams.map((s: { codec_type: string }) => s.codec_type).sort()).toEqual(["audio", "video"]);
  expect(Number(j.format.duration)).toBeCloseTo(6.5, 0);
  // voz nos 4 primeiros segundos (as duas falas) e silêncio na marca
  const vol = (ini: number, dur: number) => Number(/mean_volume: (-?[\d.]+) dB/.exec(spawnSync("ffmpeg", ["-hide_banner", "-ss", String(ini), "-t", String(dur), "-i", caminho, "-af", "volumedetect", "-vn", "-f", "null", "-"]).stderr.toString())?.[1] ?? -99);
  expect(vol(0.2, 3.5)).toBeGreaterThan(-30);
  expect(vol(4.6, 1.5)).toBeLessThan(-60);
});

test("Gestão e ajustes guarda o estúdio completo e volta ao assistente", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("ir-gestao").click();
  await expect(page.getByTestId("abrir-demo")).toBeVisible();
  await page.getByTestId("abrir-demo").click();
  await expect(page.getByTestId("selo-demo")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("aba-tarefas")).toBeVisible();
  await page.getByTestId("ir-assistente").click();
  await expect(page.getByTestId("assistente")).toBeVisible();
});

test("cada arquivo é conferido no envio: vídeo com a aba Falas vazia entra na hora; arquivo inválido é apontado no cartão", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("entrada-planilha").setInputFiles("public/modelos/obra-dani.xlsx"); // aba Falas vazia
  await expect(page.getByTestId("estado-falas")).toHaveText("nenhum vídeo");
  await page.getByTestId("entrada-falas").setInputFiles({ name: "minha-fala.mp4", mimeType: "video/mp4", buffer: FALA });
  await expect(page.getByTestId("estado-falas")).toHaveText("1 vídeo · 8 s", { timeout: 30_000 });
  await expect(page.getByTestId("lista-falas")).toContainText("minha-fala.mp4");
  await expect(page.getByTestId("cartao-falas")).toContainText("ordem de envio");
  await page.getByTestId("entrada-falas").setInputFiles({ name: "quebrado.mp4", mimeType: "video/mp4", buffer: Buffer.from("isto não é um vídeo") });
  await expect(page.getByTestId("avisos-falas")).toContainText('"quebrado.mp4" não abriu');
  await expect(page.getByTestId("estado-falas")).toHaveText("1 vídeo · 8 s");
});

test("sem o IFC citado: a tela diz o que falta e segue com a casa da aba Modelo", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("entrada-planilha").setInputFiles("public/modelos/obra-dani.xlsx");
  await page.getByTestId("entrada-falas").setInputFiles({ name: "minha-fala.mp4", mimeType: "video/mp4", buffer: FALA });
  await expect(page.getByTestId("estado-falas")).toHaveText("1 vídeo · 8 s", { timeout: 30_000 });
  await expect(page.getByTestId("avancar")).toBeDisabled();
  await expect(page.getByTestId("pendencia")).toHaveText("Falta o IFC sobrado-exemplo.ifc (ou use a casa da aba Modelo).");
  await expect(page.getByTestId("baixar-ifc-exemplo")).toHaveAttribute("href", "modelos/sobrado-exemplo.ifc");
  await page.getByTestId("usar-casa-modelo").click();
  await expect(page.getByTestId("estado-ifc")).toHaveText(/^casa da aba Modelo · \d+ elementos$/, { timeout: 30_000 });
  await expect(page.getByTestId("pendencia")).toHaveCount(0);
  await expect(page.getByTestId("estado-falas")).toHaveText("1 vídeo · 8 s"); // a fala enviada antes continua
  await page.getByTestId("avancar").click();
  await expect(page.getByTestId("passo-conferir")).toBeVisible();
  await expect(page.getByTestId("ficha-conferir")).toContainText("1 · 10,5 s de vídeo");
});
