import { getDb } from "@kynex/db";
import { ensureTestAccounts } from "./auth/test-accounts.ts";
import { config } from "./config.ts";

/** Brings the database up to date (new tables from lib/db/migrations), then makes sure the test accounts exist. */
export async function prepareDatabase() {
  const { migrate } = await getDb();
  await migrate(config.migrationsFolder);
  await ensureTestAccounts(process.env.DEMO_PASSWORD);
}
