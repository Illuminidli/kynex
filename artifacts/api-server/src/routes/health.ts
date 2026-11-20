import { getHealthResponse } from "@kynex/api-zod";
import { pingDb } from "@kynex/db";
import { Router } from "express";
import { config } from "../config.ts";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const database = await pingDb();
  // Check our own answer against the contract, so the server can never drift from openapi.yaml.
  const body = getHealthResponse.parse({
    status: database.ok ? "ok" : "degraded",
    version: config.version,
    environment: config.isProduction ? "production" : "development",
    serverTime: new Date().toISOString(),
    database,
  });
  res.setHeader("Cache-Control", "no-store");
  res.status(database.ok ? 200 : 503).json(body);
});
