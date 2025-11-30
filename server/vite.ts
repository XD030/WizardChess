// server/vite.ts
import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import { nanoid } from "nanoid";
import viteConfig from "../vite.config";
import { fileURLToPath } from "url";

// ---------- ESM 版 __dirname ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 專案根目錄: WizardChess/
const projectRoot = path.resolve(__dirname, "..", "..");

// ---------- 共用 logger ----------
const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

// ---------- 開發模式：掛載 Vite 中介軟體 ----------
export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      // 用「專案根目錄」去找原始的 client/index.html
      const clientTemplate = path.resolve(projectRoot, "client", "index.html");

      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );

      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

// ---------- 正式環境：提供靜態檔案 ----------
export function serveStatic(app: Express) {
  // 兩種候選路徑：
  // 1. npm run build 用 root: "client", outDir: "../dist/client"
  const candidateA = path.resolve(projectRoot, "dist", "client");
  // 2. 舊版：client 裡面自己 build 到 client/dist
  const candidateB = path.resolve(projectRoot, "client", "dist");

  const candidates = [candidateA, candidateB];

  // 找第一個存在的路徑
  const distPath = candidates.find((p) => fs.existsSync(p));

  if (!distPath) {
    throw new Error(
      `Could not find the client build directory.\nTried:\n${candidates
        .map((p) => "  - " + p)
        .join("\n")}\n\nMake sure to run "npm run build" (會同時 build client 跟 server)。`
    );
  }

  // 提供靜態檔案
  app.use(express.static(distPath));

  // 找不到檔案時，一律回傳 index.html（SPA）
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
