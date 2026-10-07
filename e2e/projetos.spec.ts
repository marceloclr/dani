// Incremento 3: projetos salvos, .4dstudio, XLSX, edição de tarefas e modo paramétrico (prompts/incremento-3.md).
import { expect, test, type Page } from "@playwright/test";
import * as XLSX from "xlsx";

test.describe.configure({ timeout: 300_000 });

type Janela = {
  __projeto: { getState(): { elementos: { guid: string; ifcType: string }[]; cronograma: { tarefas: { id: string; fim: number }[] } | null; excecoes: unknown[] } };
  __cena: { visiveis(): string[] };
};
const estado = (page: Page) => page.evaluate(() => {
  const s = (window as unknown as Janela).__projeto.getState();
  return { elementos: s.elementos.length, tarefas: s.cronograma?.tarefas.map((t) => `${t.id}:${t.fim}`) ?? [], excecoes: s.excecoes.length };
});

async function abrirDemo(page: Page) {
  await page.goto("/");
  await page.getByTestId("abrir-demo").click();
  await expect(page.getByTestId("selo-demo")).toBeVisible({ timeout: 60_000 });
}

async function editarFimDaAlvenaria(page: Page, fim: string) {
  await page.getByTestId("aba-tarefas").click();
  await page.getByTestId("editar-ALV-01").click();
  await page.getByTestId("tarefa-fim").fill(fim);
  await page.getByTestId("tarefa-salvar").click();
  await expect(page.getByTestId("modal-tarefa")).not.toBeVisible();
}

test("salvar cópia, editar, recarregar e reabrir com tudo intacto", async ({ page }) => {
  await abrirDemo(page);
  await page.getByTestId("abrir-projetos").click();
  await expect(page.getByTestId("situacao-projeto")).toHaveText("Não salvo (demonstração)");
  await page.getByTestId("salvar-copia").click();
  await expect(page.getByTestId("situacao")).toContainText(/salvo às \d\d:\d\d/);

  // edição de tarefa: a alvenaria passa a terminar em 10/04 (era 30/03)
  await editarFimDaAlvenaria(page, "2026-04-10");
  await page.getByTestId("data-simulacao").fill("2026-04-05");
  await expect(page.locator(".controles .andamento")).toContainText("Alvenaria");
  // exceção manual: tirar a primeira parede da alvenaria
  await page.evaluate(() => {
    const w = window as unknown as { __projeto: { getState(): { elementos: { guid: string; ifcType: string }[]; excluirDeTarefa(g: string, t: string): void } } };
    const s = w.__projeto.getState();
    s.excluirDeTarefa(s.elementos.find((e) => e.ifcType === "IfcWall")!.guid, "ALV-01");
  });
  const antes = await estado(page);
  expect(antes.excecoes).toBe(1);
  await page.waitForTimeout(1200); // gravação automática (600 ms)

  await page.reload();
  await expect(page.getByTestId("abrir-demo")).toBeVisible();
  await page.getByTestId("abrir-projetos").click();
  await expect(page.getByTestId("lista-projetos")).toContainText("Demonstração");
  await page.getByTestId("abrir-projeto").first().click();
  await expect(page.getByText("146 elementos")).toBeVisible({ timeout: 60_000 });
  expect(await estado(page)).toEqual(antes);
  await expect(page.getByTestId("selo-demo")).toBeVisible(); // continua fictício
});

test("exportar e importar .4dstudio", async ({ page }) => {
  await abrirDemo(page);
  await editarFimDaAlvenaria(page, "2026-04-02");
  const antes = await estado(page);
  await page.getByTestId("abrir-projetos").click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("exportar-atual").click()]);
  expect(download.suggestedFilename()).toBe("demonstracao.4dstudio");
  const caminho = "e2e/resultados/demonstracao.4dstudio";
  await download.saveAs(caminho);

  await page.getByTestId("novo-projeto").click();
  await expect(page.getByTestId("abrir-demo")).toBeVisible();
  await page.getByTestId("abrir-projetos").click();
  await page.getByTestId("entrada-4dstudio").setInputFiles(caminho);
  await expect(page.getByText("146 elementos")).toBeVisible({ timeout: 60_000 });
  expect(await estado(page)).toEqual(antes);
  await expect(page.getByTestId("situacao")).toContainText(/salvo às/);

  // arquivo inválido: erro amigável
  await page.getByTestId("abrir-projetos").click();
  await page.getByTestId("entrada-4dstudio").setInputFiles({ name: "falso.4dstudio", mimeType: "application/zip", buffer: Buffer.from("não é zip") });
  await expect(page.getByTestId("erro")).toContainText("Este arquivo não é um projeto .4dstudio.");
});

