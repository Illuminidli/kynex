import { getDb } from "@kynex/db";
import { ensureTestAccounts } from "./auth/test-accounts.ts";
import { config } from "./config.ts";
import { syncExerciseLibrary } from "./library/sync.ts";

/**
 * Brings the database up to date (new tables from lib/db/migrations), copies the camera
 * engine's exercises into the library, then makes sure the test accounts exist.
 */
export async function prepareDatabase() {
  const { migrate } = await getDb();
  await migrate(config.migrationsFolder);
  const count = await syncExerciseLibrary();
  console.log(`Exercise library ready (${count} exercises).`);
  await ensureTestAccounts(process.env.DEMO_PASSWORD);
}
