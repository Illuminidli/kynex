import { defineConfig } from "drizzle-kit";

// `pnpm --filter @kynex/db generate` writes SQL migration files to ./migrations.
// As in Spotter, migrations are reviewed, logged in docs/DATABASE_SCHEMA.md and
// run by hand on Replit; nothing changes the live database automatically.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
});
