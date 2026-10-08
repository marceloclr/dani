// Incremento 9: drone (voo manual e automático), obra pronta humanizada, câmera Drone no vídeo e slogan.
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ timeout: 300_000 });

type Janela = {
  __projeto: { getState(): { dia: number; elementos: { guid: string; ifcType: string }[]; cronograma: { tarefas: { fim: number }[] }; definirDia(d: number): void } };
  __cena: { visiveis(): string[]; camera: { position: { x: number; y: number; z: number } } };
};

async function abrirSobrado(page: Page) {
  await page.goto("/#/gestao");
  await expect(page.getByTestId("slogan-inicial")).toHaveText("Produtor de Vídeos das obras da Super Influencer Dani, a engenheira.");
  await page.getByTestId("abrir-sobrado").click();
  await expect(page.getByTestId("situacao")).toContainText("157 elementos", { timeout: 90_000 });
}

const moveisVisiveis = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as Janela;
    const moveis = new Set(w.__projeto.getState().elementos.filter((e) => e.ifcType === "IfcFurniture").map((e) => e.guid));
    return w.__cena.visiveis().filter((g) => moveis.has(g)).length;
  });

test("obra pronta humanizada: a mobília só aparece no fim", async ({ page }) => {
  await abrirSobrado(page);
  await expect(page.locator(".topo .slogan")).toHaveCount(0); // o slogan saiu do cabeçalho (pedido do usuário); fica na tela inicial
  await page.evaluate(() => (window as unknown as Janela).__projeto.getState().definirDia(100));
  expect(await moveisVisiveis(page)).toBe(0);
  await page.getByRole("button", { name: "Ir ao fim" }).click();
  expect(await moveisVisiveis(page)).toBe(24);
});

test("drone manual: voa com o teclado e sai com Esc", async ({ page }) => {
  await abrirSobrado(page);
  await page.getByTestId("aparencia-tecnica").click(); // quadros leves: sem GPU o realista atrasa teclado e cliques
  await page.getByTestId("drone-manual").click();
  await expect(page.getByTestId("ajuda-drone")).toBeVisible();
  const antes = await page.evaluate(() => ({ ...(window as unknown as Janela).__cena.camera.position }));
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(700);
  await page.keyboard.up("KeyW");
  await page.keyboard.down("KeyE");
  await page.waitForTimeout(400);
  await page.keyboard.up("KeyE");
  const depois = await page.evaluate(() => ({ ...(window as unknown as Janela).__cena.camera.position }));
  expect(Math.hypot(depois.x - antes.x, depois.z - antes.z)).toBeGreaterThan(0.5);
  expect(depois.y).toBeGreaterThan(antes.y);
  await page.screenshot({ path: "e2e/resultados/30-drone-manual.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("ajuda-drone")).not.toBeVisible();
  await expect(page.getByTestId("drone-manual")).toHaveAttribute("aria-pressed", "false");
});

test("voo automático na viewport: a obra avança e para no clique", async ({ page }) => {
  await abrirSobrado(page);
  await page.getByTestId("aparencia-tecnica").click(); // quadros leves: sem GPU o realista atrasa teclado e cliques
  await page.getByTestId("drone-automatico").click();
  await expect(page.getByTestId("drone-automatico")).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(2500);
  const dia = await page.evaluate(() => (window as unknown as Janela).__projeto.getState().dia);
  expect(dia).toBeGreaterThan(0);
  await page.screenshot({ path: "e2e/resultados/31-voo-automatico.png" });
  await page.getByTestId("drone-automatico").click();
  await expect(page.getByTestId("drone-automatico")).toHaveAttribute("aria-pressed", "false");
});

test("vídeo com a câmera Drone: GIF com voo, passeio e assinatura", async ({ page }) => {
  await abrirSobrado(page);
  await page.getByTestId("aba-video").click();
  await page.getByTestId("camera-drone").click();
  await expect(page.getByTestId("resumo-drone")).toContainText("entra pela porta da frente; sobe e desce a escada");
  await expect(page.getByTestId("roteiro")).not.toBeVisible();
  await expect(page.getByTestId("relacao-tempo")).toContainText("de montagem");
  await expect(page.getByTestId("video-assinatura")).toBeChecked();
  await page.getByTestId("video-duracao").selectOption("15");
  await page.getByTestId("video-saida").selectOption({ label: "GIF animado (leve)" });
  await page.getByTestId("gerar-video").click();
  await expect(page.getByTestId("resultado-video")).toBeVisible({ timeout: 240_000 });
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByTestId("baixar-video").click()]);
  await d.saveAs("e2e/resultados/drone.gif");
});
