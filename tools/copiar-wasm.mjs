// ADR-07: ativos binários servidos pelo próprio app, nunca de CDN.
// - web-ifc.wasm (monothread; ver src/bim/ifc.worker.ts; o -mt exigiria COOP/COEP)
// - fontes-padrão do pdf.js, para plantas em PDF com texto (ADR-14), e os decodificadores dele (JPEG 2000,
//   JBIG2 e cor ICC) para as imagens dos PDFs de apresentação (INC-19)
// - codificador H.264 em WebAssembly (minih264 + libmp4v2), para o MP4 compatível (ADR-16)
// - MediaPipe (recorte da apresentadora por IA, ADR-24): só carregado quando usado
import { cpSync, copyFileSync, mkdirSync } from "node:fs";
mkdirSync("public/wasm", { recursive: true });
copyFileSync("node_modules/web-ifc/web-ifc.wasm", "public/wasm/web-ifc.wasm");
cpSync("node_modules/pdfjs-dist/standard_fonts", "public/pdfjs/standard_fonts", { recursive: true });
mkdirSync("public/pdfjs/wasm", { recursive: true });
for (const f of ["openjpeg.wasm", "jbig2.wasm", "qcms_bg.wasm", "LICENSE_OPENJPEG", "LICENSE_JBIG2", "LICENSE_QCMS", "LICENSE_PDFJS_OPENJPEG", "LICENSE_PDFJS_JBIG2", "LICENSE_PDFJS_QCMS"])
  copyFileSync(`node_modules/pdfjs-dist/wasm/${f}`, `public/pdfjs/wasm/${f}`);
cpSync("node_modules/pdfjs-dist/iccs", "public/pdfjs/iccs", { recursive: true });
mkdirSync("public/vendor", { recursive: true });
copyFileSync("node_modules/h264-mp4-encoder/embuild/dist/h264-mp4-encoder.web.js", "public/vendor/h264-mp4-encoder.web.js");
copyFileSync("node_modules/h264-mp4-encoder/LICENSE.md", "public/vendor/h264-mp4-encoder.LICENSE.md");
mkdirSync("public/mediapipe/wasm", { recursive: true });
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"])
  copyFileSync(`node_modules/@mediapipe/tasks-vision/wasm/${f}`, `public/mediapipe/wasm/${f}`);
console.log("ativos copiados para public/ (wasm, fontes do pdf.js, codificador H.264, MediaPipe)");
