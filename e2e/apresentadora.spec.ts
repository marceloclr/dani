// ADR-24: apresentadora em primeiro plano (recorte por fundo verde e por IA) e o áudio da fala no vídeo.
import { execFileSync, spawnSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 300_000 });

const FIXTURE = "e2e/fixtures/apresentadora-verde.mp4"; // 8 s, 540 × 960, figura sobre verde, tom de 440 Hz

async function abrirComFala(page: Page) {
  await page.goto("/");
  await page.getByTestId("abrir-demo").click();
  await expect(page.getByTestId("selo-demo")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("aparencia-tecnica").click(); // sem GPU, o realista é lento; a camada da apresentadora é a mesma
  await page.getByTestId("aba-video").click();
  await page.getByTestId("video-formato").selectOption("horizontal");
  await page.getByTestId("entrada-apresentadora").setInputFiles(FIXTURE);
  await expect(page.getByTestId("secao-apresentadora")).toContainText("540 × 960");
}

/** Cores da prévia: pixels verdes (fundo que devia sumir) e da roupa azul da figura. */
async function coresDaPrevia(page: Page) {
  const img = page.getByTestId("previa-apresentadora");
  await expect(img).toBeVisible({ timeout: 60_000 });
  await expect(img).not.toHaveClass(/carregando/, { timeout: 60_000 });
  return img.evaluate(async (el: HTMLImageElement) => {
    await el.decode();
    const c = document.createElement("canvas");
    c.width = el.naturalWidth;
    c.height = el.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(el, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let verde = 0, roupa = 0;
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
      if (g > 140 && r < 90 && b < 110) verde++;
      if (b > 80 && b < 130 && r < 70 && g < 80) roupa++;
    }
    return { verde, roupa, total: d.length / 4 };
  });
}

function trilhas(caminho: string): { tipos: string[]; duracao: number } {
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name:format=duration", "-of", "json", caminho]).toString());
  return { tipos: j.streams.map((s: { codec_type: string; codec_name: string }) => `${s.codec_type}:${s.codec_name}`), duracao: Number(j.format.duration) };
}

/** Volume médio do áudio (dB): a fala de teste é um tom contínuo, então não pode ser silêncio. */
function volume(caminho: string): number {
  const saida = spawnSync("ffmpeg", ["-hide_banner", "-i", caminho, "-af", "volumedetect", "-vn", "-f", "null", "-"]).stderr.toString(); // o ffmpeg informa no stderr
  return Number(/mean_volume: (-?[\d.]+) dB/.exec(saida)?.[1] ?? -99);
}

test("fundo verde: recorte na prévia, MP4 para WhatsApp com a voz e duração da fala", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  await abrirComFala(page);
  await page.getByTestId("apresentadora-recorte").selectOption("verde");
  const cores = await coresDaPrevia(page);
  expect(cores.verde).toBeLessThan(cores.total * 0.002); // o verde sumiu
  expect(cores.roupa).toBeGreaterThan(cores.total * 0.01); // a figura ficou
  await page.locator(".painel-video").screenshot({ path: "e2e/resultados/30-apresentadora-painel.png" });

  // a duração acompanha a fala (8 s) e o seletor de duração fica travado
  await expect(page.getByTestId("video-duracao")).toBeDisabled();
  await page.getByTestId("video-saida").selectOption("mp4-whatsapp");
  await page.getByTestId("gerar-video").click();
  await expect(page.getByTestId("resultado-video").locator("video")).toBeVisible({ timeout: 240_000 });
  await expect(page.getByTestId("resultado-video").locator("video")).toHaveAttribute("data-com-audio", "sim");
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("baixar-video").click()]);
  const caminho = `e2e/resultados/${d.suggestedFilename()}`;
  await d.saveAs(caminho);
  const t = trilhas(caminho);
  expect(t.tipos).toContain("video:h264");
  expect(t.tipos).toContain("audio:aac");
  expect(t.duracao).toBeGreaterThan(7.5);
  expect(t.duracao).toBeLessThan(8.6);
  expect(volume(caminho)).toBeGreaterThan(-40);
  // quadro do meio: a figura aparece por cima da cena, sem o verde
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", "4", "-i", caminho, "-frames:v", "1", "e2e/resultados/31-apresentadora-quadro.png"]);
  expect(erros).toEqual([]);
});

test("recorte por IA: o MediaPipe carrega do próprio app e o GIF sai sem som", async ({ page }) => {
  const erros: string[] = [];
  const cdn: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (/^https?:$/.test(u.protocol) && u.hostname !== "localhost") cdn.push(r.url());
  });
  await abrirComFala(page);
  await expect(page.getByTestId("apresentadora-recorte")).toHaveValue("ia");
  await coresDaPrevia(page); // a prévia (com a segmentação) termina sem erro
  await page.getByTestId("apresentadora-posicao").selectOption("esquerda");
  await page.getByTestId("video-saida").selectOption("gif");
  await page.getByTestId("gerar-video").click();
  await expect(page.getByTestId("resultado-video").locator("img")).toBeVisible({ timeout: 240_000 });
  expect(cdn).toEqual([]); // nada de CDN (§43)
  await page.getByTestId("remover-apresentadora").click();
  await expect(page.getByTestId("entrada-apresentadora")).toBeAttached();
  await expect(page.getByTestId("video-duracao")).toBeEnabled();
  expect(erros).toEqual([]);
});

test("WebM pelo codificador do navegador leva a voz em Opus", async ({ page }) => {
  await abrirComFala(page);
  await page.getByTestId("apresentadora-recorte").selectOption("verde");
  const saidas = await page.getByTestId("video-saida").locator("option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  const webm = saidas.find((s) => s === "webm-vp9" || s === "webm-vp8");
  test.skip(!webm, "navegador sem codificador WebM");
  await page.getByTestId("video-saida").selectOption(webm!);
  await page.getByTestId("gerar-video").click();
  await expect(page.getByTestId("resultado-video").locator("video")).toHaveAttribute("data-com-audio", "sim", { timeout: 240_000 });
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("baixar-video").click()]);
  const caminho = `e2e/resultados/apresentadora-${d.suggestedFilename()}`;
  await d.saveAs(caminho);
  const t = trilhas(caminho);
  expect(t.tipos).toContain("audio:opus");
  expect(volume(caminho)).toBeGreaterThan(-40);
});
