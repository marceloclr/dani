// Gera public/modelos/exemplo.4dstudio usando o próprio app (npm run modelos). Fora disso, não roda.
import { copyFileSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.skip(!process.env.GERAR_EXEMPLO, "só com GERAR_EXEMPLO=1 (npm run modelos)");
test.describe.configure({ timeout: 300_000 });

const FOTOS: [string, string, string, string, string, string][] = [
  // arquivo, data, dia relativo (desde 05/01/2026), câmera, local, descrição
  ["obra-2026-02-02.jpg", "02/02/2026", "28", "isometrica", "Lote inteiro", "Sapatas concretadas e baldrames em execução"],
  ["obra-2026-03-02.jpg", "02/03/2026", "56", "externa", "Fachada frontal", "Pilares e vigas prontos"],
  ["obra-2026-04-01.jpg", "01/04/2026", "86", "lateral", "Sala de pé-direito duplo", "Alvenaria da sala chegando à platibanda"],
  ["obra-2026-04-20.jpg", "20/04/2026", "105", "isometrica", "Cobertura", "Laje de forro em execução"],
];
const ETAPA: Record<string, string> = { "28": "FUN-01", "56": "EST-01", "86": "ALV-01", "105": "LAJ-01" };

test("gera o exemplo.4dstudio", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("abrir-demo").click();
  await expect(page.getByTestId("selo-demo")).toBeVisible({ timeout: 60_000 });
  await page.locator('input[type=file][accept=".csv,.xlsx,.json,.txt"]').first().setInputFiles("public/modelos/cronograma-modelo.csv");
  await expect(page.getByTestId("real-ALV-01")).toBeAttached();

  const arquivos = [];
  for (const [nome, , dia, camera] of FOTOS) {
    const bytes = await page.evaluate(([d, c]) => (window as unknown as { __capturar(d: number, c: string): Promise<number[]> }).__capturar(Number(d), c), [dia, camera]);
    arquivos.push({ name: nome, mimeType: "image/jpeg", buffer: Buffer.from(bytes) });
  }
  const csv = ["arquivo;data;local;descricao;etapa", ...FOTOS.map(([n, d, dia, , l, desc]) => `${n};${d};${l};Ilustração gerada pela simulação, não é foto real: ${desc.toLowerCase()};${ETAPA[dia]}`)].join("\r\n");
  arquivos.push({ name: "fotos.csv", mimeType: "text/csv", buffer: Buffer.from("﻿" + csv) });
  await page.getByTestId("aba-obra").click();
  await page.getByTestId("entrada-fotos").setInputFiles(arquivos);
  await expect(page.getByTestId("lista-fotos").locator("li")).toHaveCount(4);

  await page.evaluate(() => {
    const w = window as unknown as { __projeto: { getState(): { definirProjeto(p: object): void; definirVisao(v: string): void; definirDia(d: number): void } } };
    w.__projeto.getState().definirProjeto({ nomeProjeto: "Casa de exemplo (fictícia)" });
    w.__projeto.getState().definirVisao("comparar");
    w.__projeto.getState().definirDia(105);
  });
  await page.getByTestId("abrir-projetos").click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("exportar-atual").click()]);
  const tmp = "e2e/resultados/exemplo.4dstudio";
  await download.saveAs(tmp);
  copyFileSync(tmp, "public/modelos/exemplo.4dstudio");
  expect(readFileSync(tmp).subarray(0, 2).toString()).toBe("PK");
});
