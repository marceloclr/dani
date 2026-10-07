// Incremento 2: modos de animação, câmeras e vídeo (prompts/incremento-2.md).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { unzipSync } from "fflate";

test.describe.configure({ timeout: 300_000 });

async function abrirDemo(page: Page) {
  await page.goto("/");
  await page.getByTestId("abrir-demo").click();
  await expect(page.getByTestId("selo-demo")).toBeVisible({ timeout: 60_000 });
}

async function configurarVideo(page: Page, formato: string, fps: string, duracao: string) {
  await page.getByTestId("aba-video").click();
  await page.getByTestId("video-formato").selectOption(formato);
  await page.getByTestId("video-fps").selectOption(fps);
  await page.getByTestId("video-duracao").selectOption(duracao);
  await expect(page.getByTestId("video-saida")).toBeEnabled();
}

/** Baixa o arquivo pronto e devolve o caminho local. */
async function baixar(page: Page): Promise<string> {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("baixar-video").click()]);
  const caminho = `e2e/resultados/${download.suggestedFilename()}`;
  await download.saveAs(caminho);
  return caminho;
}

function sonda(caminho: string): { duracao: number; largura: number; altura: number; codec: string } {
  const saida = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height:format=duration", "-of", "json", caminho]).toString();
  const j = JSON.parse(saida);
  return { duracao: Number(j.format.duration), largura: j.streams[0].width, altura: j.streams[0].height, codec: j.streams[0].codec_name };
}

test("§67 de ponta a ponta: demonstração → PLAY → vídeo real", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  await abrirDemo(page);

  // PLAY: a obra avança sozinha
  await page.getByTestId("play").click();
  await page.waitForTimeout(800);
  await page.getByTestId("play").click();
  expect(await page.evaluate(() => (window as unknown as { __projeto: { getState(): { dia: number } } }).__projeto.getState().dia)).toBeGreaterThan(1);

  // modo Crescimento: no meio da alvenaria há paredes ainda subindo
  await page.getByTestId("modo-animacao").selectOption("crescimento");
  await page.getByTestId("data-simulacao").fill("2026-03-15");
  const subindo = await page.evaluate(() => {
    const c = (window as unknown as { __cena: { malhas: Map<string, { scale: { y: number }; visible: boolean }> } }).__cena;
    return [...c.malhas.values()].filter((m) => m.visible && m.scale.y > 0.01 && m.scale.y < 0.99).length;
  });
  expect(subindo).toBeGreaterThan(0);
  await page.screenshot({ path: "e2e/resultados/5-crescimento.png" });

  // presets de câmera, inclusive Órbita como alternância
  const orbita = page.getByRole("button", { name: "Órbita" });
  await orbita.click();
  await expect(orbita).toHaveAttribute("aria-pressed", "true");
  await orbita.click();
  await expect(orbita).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Externa" }).click();

  // vídeo quadrado, 24 fps, 15 s
  await configurarVideo(page, "quadrado", "24", "15");
  await expect(page.getByTestId("relacao-tempo")).toHaveText("180 dias → 15 s: 12 dias por segundo");
  const saidas = await page.getByTestId("video-saida").locator("option").allTextContents();
  if (!saidas.includes("MP4 (H.264)")) {
    await expect(page.getByTestId("aviso-mp4")).toHaveText("Seu navegador não oferece suporte à codificação MP4 neste modo. O sistema produzirá WebM ou imagens sequenciais.");
  }
  const webm = saidas.find((s) => s.startsWith("WebM (VP"));
  expect(webm, `saídas oferecidas: ${saidas.join(", ")}`).toBeTruthy();
  await page.getByTestId("video-saida").selectOption({ label: webm! });

  await page.getByTestId("gerar-video").click();
  await expect(page.getByTestId("progresso-video")).toContainText(/Quadro \d+ \/ 360/);
  await expect(page.getByTestId("resultado-video")).toBeVisible({ timeout: 240_000 });
  await expect(page.getByTestId("resultado-video").locator("video")).toBeVisible();
  await page.screenshot({ path: "e2e/resultados/6-video-pronto.png" });

  const caminho = await baixar(page);
  const bytes = readFileSync(caminho);
  expect(bytes.subarray(0, 4).toString("hex")).toBe("1a45dfa3"); // assinatura EBML (WebM)
  const info = sonda(caminho);
  expect(info.largura).toBe(1080);
  expect(info.altura).toBe(1080);
  expect(info.duracao).toBeGreaterThan(14.5);
  expect(info.duracao).toBeLessThan(15.5);
  expect(["vp9", "vp8"]).toContain(info.codec);

  // a viewport volta a mostrar a simulação depois da geração
  await expect(page.getByTestId("gerar-video")).toBeEnabled();
  expect(erros).toEqual([]);
});

test("cancelar interrompe sem gerar arquivo", async ({ page }) => {
  await abrirDemo(page);
  await configurarVideo(page, "horizontal", "30", "60");
  await page.getByTestId("gerar-video").click();
  await expect(page.getByTestId("progresso-video")).toContainText(/Quadro ([5-9]|\d\d+) \/ 1800/, { timeout: 60_000 });
  await page.getByTestId("cancelar-video").click();
  await expect(page.getByTestId("aviso-video")).toHaveText("Geração cancelada. Nenhum arquivo foi criado.");
  await expect(page.getByTestId("resultado-video")).toHaveCount(0);
  await expect(page.getByTestId("gerar-video")).toBeEnabled();
});

test.describe("navegador sem WebCodecs", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // simula um navegador sem WebCodecs
      delete (window as unknown as Record<string, unknown>).VideoEncoder;
      delete (window as unknown as Record<string, unknown>).VideoFrame;
    });
  });

  test("oferece os fallbacks, avisa e grava WebM em tempo real", async ({ page }) => {
    await abrirDemo(page);
    await configurarVideo(page, "vertical", "24", "15");
    await expect(page.getByTestId("aviso-mp4")).toBeVisible();
    const saidas = await page.getByTestId("video-saida").locator("option").allTextContents();
    expect(saidas).toEqual(["WebM em tempo real (MediaRecorder)", "Quadros PNG em ZIP"]);
    await page.getByTestId("gerar-video").click();
    await expect(page.getByTestId("resultado-video")).toBeVisible({ timeout: 120_000 });
    const caminho = await baixar(page);
    expect(readFileSync(caminho).subarray(0, 4).toString("hex")).toBe("1a45dfa3");
    const info = sonda(caminho);
    expect(info.largura).toBe(1080);
    expect(info.altura).toBe(1920);
  });

  test("quadros PNG em ZIP", async ({ page }) => {
    await abrirDemo(page);
    await configurarVideo(page, "quadrado", "24", "15");
    await page.getByTestId("video-saida").selectOption({ label: "Quadros PNG em ZIP" });
    await page.getByTestId("gerar-video").click();
    await expect(page.getByTestId("resultado-video")).toBeVisible({ timeout: 240_000 });
    const caminho = await baixar(page);
    const arquivos = unzipSync(new Uint8Array(readFileSync(caminho)));
    const pngs = Object.keys(arquivos).filter((n) => n.endsWith(".png"));
    expect(pngs).toHaveLength(360);
    expect(Buffer.from(arquivos[pngs[0]].subarray(1, 4)).toString()).toBe("PNG");
    expect(new TextDecoder().decode(arquivos["LEIAME.txt"])).toContain("ffmpeg -framerate 24");
  });
});