test("modelo paramétrico de 2 pavimentos com duas águas: simulação e vídeo", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("abrir-parametrico").click();
  await page.getByTestId("param-area").fill("1000");
  await expect(page.getByTestId("param-previa")).toContainText("não cabe");
  await expect(page.getByTestId("param-gerar")).toBeDisabled();
  await page.getByTestId("param-area").fill("200");
  await page.getByTestId("param-pavimentos").selectOption("2");
  await page.getByTestId("param-cobertura").selectOption("duas-aguas");
  await expect(page.getByTestId("param-previa")).toContainText("100 m² por pavimento");
  await page.getByTestId("param-gerar").click();
  await expect(page.getByTestId("selo-parametrico")).toBeVisible();
  await expect(page.getByTestId("situacao")).toContainText(/Casa paramétrica .* salvo às/);

  await page.getByTestId("usar-cronograma-demo").click();
  await expect(page.locator(".gantt .linha")).toHaveCount(15);
  await page.getByTestId("data-simulacao").fill("2026-07-03");
  const tipos = await page.evaluate(() => {
    const w = window as unknown as Janela;
    const porGuid = new Map(w.__projeto.getState().elementos.map((e) => [e.guid, e.ifcType]));
    return [...new Set(w.__cena.visiveis().map((g) => porGuid.get(g)))].sort();
  });
  expect(tipos).toEqual(["IfcBeam", "IfcColumn", "IfcCovering", "IfcDoor", "IfcFooting", "IfcGeographicElement", "IfcSlab", "IfcStair", "IfcWall", "IfcWindow"]);
  const total = await page.evaluate(() => (window as unknown as Janela).__cena.visiveis().length);
  expect(total).toBe(await page.evaluate(() => (window as unknown as Janela).__projeto.getState().elementos.length));
  await page.getByRole("button", { name: "Isométrica" }).click();
  await page.screenshot({ path: "e2e/resultados/7-parametrico.png" });
  await page.getByTestId("data-simulacao").fill("2026-03-20");
  await page.screenshot({ path: "e2e/resultados/8-parametrico-alvenaria.png" });

  // vídeo sem nenhum ajuste de mapeamento
  await page.getByTestId("aba-video").click();
  await page.getByTestId("video-formato").selectOption("quadrado");
  await page.getByTestId("video-fps").selectOption("24");
  await page.getByTestId("video-duracao").selectOption("15");
  await expect(page.getByTestId("video-saida")).toBeEnabled();
  await page.getByTestId("gerar-video").click();
  await expect(page.getByTestId("resultado-video")).toBeVisible({ timeout: 240_000 });
});

test("importar cronograma XLSX", async ({ page }) => {
  await abrirDemo(page);
  const ws = XLSX.utils.aoa_to_sheet([
    ["id", "nome", "inicio", "fim", "categoria"],
    ["F", "Fundação", 46027, 46046, "fundacao"],
    ["E", "Estrutura", "26/01/2026", "15/02/2026", "estrutura"],
    ["A", "Alvenaria", 46069, 46099, "alvenaria"],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Obra");
  const buffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  await page.locator('input[type=file][accept=".csv,.xlsx,.json,.txt"]').first().setInputFiles({ name: "obra.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
  await expect(page.locator(".gantt .linha")).toHaveCount(3);
  await expect(page.getByTestId("dia-atual")).toHaveText(/de 73$/);
  await page.getByTestId("aba-validacao").click();
  await expect(page.getByTestId("painel-validacao")).toContainText('XLSX (planilha "Obra")');
});
