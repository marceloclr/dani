// Roteiro de aceitação do incremento 1 (prompts/incremento-1.md), no Chromium.
import { expect, test, type Page } from "@playwright/test";

type Janela = {
  __projeto: { getState(): { dia: number; elementos: { guid: string; ifcType: string; nome: string }[]; selecionado: string | null; tocando: boolean } };
  __cena: { visiveis(): string[]; projetar(x: number, y: number, z: number): { x: number; y: number } };
};

/** Classes IFC visíveis agora na cena. */
async function tiposVisiveis(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const w = window as unknown as Janela;
    const porGuid = new Map(w.__projeto.getState().elementos.map((e) => [e.guid, e.ifcType]));
    const out: Record<string, number> = {};
    for (const g of w.__cena.visiveis()) out[porGuid.get(g)!] = (out[porGuid.get(g)!] ?? 0) + 1;
    return out;
  });
}

async function irPara(page: Page, iso: string) {
  await page.getByTestId("data-simulacao").fill(iso);
}

test("incremento 1 de ponta a ponta com a demonstração", async ({ page }) => {
  const errosConsole: string[] = [];
  page.on("console", (m) => m.type() === "error" && errosConsole.push(m.text()));
  page.on("pageerror", (e) => errosConsole.push(String(e)));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Construction 4D Studio", level: 1 }).first()).toBeVisible();
  await page.screenshot({ path: "e2e/resultados/0-inicial.png" });

  // 2. DEMONSTRAÇÃO → casa em 3D com o selo
  await page.getByTestId("abrir-demo").click();
  await expect(page.getByTestId("selo-demo")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".tela3d canvas")).toBeVisible();
  await expect(page.getByTestId("situacao")).toContainText("146 elementos");
  await expect(page.getByTestId("modo-animacao")).toHaveValue("progressivo"); // padrão desde o incremento 5
  await page.getByTestId("modo-animacao").selectOption("aparecimento"); // este roteiro confere a ordem das etapas

  // 3. cronograma na timeline; regras já vincularam os elementos
  await expect(page.locator(".gantt .linha")).toHaveCount(15);
  for (const id of ["FUN-01", "EST-01", "ALV-01", "COB-01", "ESQ-01"]) {
    await expect(page.getByTestId(`contagem-${id}`)).not.toHaveText(/^0 /);
  }
  await expect(page.getByTestId("dia-atual")).toHaveText("Dia 1 de 180");

  // 4. ordem construtiva
  await irPara(page, "2026-02-03"); // último dia da fundação
  let v = await tiposVisiveis(page);
  expect(v.IfcFooting).toBe(35);
  expect(v.IfcColumn ?? 0).toBe(0);
  expect(v.IfcWall ?? 0).toBe(0);
  await irPara(page, "2026-02-20"); // estrutura
  v = await tiposVisiveis(page);
  expect(v.IfcColumn).toBe(19);
  expect(v.IfcWall ?? 0).toBe(0);
  await irPara(page, "2026-03-15"); // alvenaria
  v = await tiposVisiveis(page);
  expect(v.IfcWall).toBe(16);
  expect(v.IfcDoor ?? 0).toBe(0);
  await page.screenshot({ path: "e2e/resultados/1-alvenaria.png" });
  await irPara(page, "2026-04-25"); // cobertura
  v = await tiposVisiveis(page);
  expect(v.IfcSlab).toBe(1 + 2 + 3); // contrapiso, lajes e telhados
  expect(v.IfcWindow ?? 0).toBe(0);
  await irPara(page, "2026-07-03"); // entrega
  v = await tiposVisiveis(page);
  expect(Object.values(v).reduce((a, b) => a + b, 0)).toBe(146);
  await page.screenshot({ path: "e2e/resultados/2-concluida.png" });

  // PLAY a 8×: o dia avança e a casa cresce
  await page.getByTestId("play").click(); // no último dia, volta ao início e toca
  await page.getByLabel("Velocidade").selectOption("8");
  await page.waitForTimeout(1500);
  const dia1 = await page.evaluate(() => (window as unknown as Janela).__projeto.getState().dia);
  const n1 = (await page.evaluate(() => (window as unknown as Janela).__cena.visiveis().length));
  await page.waitForTimeout(1500);
  const dia2 = await page.evaluate(() => (window as unknown as Janela).__projeto.getState().dia);
  const n2 = (await page.evaluate(() => (window as unknown as Janela).__cena.visiveis().length));
  expect(dia2).toBeGreaterThan(dia1);
  expect(n2).toBeGreaterThanOrEqual(n1);
  await page.getByTestId("play").click(); // pausa
  expect(await page.evaluate(() => (window as unknown as Janela).__projeto.getState().tocando)).toBe(false);

  // 5. arrastar o cursor muda a geometria
  const escala = page.getByTestId("escala");
  const caixa = (await escala.boundingBox())!;
  await page.mouse.move(caixa.x + 2, caixa.y + caixa.height / 2);
  await page.mouse.down();
  await page.mouse.move(caixa.x + caixa.width * 0.2, caixa.y + caixa.height / 2, { steps: 5 });
  await page.mouse.up();
  const nArrasto = await page.evaluate(() => (window as unknown as Janela).__cena.visiveis().length);
  await page.mouse.move(caixa.x + caixa.width * 0.95, caixa.y + caixa.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  const nFim = await page.evaluate(() => (window as unknown as Janela).__cena.visiveis().length);
  expect(nFim).toBeGreaterThan(nArrasto);

  // 6. selecionar uma parede no 3D e excluí-la da alvenaria → fantasma
  await irPara(page, "2026-07-03");
  await page.getByRole("button", { name: "Frontal" }).click();
  const alvo = await page.evaluate(() => (window as unknown as Janela).__cena.projetar(2.0, 3.1, 0.08)); // platibanda da fachada frontal
  await page.mouse.click(alvo.x, alvo.y);
  await expect(page.getByTestId("painel-elemento")).toContainText("Parede: Fachada frontal");
  await page.getByTestId("excluir-ALV-01").click();
  await irPara(page, "2026-03-15");
  await expect(page.getByTestId("estado-elemento")).toHaveText("sem tarefa (fantasma)");
  await page.getByRole("button", { name: "Isométrica" }).click();
  await page.screenshot({ path: "e2e/resultados/3-fantasma.png" });

  // 7. arquivo que não é IFC → mensagem amigável, tela intacta
  await page.locator('input[type=file][accept=".ifc"]').first().setInputFiles({ name: "falso.ifc", mimeType: "text/plain", buffer: Buffer.from("isto não é um IFC") });
  await expect(page.getByTestId("erro")).toContainText("O arquivo não parece ser um modelo IFC.");
  await expect(page.getByTestId("erro")).toContainText("Detalhes técnicos");
  await expect(page.locator(".tela3d canvas")).toBeVisible();
  await expect(page.getByTestId("situacao")).toContainText("146 elementos");

  expect(errosConsole).toEqual([]);
});

test("tema escuro e tela de celular", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: /tema escuro/ }).click();
  await page.getByTestId("abrir-demo").click();
  await expect(page.getByTestId("selo-demo")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("data-simulacao").fill("2026-04-25");
  const largura = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(largura).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "e2e/resultados/4-celular-escuro.png", fullPage: true });
});
