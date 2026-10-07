// ADR-07: os .wasm do web-ifc são servidos pelo próprio app (public/wasm), nunca de CDN.
// Só a versão monothread (ver src/bim/ifc.worker.ts); a -mt exigiria cabeçalhos COOP/COEP.
import { copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public/wasm", { recursive: true });
copyFileSync("node_modules/web-ifc/web-ifc.wasm", "public/wasm/web-ifc.wasm");
console.log("wasm do web-ifc copiado para public/wasm/");
