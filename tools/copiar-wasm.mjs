// ADR-07: ativos binários servidos pelo próprio app, nunca de CDN.
// - web-ifc.wasm (monothread; ver src/bim/ifc.worker.ts; o -mt exigiria COOP/COEP)
// - fontes-padrão do pdf.js, para plantas em PDF com texto (ADR-14)
import { cpSync, copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public/wasm", { recursive: true });
copyFileSync("node_modules/web-ifc/web-ifc.wasm", "public/wasm/web-ifc.wasm");
cpSync("node_modules/pdfjs-dist/standard_fonts", "public/pdfjs/standard_fonts", { recursive: true });
console.log("wasm do web-ifc e fontes do pdf.js copiados para public/");
