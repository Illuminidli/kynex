import { pingDb } from "@kynex/db";
import { createApp, errorHandler } from "./app.ts";
import { config } from "./config.ts";
import { attachWebApp } from "./web.ts";

// Open the database connection at start-up rather than on the first visitor's request.
void pingDb();

const app = createApp();
await attachWebApp(app);
app.use(errorHandler);

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Kynex ${config.isProduction ? "production" : "development"} server on http://localhost:${config.port}`);
});
