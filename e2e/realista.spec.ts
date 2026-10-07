// Incremento 7: aparência realista, sobrado de exemplo e tema claro como padrão (prompts/incremento-7.md).
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 300_000 });

type Malha = { visible: boolean; castShadow: boolean; material: { map: unknown; isMeshPhysicalMaterial?: boolean; transparent: boolean } };
type CenaTeste = { malhas: Map<string, Malha>; renderer: { shadowMap: { enabled: boolean }; toneMapping: number }; aparencia: string };

const estadoCena = (page: Page) =>
  page.evaluate(() => {
    const c = (window as unknown as { __cena: CenaTeste }).__cena;
    const vis = [...c.malhas.values()].filter((m) => m.visible);
    return {
      aparencia: c.aparencia,
      // vidro é material físico sem textura (reflexo do céu, ADR-24)
      comTextura: vis.filter((m) => !!m.material.map || (m.material.isMeshPhysicalMaterial && m.material.transparent)).length,
      visiveis: vis.length,
      sombras: c.renderer.shadowMap.enabled,
      projetamSombra: vis.filter((m) => m.castShadow).length,
      toneMapping: c.renderer.toneMapping,
    };
  });

test("aparência realista por padrão; técnica volta às cores lisas", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  await page.goto("/");
  await page.getByTestId("abrir-demo").click();
  await expect(page.getByTestId("selo-demo")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("aparencia-realista")).toHaveAttribute("aria-selected", "true");
  await page.getByTestId("data-simulacao").fill("2026-07-03");
  const real = await estadoCena(page);
  expect(real.aparencia).toBe("realista");
  expect(real.comTextura).toBe(real.visiveis); // tudo com textura
  expect(real.sombras).toBe(true);
  expect(real.projetamSombra).toBeGreaterThan(100);
  expect(real.toneMapping).not.toBe(0); // ACES
  await page.locator(".tela3d").screenshot({ path: "e2e/resultados/21-realista.png" });

  await page.getByTestId("aparencia-tecnica").click();
  const tec = await estadoCena(page);
  expect(tec.aparencia).toBe("tecnica");
  expect(tec.comTextura).toBe(0);
  expect(tec.sombras).toBe(false);
  await page.locator(".tela3d").screenshot({ path: "e2e/resultados/22-tecnica.png" });
  expect(erros).toEqual([]);
});

test("GIF com aparência realista em qualidade máxima", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("abrir-demo").click();
  await expect(page.getByTestId("selo-demo")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("aba-video").click();
  await page.getByTestId("video-duracao").selectOption("15");
  await page.getByTestId("video-saida").selectOption("gif");
  await page.getByTestId("video-qualidade").selectOption("maxima"); // 1,5× e reduz (ADR-24)
  await page.getByTestId("gerar-video").click();
  await expect(page.getByTestId("resultado-video").locator("img")).toBeVisible({ timeout: 280_000 });
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("baixar-video").click()]);
  await d.saveAs("e2e/resultados/realista.gif");
  expect(readFileSync("e2e/resultados/realista.gif").subarray(0, 6).toString()).toBe("GIF89a");
});

test("sobrado de exemplo pela tela inicial", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("abrir-sobrado").click();
  await expect(page.getByTestId("situacao")).toContainText("Sobrado de exemplo · 125 elementos", { timeout: 60_000 });
  await expect(page.locator(".gantt .linha")).toHaveCount(18);
  await page.getByTestId("data-simulacao").fill("2026-05-10"); // alvenaria do térreo
  await page.getByTestId("modo-animacao").selectOption("aparecimento");
  const superiores = await page.evaluate(() => {
    const w = window as unknown as { __cena: { visiveis(): string[] }; __projeto: { getState(): { elementos: { guid: string; ifcType: string; pavimento: string | null }[] } } };
    const vis = new Set(w.__cena.visiveis());
    return w.__projeto.getState().elementos.filter((e) => e.ifcType === "IfcWall" && e.pavimento === "Pavimento superior" && vis.has(e.guid)).length;
  });
  expect(superiores).toBe(0);
  await page.getByTestId("data-simulacao").fill("2026-11-26");
  await page.getByRole("button", { name: "Externa" }).click();
  await page.locator(".tela3d").screenshot({ path: "e2e/resultados/23-sobrado.png" });
});

test("luz da noite acende as luminárias da obra pronta (ADR-24)", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  await page.goto("/");
  await page.getByTestId("abrir-sobrado").click();
  await expect(page.getByTestId("situacao")).toContainText("125 elementos", { timeout: 60_000 });
  const lampadas = () =>
    page.evaluate(() => {
      const c = (window as unknown as { __cena: { lampadas: { visible: boolean; children: { isPointLight?: boolean; intensity: number }[] } } }).__cena;
      const luzes = c.lampadas.children.filter((x) => x.isPointLight);
      return { visivel: c.lampadas.visible, n: luzes.length, acesas: luzes.filter((x) => x.intensity > 0).length };
    });
  await page.getByTestId("data-simulacao").fill("2026-11-26"); // obra pronta
  expect((await lampadas()).visivel).toBe(false); // de dia, apagadas
  await page.getByTestId("luz-noite").click();
  const noite = await lampadas();
  expect(noite.visivel).toBe(true);
  expect(noite.n).toBeGreaterThanOrEqual(4);
  expect(noite.acesas).toBe(noite.n);
  await page.locator(".tela3d").screenshot({ path: "e2e/resultados/24-noite.png" });
  await page.getByTestId("data-simulacao").fill("2026-05-10"); // em obra: sem luminárias
  expect((await lampadas()).visivel).toBe(false);
  await page.getByTestId("aba-video").click();
  await expect(page.getByTestId("video-luz")).toHaveValue("noite");
  await page.getByTestId("video-luz").selectOption("dia");
  await expect(page.getByTestId("luz-dia")).toHaveAttribute("aria-selected", "true");
  expect(erros).toEqual([]);
});

test.describe("sistema no tema escuro", () => {
  test.use({ colorScheme: "dark" });
  test("o app abre no tema claro e lembra a escolha do usuário", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-tema", "claro");
    await page.getByRole("button", { name: /tema escuro/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-tema", "escuro");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-tema", "escuro");
  });
});
