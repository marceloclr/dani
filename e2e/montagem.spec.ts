// ADR-25: montagem em cenas (Reels): abertura com a fala em tela cheia, revelação do projeto atrás
// dela, passeio, volta e marca, com a voz contínua por baixo dos cortes.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 300_000 });

const FIXTURE = "e2e/fixtures/apresentadora-verde.mp4"; // 8 s, figura sobre verde, tom de 440 Hz

/** Quadro do segundo t como PNG (busca depois da entrada: o openh264 local decodifica desde o início). */
function quadro(video: string, t: number, saida: string): { verde: number; escuro: number; total: number } {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", video, "-ss", String(t), "-frames:v", "1", "-vf", "scale=160:90", "-f", "rawvideo", "-pix_fmt", "rgb24", saida]);
  const d = readFileSync(saida);
  let verde = 0, escuro = 0;
  for (let i = 0; i < d.length; i += 3) {
    const [r, g, b] = [d[i], d[i + 1], d[i + 2]];
    if (g > 130 && r < 90 && b < 110) verde++;
    if (r < 70 && g < 70 && b < 70 && Math.abs(r - g) < 12 && Math.abs(g - b) < 12) escuro++;
  }
  return { verde, escuro, total: d.length / 3 };
}

test("Reels: fala em tela cheia, revelação, passeio e marca, com a voz", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  await page.goto("/");
  await page.getByTestId("abrir-demo").click();
  await expect(page.getByTestId("selo-demo")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("aparencia-tecnica").click();
  await page.getByTestId("aba-video").click();
  await page.getByTestId("video-formato").selectOption("horizontal");
  await page.getByTestId("entrada-apresentadora").setInputFiles(FIXTURE);
  await expect(page.getByTestId("secao-apresentadora")).toContainText("540 × 960");
  await page.getByTestId("apresentadora-recorte").selectOption("verde");
  await page.getByTestId("camera-montagem").click();

  // roteiro Reels: 5 cenas na faixa; o aviso do fundo verde aparece
  const faixa = page.getByTestId("faixa-cenas");
  await expect(faixa.locator(".bloco-cena")).toHaveCount(5);
  await expect(faixa).toContainText("Fala no terreno");
  await expect(faixa).toContainText("Revelação");
  await expect(page.getByTestId("aviso-montagem-verde")).toBeVisible();
  await page.locator(".painel-video").screenshot({ path: "e2e/resultados/40-montagem-editor.png" });

  // edição: excluir a "volta" e restaurar o roteiro
  await page.getByTestId("excluir-cena-3").click();
  await expect(faixa.locator(".bloco-cena")).toHaveCount(4);
  await page.getByTestId("roteiro-reels").click();
  await expect(faixa.locator(".bloco-cena")).toHaveCount(5);

  await page.getByTestId("video-saida").selectOption("mp4-whatsapp");
  await page.getByTestId("gerar-video").click();
  await expect(page.getByTestId("resultado-video").locator("video")).toHaveAttribute("data-com-audio", "sim", { timeout: 240_000 });
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("baixar-video").click()]);
  const caminho = `e2e/resultados/montagem-${d.suggestedFilename()}`;
  await d.saveAs(caminho);

  // 8 s: abertura 0–1,2 s; revelação 1,2–3,2 s; passeio 3,2–6,4 s; volta 6,4–7,36 s; marca 7,36–8 s
  const abertura = quadro(caminho, 0.5, "e2e/resultados/montagem-0.rgb");
  expect(abertura.verde).toBeGreaterThan(abertura.total * 0.3); // o quadro original inteiro (pano verde)
  const revelada = quadro(caminho, 3.1, "e2e/resultados/montagem-1.rgb");
  expect(revelada.verde).toBeLessThan(revelada.total * 0.03); // o fundo real deu lugar à obra
  const passeio = quadro(caminho, 5, "e2e/resultados/montagem-2.rgb");
  expect(passeio.verde).toBeLessThan(passeio.total * 0.01); // pessoa oculta no passeio (só o gramado pode ser verde)
  const marca = quadro(caminho, 7.8, "e2e/resultados/montagem-3.rgb");
  expect(marca.escuro).toBeGreaterThan(marca.total * 0.6); // ardósia grafite da marca
  for (const [t, n] of [[0.5, "41"], [2.2, "42"], [3.1, "43"], [5, "44"], [7.8, "45"]] as const)
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", caminho, "-ss", String(t), "-frames:v", "1", `e2e/resultados/${n}-montagem-${t}s.png`]);

  // a voz segue inteira por baixo dos cortes
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name:format=duration", "-of", "json", caminho]).toString());
  expect(j.streams.map((s: { codec_type: string; codec_name: string }) => `${s.codec_type}:${s.codec_name}`)).toContain("audio:aac");
  expect(Number(j.format.duration)).toBeGreaterThan(7.5);
  const vol = spawnSync("ffmpeg", ["-hide_banner", "-i", caminho, "-af", "volumedetect", "-vn", "-f", "null", "-"]).stderr.toString();
  expect(Number(/mean_volume: (-?[\d.]+) dB/.exec(vol)?.[1] ?? -99)).toBeGreaterThan(-40);
  expect(erros).toEqual([]);
});

test("GIF da montagem: cada quadro sai na cena certa (desenho assíncrono aguardado)", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("abrir-demo").click();
  await expect(page.getByTestId("selo-demo")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("aparencia-tecnica").click();
  await page.getByTestId("aba-video").click();
  await page.getByTestId("video-formato").selectOption("vertical");
  await page.getByTestId("entrada-apresentadora").setInputFiles(FIXTURE);
  await expect(page.getByTestId("secao-apresentadora")).toContainText("540 × 960");
  await page.getByTestId("apresentadora-recorte").selectOption("verde");
  await page.getByTestId("camera-montagem").click();
  await page.getByTestId("video-saida").selectOption("gif");
  await page.getByTestId("gerar-video").click();
  await expect(page.getByTestId("resultado-video").locator("img")).toBeVisible({ timeout: 240_000 });
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("baixar-video").click()]);
  const caminho = "e2e/resultados/montagem.gif";
  await d.saveAs(caminho);
  const abertura = quadro(caminho, 0.5, "e2e/resultados/montagem-g0.rgb");
  expect(abertura.verde).toBeGreaterThan(abertura.total * 0.3);
  const passeio = quadro(caminho, 5, "e2e/resultados/montagem-g1.rgb");
  expect(passeio.verde).toBeLessThan(passeio.total * 0.01);
  const marca = quadro(caminho, 7.8, "e2e/resultados/montagem-g2.rgb");
  expect(marca.escuro).toBeGreaterThan(marca.total * 0.6);
});
