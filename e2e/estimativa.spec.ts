// Incremento 6: cronograma estimado, tarefas por pavimento e WhatsApp no computador (prompts/incremento-6.md).
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 300_000 });

type Estado = { getState(): { cronograma: { inicio: number; tarefas: { id: string; ini: number; fim: number; pavimento?: string }[]; estimado?: boolean } | null; elementos: { guid: string; ifcType: string; pavimento: string | null; nome: string }[]; arquivoCronograma: string | null } };

const paredesVisiveis = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __projeto: Estado; __cena: { visiveis(): string[] } };
    const vis = new Set(w.__cena.visiveis());
    const r: Record<string, number> = {};
    for (const e of w.__projeto.getState().elementos) {
      if (e.ifcType !== "IfcWall" || !e.nome.startsWith("Parede") || !vis.has(e.guid)) continue;
      r[e.pavimento ?? "?"] = (r[e.pavimento ?? "?"] ?? 0) + 1;
    }
    return r;
  });

test("sobrado paramétrico: estimativa por pavimento", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("abrir-parametrico").click();
  await page.getByTestId("param-area").fill("200");
  await page.getByTestId("param-pavimentos").selectOption("2");
  await page.getByTestId("param-gerar").click();
  await expect(page.getByTestId("selo-parametrico")).toBeVisible();

  await page.getByTestId("estimar-cronograma").click();
  await expect(page.getByTestId("est-area")).toHaveValue("200");
  await expect(page.getByTestId("est-pavimentos")).toHaveValue("2");
  const sugerido = Math.round((60 + 0.9 * 200) * 1.15);
  await expect(page.getByTestId("est-sugestao")).toContainText(`Prazo sugerido: ${sugerido} dias`);
  await expect(page.getByTestId("est-prazo")).toHaveValue(String(sugerido));
  await page.getByTestId("est-inicio").fill("2026-02-02");
  await expect(page.getByTestId("est-previa")).toContainText("Alvenaria, térreo");
  await expect(page.getByTestId("est-previa")).toContainText("Alvenaria, pavimento superior");
  await page.screenshot({ path: "e2e/resultados/14-estimativa.png" });
  await page.getByTestId("est-gerar").click();
  await expect(page.getByTestId("modal-estimativa")).not.toBeVisible();
  await expect(page.getByTestId("selo-estimativa")).toBeVisible();
  await expect(page.locator(".gantt .linha")).toHaveCount(18); // 12 etapas + 3 por pavimento

  // no meio da alvenaria do térreo, nenhuma parede de cima
  const meio = await page.evaluate(() => {
    const c = (window as unknown as { __projeto: Estado }).__projeto.getState().cronograma!;
    const t = c.tarefas.find((x) => x.id === "ALV-1")!;
    const d = new Date((c.inicio + Math.floor((t.ini + t.fim) / 2)) * 86_400_000);
    return d.toISOString().slice(0, 10);
  });
  await page.getByTestId("modo-animacao").selectOption("aparecimento");
  await page.getByTestId("data-simulacao").fill(meio);
  const p = await paredesVisiveis(page);
  expect(p["Térreo"]).toBeGreaterThan(0);
  expect(p["Pavimento superior"] ?? 0).toBe(0);
  await page.getByRole("button", { name: "Isométrica" }).click();
  await page.screenshot({ path: "e2e/resultados/15-sobrado-alvenaria-terreo.png" });
});

test("substituir um cronograma existente pede confirmação", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("abrir-demo").click();
  await expect(page.getByTestId("selo-demo")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("estimar-tarefas").click();
  await expect(page.getByTestId("est-pavimentos")).toHaveValue("1");
  await page.getByTestId("est-gerar").click();
  await expect(page.getByTestId("est-confirmar")).toContainText("15 tarefas");
  await page.getByTestId("est-gerar").click();
  await expect(page.getByTestId("selo-estimativa")).toBeVisible();
  const e = await page.evaluate(() => (window as unknown as { __projeto: Estado }).__projeto.getState().arquivoCronograma);
  expect(e).toBe("estimativa automática");
});

test("WhatsApp no computador: baixa o vídeo e abre o WhatsApp Web", async ({ page, context }) => {
  await context.route("https://web.whatsapp.com/**", (r) => r.fulfill({ contentType: "text/html", body: "<title>WhatsApp (simulado)</title>" }));
  await page.goto("/");
  await page.getByTestId("abrir-demo").click();
  await expect(page.getByTestId("selo-demo")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("aba-video").click();
  await page.getByTestId("video-duracao").selectOption("15");
  await page.getByTestId("video-saida").selectOption("gif");
  await page.getByTestId("gerar-video").click();
  await expect(page.getByTestId("resultado-video")).toBeVisible({ timeout: 240_000 });
  await expect(page.getByTestId("compartilhar-video")).toHaveCount(0); // sem Web Share de arquivos neste navegador
  const [download, aba] = await Promise.all([page.waitForEvent("download"), context.waitForEvent("page"), page.getByTestId("whatsapp-computador").click()]);
  expect(download.suggestedFilename()).toMatch(/\.gif$/);
  await aba.waitForLoadState();
  expect(aba.url()).toBe("https://web.whatsapp.com/");
  await expect(page.getByTestId("instrucao-whatsapp")).toContainText("arraste o arquivo");
});
