// Capturas de comparação (fora da bateria): node tools/captura.mjs <url> <pasta>
import { chromium } from "@playwright/test";
const [url, pasta, luz] = process.argv.slice(2); // luz opcional: dia, entardecer ou noite
const nav = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await nav.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto(url);
await page.getByTestId("abrir-sobrado").click();
await page.getByTestId("situacao").filter({ hasText: "125 elementos" }).waitFor({ timeout: 90_000 });
await page.getByTestId("data-simulacao").fill("2026-11-26");
await page.waitForTimeout(4000);
if (luz) await page.getByTestId(`luz-${luz}`).click();
await page.getByRole("button", { name: "Externa" }).click();
await page.waitForTimeout(3000);
await page.locator(".tela3d").screenshot({ path: `${pasta}/1-externa.png` });
await page.getByTestId("aba-video").click();
await page.getByTestId("camera-drone").click();
for (const [n, f] of [["2-interior", 0.72], ["3-fachada", 0.56], ["4-escada", 0.8]]) {
  await page.evaluate((f) => {
    const r = document.querySelector('input[type="range"]');
    const max = Number(r.max);
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    set.call(r, String(max * f));
    r.dispatchEvent(new Event("input", { bubbles: true }));
  }, f);
  await page.waitForTimeout(3000);
  await page.locator(".tela3d").screenshot({ path: `${pasta}/${n}.png` });
}
await nav.close();
