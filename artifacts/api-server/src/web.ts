import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";

/**
 * Serves the web app from the same address as the API, so there is one link to
 * open on any device. Development uses Vite's live-reload server; production
 * serves the built files.
 */
export async function attachWebApp(app: Express) {
  if (!config.isProduction) {
    const { createServer } = await import("vite");
    const vite = await createServer({ root: config.webRoot, server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
    return;
  }

  const dist = path.join(config.webRoot, "dist");
  if (!fs.existsSync(path.join(dist, "index.html"))) throw new Error(`Web app not built: ${dist} is missing. Run pnpm build.`);
  app.use("/assets", express.static(path.join(dist, "assets"), { immutable: true, maxAge: "1y" }));
  // Body-tracking model and runtime (about 30 MB): cache for a week so phones download them once.
  for (const dir of ["models", "mediapipe"]) {
    app.use(`/${dir}`, express.static(path.join(dist, dir), { maxAge: "7d" }), (_req, res) => void res.status(404).end());
  }
  app.use(express.static(dist, { index: false, maxAge: 0 }));
  app.get(/^(?!\/api(\/|$)).*/, (_req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(dist, "index.html"));
  });
}
