// ADR-07: ativos binários servidos pelo próprio app, nunca de CDN.
// - web-ifc.wasm (monothread; ver src/bim/ifc.worker.ts; o -mt exigiria COOP/COEP)
// - fontes-padrão do pdf.js, para plantas em PDF com texto (ADR-14)
// - codificador H.264 em WebAssembly (minih264 + libmp4v2), para o MP4 compatível (ADR-16)
// - MediaPipe (recorte da apresentadora por IA, ADR-24): só carregado quando usado
import { cpSync, copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public/wasm", { recursive: true });
copyFileSync("node_modules/web-ifc/web-ifc.wasm", "public/wasm/web-ifc.wasm");
cpSync("node_modules/pdfjs-dist/standard_fonts", "public/pdfjs/standard_fonts", { recursive: true });
mkdirSync("public/vendor", { recursive: true });
copyFileSync("node_modules/h264-mp4-encoder/embuild/dist/h264-mp4-encoder.web.js", "public/vendor/h264-mp4-encoder.web.js");
copyFileSync("node_modules/h264-mp4-encoder/LICENSE.md", "public/vendor/h264-mp4-encoder.LICENSE.md");
mkdirSync("public/mediapipe/wasm", { recursive: true });
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"])
  copyFileSync(`node_modules/@mediapipe/tasks-vision/wasm/${f}`, `public/mediapipe/wasm/${f}`);
console.log("ativos copiados para public/ (wasm, fontes do pdf.js, codificador H.264, MediaPipe)");
