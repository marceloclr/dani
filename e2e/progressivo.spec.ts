// Incremento 5: revelação progressiva e vídeo para compartilhar (prompts/incremento-5.md).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 300_000 });

async function abrirDemo(page: Page) {
  await page.goto("/");
  await page.getByTestId("abrir-demo").click();
  await expect(page.getByTestId("selo-demo")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("aparencia-tecnica").click(); // vídeo realista sem GPU leva ~0,7 s por quadro; ele é coberto pelo GIF de realista.spec.ts
}

type Malha = { visible: boolean; scale: { x: number; y: number; z: number } };
/** Paredes: prontas, subindo e ainda não iniciadas. */
const paredes = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __cena: { malhas: Map<string, Malha> }; __projeto: { getState(): { elementos: { guid: string; ifcType: string }[] } } };
    const tipos = new Map(w.__projeto.getState().elementos.map((e) => [e.guid, e.ifcType]));
    const r = { prontas: 0, subindo: 0, ausentes: 0 };
    for (const [g, m] of w.__cena.malhas) {
      if (tipos.get(g) !== "IfcWall") continue;
      if (!m.visible) r.ausentes++;
      else if (m.scale.y < 0.999) r.subindo++;
      else r.prontas++;
    }
    return r;
  });

test("modo Progressivo: a alvenaria é revelada aos poucos", async ({ page }) => {
  await abrirDemo(page);
  await expect(page.getByTestId("modo-animacao")).toHaveValue("progressivo");
  await page.getByTestId("data-simulacao").fill("2026-03-02"); // 2º dia da alvenaria
  const inicio = await paredes(page);
  await page.getByTestId("data-simulacao").fill("2026-03-15"); // meio
  const meio = await paredes(page);
  await page.screenshot({ path: "e2e/resultados/13-progressivo-meio.png" });
  await page.getByTestId("data-simulacao").fill("2026-03-30"); // último dia
  const fim = await paredes(page);
  expect(inicio.prontas).toBeLessThan(meio.prontas);
  expect(meio.prontas).toBeGreaterThan(0);
  expect(meio.subindo + meio.ausentes).toBeGreaterThan(0);
  expect(meio.ausentes).toBeGreaterThan(0);
  expect(fim).toEqual({ prontas: 16, subindo: 0, ausentes: 0 });
  // lajes avançam no eixo horizontal
  await page.getByTestId("data-simulacao").fill("2026-04-06");
  const laje = await page.evaluate(() => {
    const w = window as unknown as { __cena: { malhas: Map<string, Malha> } };
    return [...w.__cena.malhas.values()].some((m) => m.visible && (m.scale.x < 0.999 || m.scale.z < 0.999));
  });
  expect(laje).toBe(true);
});

function sonda(caminho: string) {
  const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries", "stream=codec_name,profile,pix_fmt,width,height,nb_read_frames:format=duration", "-of", "json", caminho]).toString());
  return { ...j.streams[0], duracao: Number(j.format.duration) };
}

test("MP4 para WhatsApp: H.264 Baseline, yuv420p, 720 × 1280, índice no início", async ({ page }) => {
  await abrirDemo(page);
  await page.getByTestId("aba-video").click();
  await page.getByTestId("video-formato").selectOption("vertical");
  await page.getByTestId("video-fps").selectOption("24");
  await page.getByTestId("video-duracao").selectOption("15");
  await expect(page.getByTestId("video-saida")).toHaveValue("mp4-whatsapp");
  await expect(page.getByTestId("descricao-saida")).toContainText("720 × 1280 · 24 fps · 360 quadros");
  await page.getByTestId("gerar-video").click();
  await expect(page.getByTestId("resultado-video")).toBeVisible({ timeout: 240_000 });
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("baixar-video").click()]);
  expect(d.suggestedFilename()).toBe("obra-4d-vertical-15s-whatsapp.mp4");
  const caminho = "e2e/resultados/whatsapp.mp4";
  await d.saveAs(caminho);
  const s = sonda(caminho);
  expect(s.codec_name).toBe("h264");
  expect(["Baseline", "Constrained Baseline"]).toContain(s.profile);
  expect(s.pix_fmt).toBe("yuv420p");
  expect([s.width, s.height]).toEqual([720, 1280]);
  expect(Number(s.nb_read_frames)).toBe(360);
  expect(s.duracao).toBeCloseTo(15, 1);
  const bytes = readFileSync(caminho);
  expect(bytes.indexOf("moov")).toBeLessThan(bytes.indexOf("mdat")); // fast start
});

test("GIF animado: 480 px, 10 fps", async ({ page }) => {
  await abrirDemo(page);
  await page.getByTestId("aba-video").click();
  await page.getByTestId("video-formato").selectOption("horizontal");
  await page.getByTestId("video-duracao").selectOption("15");
  await page.getByTestId("video-saida").selectOption("gif");
  await expect(page.getByTestId("descricao-saida")).toContainText("480 × 270 · 10 fps · 150 quadros");
  await page.getByTestId("gerar-video").click();
  await expect(page.getByTestId("resultado-video").locator("img")).toBeVisible({ timeout: 240_000 });
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("baixar-video").click()]);
  const caminho = "e2e/resultados/animacao.gif";
  await d.saveAs(caminho);
  expect(readFileSync(caminho).subarray(0, 6).toString()).toBe("GIF89a");
  const s = sonda(caminho);
  expect([s.width, s.height]).toEqual([480, 270]);
  expect(Number(s.nb_read_frames)).toBe(150);
});
