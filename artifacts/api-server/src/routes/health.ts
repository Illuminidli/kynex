import { GetHealthResponse } from "@kynex/api-zod";
import { getDb, pingDb, schema } from "@kynex/db";
import { count } from "drizzle-orm";
import { Router } from "express";
import { config } from "../config.ts";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const database = await pingDb();
  const testAccounts = database.ok ? await countAccounts() : 0;
  // Check our own answer against the contract, so the server can never drift from openapi.yaml.
  const body = GetHealthResponse.parse({
    status: database.ok ? "ok" : "degraded",
    version: config.version,
    environment: config.isProduction ? "production" : "development",
    serverTime: new Date().toISOString(),
    database,
    testAccounts,
  });
  res.setHeader("Cache-Control", "no-store");
  res.status(database.ok ? 200 : 503).json(body);
});

async function countAccounts(): Promise<number> {
  try {
    const { db } = await getDb();
    const [row] = await db.select({ n: count() }).from(schema.users);
    return row?.n ?? 0;
  } catch {
    return 0; // tables not created yet
  }
}
