import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "path";
import { defineConfig } from "vite";


const plugins = [react(), tailwindcss()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      // jspdf references html2canvas via a dynamic import inside .html(),
      // which we never call. Stub it out so Rollup can resolve the import
      // without bundling the 100KB+ html2canvas package.
      "html2canvas": path.resolve(
        import.meta.dirname,
        "client",
        "src",
        "lib",
        "html2canvas-stub.ts"
      ),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Cache-bust: 빌드 버전을 파일명에 포함시켜 캐시 오염 방지
        chunkFileNames: "assets/[name]-[hash]-b3.js",
        assetFileNames: "assets/[name]-[hash]-b3[extname]",
        entryFileNames: "assets/[name]-[hash]-b3.js",
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // React 코어 (가장 기본)
            if (id.includes("react-dom") || id.includes("/react/")) return "vendor-react";
            // Radix UI 컴포넌트
            if (id.includes("@radix-ui")) return "vendor-ui";
            // Excel/PDF 대형 라이브러리 (독립적)
            if (id.includes("exceljs") || id.includes("node_modules/xlsx")) return "vendor-excel";
            if (id.includes("jspdf") || id.includes("pdfkit")) return "vendor-pdf";
            // ⚠️ 주의: recharts/d3/mermaid는 d3-* 공유 의존성 때문에 분리하지 않음
            //   (분리 시 circular chunk 발생: vendor-editor ↔ vendor-charts)
            //   Vite가 자동으로 적절히 처리하도록 기본 청크에 맡김
          }
        },
      },
    },
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
