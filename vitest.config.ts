import { defineConfig } from "vitest/config";
import path from "node:path";

// Runner mínimo (8-sep-2026): tests PUROS de lib (sin DOM ni Next) y tests
// de ESTRUCTURA con `react-dom/server` (la hoja editable vs el HTML del
// PDF). Alias `@/` = src, igual que tsconfig. Los `.css` importados por los
// componentes se resuelven vacíos (no se procesan).
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  esbuild: { jsx: "automatic" },
  test: {
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    environment: "node",
    css: false,
  },
});
