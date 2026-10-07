// ADR-26: sol real (local, data e norte da casa), Insolação sobre a imagem e ciclo do dia no voo automático.
import { expect, test, type Page } from "@playwright/test";
import { direcaoNaCena, nascerEPor, posicaoDoSol } from "../src/rendering/sol";
import { diaCivil } from "../src/fourd/tempo";

test.describe.configure({ timeout: 240_000 });

const FORTALEZA = { lat: -3.71664, lon: -38.5423 };
const solNaCena = (page: Page) => page.evaluate(() => (window as unknown as { __cena: { estadoSol: { dir: number[]; elevacao: number } } }).__cena.estadoSol);

async function abrirSobrado(page: Page) {
  await page.goto("/");
  await page.getByTestId("abrir-sobrado").click();
  await expect(page.getByTestId("situacao")).toContainText("157 elementos", { timeout: 60_000 });
  await page.getByTestId("data-simulacao").fill("2026-11-26");
}

test("entardecer: o sol na cena é o real (Fortaleza, 26/11/2026) com a frente do IFC a 70°", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  await abrirSobrado(page);
  await page.getByTestId("luz-entardecer").click();
  const d = diaCivil(2026, 11, 26)!;
  const esperado = direcaoNaCena(posicaoDoSol(FORTALEZA, d, nascerEPor(FORTALEZA, d).por - 35), 70);
  const s = await solNaCena(page);
  for (let k = 0; k < 3; k++) expect(s.dir[k]).toBeCloseTo(esperado[k], 2);
  expect(s.elevacao).toBeGreaterThan(0);
  expect(s.elevacao).toBeLessThan(12);

  // a aba Vídeo mostra o norte do IFC e a fachada do sol da tarde; girar a bússola move o sol
  await page.getByTestId("aba-video").click();
  await expect(page.getByTestId("sol-orientacao")).toContainText("70°");
  await expect(page.getByTestId("sol-orientacao")).toContainText("do IFC");
  await expect(page.getByTestId("sol-resumo")).toContainText("fundos");
  await page.getByTestId("sol-norte").evaluate((el) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    set.call(el, "250");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const girado = await solNaCena(page);
  expect(girado.dir[2]).toBeGreaterThan(0.8); // frente a 250° (oés-sudoeste): o sol da tarde fica de frente (+z)
  await expect(page.getByTestId("sol-resumo")).toContainText("frontal");
  await page.getByTestId("sol-norte-ifc").click();
  await expect(page.getByTestId("sol-orientacao")).toContainText("do IFC");
  expect(erros).toEqual([]);
});

test("Insolação: hora, sol e fachadas ao sol sobre a imagem", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  await abrirSobrado(page);
  await page.getByRole("button", { name: "Isométrica" }).click();
  await page.getByTestId("insolacao").click();
  const painel = page.getByTestId("painel-insolacao");
  await expect(painel).toBeVisible();
  const hora = async (m: number) =>
    page.getByTestId("insolacao-controle").evaluate((el, v) => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, m);
  const faixas = () => page.evaluate(() => (window as unknown as { __cena: { faixasDeInsolacao: string[] } }).__cena.faixasDeInsolacao);
  await hora(7 * 60);
  await expect(page.getByTestId("insolacao-hora")).toHaveText("07:00");
  await expect(page.getByTestId("insolacao-sol")).toContainText("frontal");
  expect(await faixas()).toContain("frontal");
  await page.locator(".tela3d").screenshot({ path: "e2e/resultados/50-insolacao-7h.png" });
  await hora(16 * 60);
  await expect(page.getByTestId("insolacao-sol")).toContainText("fundos");
  expect(await faixas()).toContain("fundos");
  expect(await faixas()).not.toContain("frontal");
  await page.locator(".tela3d").screenshot({ path: "e2e/resultados/51-insolacao-16h.png" });
  // sol direto nas fachadas no dia: quatro barras
  await expect(painel.locator(".barra-sol")).toHaveCount(4);
  await page.getByTestId("insolacao").click();
  await expect(painel).toHaveCount(0);
  expect(await faixas()).toEqual([]);
  expect(erros).toEqual([]);
});

test("Ciclo: o voo automático começa no amanhecer e o sol sobe", async ({ page }) => {
  await abrirSobrado(page);
  await page.getByTestId("aparencia-tecnica").click(); // quadros leves; o sol é calculado igual
  await page.getByTestId("aparencia-realista").click();
  await page.getByTestId("luz-ciclo").click();
  await page.getByTestId("drone-automatico").click();
  await page.waitForTimeout(500);
  const inicio = await solNaCena(page);
  expect(inicio.elevacao).toBeLessThan(3); // amanhecendo
  await page.waitForTimeout(8000);
  const depois = await solNaCena(page);
  expect(depois.elevacao).toBeGreaterThan(inicio.elevacao);
  await page.getByTestId("drone-automatico").click(); // para
});
