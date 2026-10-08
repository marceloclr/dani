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
  await page.getByTestId("assistente-gerar").click();
  await expect(page.getByTestId("assistente-resultado")).toBeVisible({ timeout: 240_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("assistente-baixar-video").click()]);
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
