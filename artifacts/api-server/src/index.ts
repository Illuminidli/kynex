import { createApp, errorHandler } from "./app.ts";
import { config } from "./config.ts";
import { listen } from "./listen.ts";
import { prepareDatabase } from "./setup.ts";
import { attachWebApp } from "./web.ts";

// Create or update the tables and test accounts before taking visitors. If the database
// can't be reached, still start, so the status page can show what's wrong.
try {
  await prepareDatabase();
} catch (err) {
  console.error("Database setup failed:", err);
}

const app = createApp();
await attachWebApp(app);
app.use(errorHandler);

try {
  await listen(app, config.port);
  console.log(`Kynex ${config.isProduction ? "production" : "development"} server on http://localhost:${config.port}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
