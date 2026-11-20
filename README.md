# Kynex

Camera-based rehab platform: patient app, clinic dashboard and calibration lab, sharing one database.

- What every screen does, the plan, decisions and progress: the **Kynex Google Sheet** ("Kynex – How the app works & progress tracker").
- How the code is organised and secured: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
- Database tables and migrations: [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md).

## Run on Replit (the shared link)

1. On replit.com: **Create App → Import from GitHub →** choose `Illuminidli/kynex`.
2. In the project, open **Database** (or Tools → Database) and create a **PostgreSQL** database. Replit adds the `DATABASE_URL` secret automatically.
3. Press **Run**. The preview shows "Kynex is running" with three green ticks. Open the preview's https link on your phone too.
4. When Replit asks about publishing/deploying: optional for now. Check the price it shows before confirming.

To get new changes: merge the pull request on GitHub, then in the Replit **Shell** run
`git fetch origin` and `git reset --hard origin/main` (makes Replit match GitHub exactly), and press Run again.

Test accounts (M1): add a secret **DEMO_PASSWORD** (10+ characters, your choice) in Replit → Secrets, then Run.
Sign in as `admin@kynex.test`, `clinician1@kynex.test` or `patient1@kynex.test` (… `patient5`) with that password.
`/status` shows whether the accounts are ready.

## Run on this laptop

Needs Node 22.18+ and pnpm (`corepack enable`).

```
pnpm install
pnpm dev          # http://localhost:3000, uses a local test database in .local-db/
pnpm check        # type checks, tests and production build (same as GitHub Checks)
```

After changing `lib/api-spec/openapi.yaml`, run `pnpm codegen`.

## How changes are made

One module or fix per branch → pull request → GitHub Checks must be green → you merge → pull on Replit.
