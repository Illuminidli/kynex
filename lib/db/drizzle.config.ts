import { defineConfig } from "drizzle-kit";

// `pnpm --filter @kynex/db generate` writes SQL migration files to ./migrations.
// Migrations are reviewed in the pull request and logged in docs/DATABASE_SCHEMA.md.
// The server applies any new ones when it starts (each runs once, inside a
// transaction), so Replit never needs SQL typed in by hand.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
});
