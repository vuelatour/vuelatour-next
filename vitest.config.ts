import { defineConfig } from "vitest/config";
import path from "node:path";

// Runner mínimo (8-sep-2026): tests PUROS de lib (sin DOM ni Next). Alias
// `@/` = src, igual que tsconfig.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
});
