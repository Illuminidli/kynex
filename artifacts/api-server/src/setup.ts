import { getDb } from "@kynex/db";
import { ensureTestAccounts } from "./auth/test-accounts.ts";
import { config } from "./config.ts";
import { syncExerciseLibrary } from "./library/sync.ts";

/**
 * Brings the database up to date (new tables from lib/db/migrations), copies the camera
 * engine's exercises into the library, then makes sure the test accounts exist.
 *
 * Each step runs even if an earlier one failed, and each says plainly in the log whether it
 * worked, so one problem can't silently leave the library or the accounts empty.
 * Throws at the end if any step failed.
 */
export async function prepareDatabase() {
  const failed: string[] = [];
  const step = async (name: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (err) {
      failed.push(name);
      console.error(`Start-up step failed: ${name}.`, err);
    }
  };

  await step("database update (migrations)", async () => {
    const { migrate } = await getDb();
    await migrate(config.migrationsFolder);
    console.log("Database up to date.");
  });
  await step("exercise library", async () => {
    const count = await syncExerciseLibrary();
    console.log(`Exercise library ready (${count} exercises).`);
  });
  await step("test accounts", () => ensureTestAccounts(process.env.DEMO_PASSWORD));

  if (failed.length) throw new Error(`Start-up steps failed: ${failed.join(", ")}`);
}
