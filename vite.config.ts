// client/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: true,
  },
});


// ⭐ 這三行取代 __dirname，完全符合 ESM 規範
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],

  root: "client",

  build: {
    outDir: "../dist/client",
  },

  resolve: {
    alias: [
      {
        // 例如 import xxx from "@/utils/xxx"
        find: "@",
        replacement: path.resolve(__dirname, "src"),
      },
      {
        // 例如 import xxx from "@/components/Button"
        find: "@/",
        replacement: path.resolve(__dirname, "src") + "/",
      },
    ],
  },
});
