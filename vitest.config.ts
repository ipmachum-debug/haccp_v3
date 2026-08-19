import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // scripts/ 도 포함 — 마이그레이션/스키마 도구에도 회귀 테스트가 필요하다 (Issue #421)
    include: ["server/**/*.test.ts", "scripts/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
