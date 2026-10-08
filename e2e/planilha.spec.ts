// INC-14 (ADR-29): planilha única da obra — abrir, juntar o IFC citado, casa paramétrica sem IFC e exportar de volta.
import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import * as XLSX from "xlsx";
import { lerPlanilha } from "../src/planilha/ler";

test.describe.configure({ timeout: 180_000 });

type Janela = { __projeto: { getState(): { tipoModelo: string | null; excecoes: unknown[]; video: { formato: string; sol?: { norteGraus?: number | null } }; cronograma: { municipio?: string; tarefas: unknown[] } | null; planilha: { obra: { nome: string } } | null; nomeProjeto: string | null } } };
const estado = (page: Page) => page.evaluate(() => {
  const s = (window as unknown as Janela).__projeto.getState();
  return { tipo: s.tipoModelo, tarefas: s.cronograma?.tarefas.length ?? 0, municipio: s.cronograma?.municipio, formato: s.video.formato, norte: s.video.sol?.norteGraus, obra: s.planilha?.obra.nome, projeto: s.nomeProjeto, excecoes: s.excecoes.length };
});

const MODELO = readFileSync("public/modelos/obra-dani.xlsx");

/** A planilha modelo com um campo da aba Obra trocado e um vínculo, gerada aqui mesmo. */
function variante(campo: string, valor: string | null, vinculo?: [string, string, string, string]): Buffer {
  const wb = XLSX.read(MODELO, { type: "buffer" });
  const obra = wb.Sheets["Obra"];
  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(obra, { defval: "" });
  const i = linhas.findIndex((l) => l.campo === campo);
  const ref = XLSX.utils.encode_cell({ r: i + 1, c: 1 });
  if (valor === null) delete obra[ref];
  else obra[ref] = { t: "s", v: valor };
  if (vinculo) XLSX.utils.sheet_add_aoa(wb.Sheets["Vínculos"], [vinculo], { origin: "A2" });
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

test("planilha + IFC citado: cronograma, município, rumo, formato e vínculos", async ({ page }) => {
  await page.goto("/#/gestao");
  await page.getByTestId("entrada-planilha").setInputFiles({ name: "obra-dani.xlsx", mimeType: "application/octet-stream", buffer: MODELO });
  // a planilha cita o IFC, que ainda não veio: o cronograma já está lido e a tela inicial continua
  await expect(page.getByTestId("entrada-ifc")).toBeAttached();
  await expect.poll(() => estado(page)).toMatchObject({ tipo: null, tarefas: 18, municipio: "fortaleza", formato: "vertical", norte: 70, obra: "Sobrado de exemplo" });

  // o primeiro elemento do sobrado, para um vínculo (exclusão) na planilha
  await page.getByTestId("entrada-ifc").setInputFiles("public/modelos/sobrado-exemplo.ifc");
  await expect(page.getByText(/157 elementos/)).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".gantt .linha")).toHaveCount(18);
  expect(await estado(page)).toMatchObject({ tipo: "IFC", tarefas: 18, projeto: "Sobrado de exemplo" });

  // com vínculo: abrir de novo a planilha (agora com o IFC carregado) aplica a exceção
  const guid = await page.evaluate(() => (window as unknown as { __projeto: { getState(): { elementos: { guid: string; ifcType: string }[] } } }).__projeto.getState().elementos.find((e) => e.ifcType === "IfcWall")!.guid);
  const comVinculo = variante("Nome da obra", "Sobrado de exemplo", [guid, "ALV-T", "construção", "excluir"]);
  await page.locator('input[type=file][accept=".csv,.xlsx,.json,.txt"]').setInputFiles({ name: "obra-dani.xlsx", mimeType: "application/octet-stream", buffer: comVinculo });
  await expect.poll(async () => (await estado(page)).excecoes).toBe(1);

  // exportar: a planilha baixada lê de volta com os mesmos dados
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("exportar-planilha").click()]);
  expect(download.suggestedFilename()).toMatch(/^sobrado-de-exemplo-planilha-\d{8}-\d{4}\.xlsx$/);
  const { projeto, problemas } = await lerPlanilha(new Uint8Array(readFileSync(await download.path())));
  expect(problemas.filter((p) => p.nivel === "erro")).toEqual([]);
  expect(projeto!.obra).toMatchObject({ nome: "Sobrado de exemplo", municipio: "fortaleza", arquivoIfc: "sobrado-exemplo.ifc", rumoFrente: 70 });
  expect(projeto!.cronograma!.tarefas).toHaveLength(18);
  expect(projeto!.vinculos).toEqual([{ taskId: "ALV-T", guid, acao: "construct", modo: "exclude" }]);
  expect(projeto!.video).toMatchObject({ formato: "vertical", qualidade: "maxima", aparencia: "realista", luz: "dia" });
});

test("planilha sem IFC: a casa vem da aba Modelo e vira projeto salvo", async ({ page }) => {
  await page.goto("/#/gestao");
  await page.getByTestId("entrada-planilha").setInputFiles({ name: "casa.xlsx", mimeType: "application/octet-stream", buffer: variante("Arquivo IFC", null) });
  await expect(page.locator(".gantt .linha")).toHaveCount(18, { timeout: 30_000 });
  expect(await estado(page)).toMatchObject({ tipo: "PARAMETRICO", tarefas: 18 });
  await expect(page.getByTestId("situacao")).toContainText(/salvo às \d\d:\d\d/);
  await expect.poll(async () => (await estado(page)).projeto).toBe("Sobrado de exemplo");
});

test("arquivo que não é a planilha da obra continua abrindo como cronograma avulso", async ({ page }) => {
  await page.goto("/#/gestao");
  await page.getByTestId("entrada-cronograma").setInputFiles("public/modelos/cronograma-modelo.xlsx");
  await expect.poll(async () => (await estado(page)).tarefas).toBe(15);
  expect((await estado(page)).obra).toBeUndefined();
});
