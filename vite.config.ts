import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/** Carimbo da versão publicada: DDMMAAAA-HHMM no horário de Fortaleza, fixado no momento do build. */
function carimboDaVersao(d = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}${p.month}${p.year}-${p.hour}${p.minute}`;
}

// BASE permite publicar num subcaminho, ex.: BASE=/dani/ npm run build (GitHub Pages)
export default defineConfig(({ command }) => ({
  base: process.env.BASE ?? "./",
  plugins: [react()],
  worker: { format: "es" },
  // no servidor de desenvolvimento não há versão publicada
  // VERSAO_PUBLICADA vem do workflow do Pages, para o carimbo e o nome index-DDMMAAAA-HHMM.html baterem
  define: { __VERSAO_PUBLICADA__: JSON.stringify(command === "build" ? process.env.VERSAO_PUBLICADA || carimboDaVersao() : "local") },
  test: { include: ["tests/**/*.test.ts"], environment: "node", testTimeout: 60_000 },
}));
