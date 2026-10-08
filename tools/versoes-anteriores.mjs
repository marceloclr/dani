// Versionamento das páginas publicadas (regra de 2026-10-08): só a versão atual é index.html; as duas anteriores
// continuam no ar como index-DDMMAAAA-HHMM.html, com os seus arquivos de assets/ (nomes com hash, sem colisão).
// Roda no workflow do Pages, depois do build: lê o versoes.json do site no ar, baixa a página e os assets das duas
// versões mais recentes e grava o versoes.json novo em dist/.
// Uso: VERSAO_PUBLICADA=DDMMAAAA-HHMM node tools/versoes-anteriores.mjs [url do site]
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SITE = (process.argv[2] ?? "https://marceloclr.github.io/dani/").replace(/\/?$/, "/");
const DIST = "dist";
const MANTER = 2;
const atual = process.env.VERSAO_PUBLICADA;
if (!/^\d{8}-\d{4}$/.test(atual ?? "")) throw new Error("Defina VERSAO_PUBLICADA=DDMMAAAA-HHMM (o mesmo carimbo do build).");

const arquivosDoBuild = readdirSync(join(DIST, "assets")).map((n) => `assets/${n}`).sort();

async function baixar(caminho, destino) {
  const r = await fetch(SITE + caminho, { cache: "no-store" });
  if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status}`);
  mkdirSync(dirname(join(DIST, destino)), { recursive: true });
  writeFileSync(join(DIST, destino), Buffer.from(await r.arrayBuffer()));
}

let noAr = null;
try {
  const r = await fetch(SITE + "versoes.json", { cache: "no-store" });
  if (r.ok) noAr = await r.json();
} catch {
  /* primeira publicação com versionamento, ou site fora do ar */
}

const anteriores = [];
if (noAr?.atual) {
  // a atual do site vira a anterior mais recente; a mais antiga das anteriores sai
  const candidatas = [{ ...noAr.atual, pagina: "index.html" }, ...(noAr.anteriores ?? []).map((v) => ({ ...v, pagina: `index-${v.versao}.html` }))]
    .filter((v) => v.versao !== atual)
    .slice(0, MANTER);
  for (const v of candidatas) {
    try {
      await baixar(v.pagina, `index-${v.versao}.html`);
      for (const a of v.arquivos) if (!existsSync(join(DIST, a))) await baixar(a, a);
      anteriores.push({ versao: v.versao, arquivos: v.arquivos });
      console.log(`mantida: index-${v.versao}.html (${v.arquivos.length} arquivos)`);
    } catch (e) {
      console.warn(`versão ${v.versao} não pôde ser mantida: ${e.message}`);
    }
  }
} else {
  // primeira publicação com versionamento: a versão no ar ainda não tem versoes.json; os arquivos dela saem
  // da própria página, seguindo as referências a assets/ dentro de cada JS e CSS
  try {
    const html = await (await fetch(SITE, { cache: "no-store" })).text();
    const fila = [...new Set([...html.matchAll(/assets\/[\w.-]+/g)].map((m) => m[0]))];
    const vistos = new Set(fila);
    let versao = null;
    for (let i = 0; i < fila.length; i++) {
      const a = fila[i];
      const r = await fetch(SITE + a, { cache: "no-store" });
      if (!r.ok) continue;
      const dados = Buffer.from(await r.arrayBuffer());
      if (!existsSync(join(DIST, a))) {
        mkdirSync(dirname(join(DIST, a)), { recursive: true });
        writeFileSync(join(DIST, a), dados);
      }
      if (/\.(js|css)$/.test(a)) {
        const txt = dados.toString("utf8");
        versao ??= /[`"'](\d{8}-\d{4})[`"']/.exec(txt)?.[1] ?? null;
        for (const m of txt.matchAll(/(?:assets\/|["'`(/.]\/?)([\w-]+-[\w-]{8}\.(?:js|css|wasm|woff2?|png|svg|jpg|tflite))/g)) {
          const n = `assets/${m[1]}`;
          if (!vistos.has(n)) (vistos.add(n), fila.push(n));
        }
      }
    }
    if (versao && versao !== atual) {
      writeFileSync(join(DIST, `index-${versao}.html`), html);
      const arquivos = [...vistos].filter((a) => existsSync(join(DIST, a))).sort();
      anteriores.push({ versao, arquivos });
      console.log(`mantida (sem versoes.json): index-${versao}.html (${arquivos.length} arquivos)`);
    } else console.log("versão no ar sem carimbo: o histórico começa nesta publicação");
  } catch (e) {
    console.warn(`a versão no ar não pôde ser mantida: ${e.message}`);
  }
}

writeFileSync(join(DIST, "versoes.json"), JSON.stringify({ atual: { versao: atual, arquivos: arquivosDoBuild }, anteriores }, null, 2));
console.log(`atual: ${atual} · anteriores: ${anteriores.map((v) => v.versao).join(", ") || "nenhuma"}`);
