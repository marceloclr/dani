// Quadros de comparação do ambiente (fora da bateria): a obra pronta do sobrado (IFC) e da casa da aba Modelo
// (paramétrica), em vistas parecidas com as do vídeo vertical.
// Uso: npm run build && npx vite preview --port 4174 & node tools/quadros-ambiente.mjs http://localhost:4174/ <pasta> [prefixo]
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import * as XLSX from "xlsx";

const [url, pasta, prefixo = "q"] = process.argv.slice(2);
const nav = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

/** Planilha modelo sem o IFC: a casa sai da aba Modelo. */
function semIfc() {
  const wb = XLSX.read(readFileSync("public/modelos/obra-dani.xlsx"), { type: "buffer" });
  const obra = wb.Sheets["Obra"];
  const linhas = XLSX.utils.sheet_to_json(obra, { defval: "" });
  delete obra[XLSX.utils.encode_cell({ r: linhas.findIndex((l) => l.campo === "Arquivo IFC") + 1, c: 1 })];
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

for (const casa of ["ifc", "param"]) {
  const page = await nav.newPage({ viewport: { width: 1500, height: 1000 } });
  await page.goto(`${url}#/gestao`);
  if (casa === "ifc") {
    await page.getByTestId("abrir-sobrado").click();
    await page.getByTestId("situacao").filter({ hasText: "157 elementos" }).waitFor({ state: "attached", timeout: 90_000 });
  } else {
    await page.getByTestId("entrada-planilha").setInputFiles({ name: "casa.xlsx", mimeType: "application/octet-stream", buffer: semIfc() });
    await page.locator(".gantt .linha").first().waitFor({ timeout: 60_000 });
  }
  await page.getByTestId("data-simulacao").fill("2026-11-26");
  await page.waitForTimeout(3000);
  for (const vista of ["Externa", "Isométrica", "Frontal"]) {
    await page.getByRole("button", { name: vista, exact: true }).click();
    await page.waitForTimeout(3500);
    await page.locator(".tela3d").screenshot({ path: `${pasta}/${prefixo}-${casa}-${vista.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()}.png` });
  }
  await page.close();
}
await nav.close();
