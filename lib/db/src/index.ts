import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema/index.ts";

export { schema };
export { USER_ROLES, type UserRole } from "./schema/users.ts";
export { VIDEO_STATUSES, type ExerciseContent, type LocalisedText, type VideoStatus } from "./schema/exercises.ts";
export { PLAN_SIDES, type PlanSide } from "./schema/care.ts";
export {
  FEELINGS,
  SESSION_STATUSES,
  type CheckIn,
  type ExerciseTarget,
  type Feeling,
  type SavedHold,
  type SavedRep,
  type SessionStatus,
} from "./schema/sessions.ts";
export {
  APPOINTMENT_STATUSES,
  VISIT_MODES,
  WAITLIST_STATUSES,
  type AppointmentStatus,
  type VisitMode,
  type WaitlistStatus,
} from "./schema/bookings.ts";
export type Db = NodePgDatabase<typeof schema>;
export type DbKind = "postgres" | "local-file";

interface Connection {
  db: Db;
  kind: DbKind;
  /** Applies any migration files in `folder` not yet applied (recorded in drizzle.__drizzle_migrations). */
  migrate: (folder: string) => Promise<void>;
  close: () => Promise<void>;
}

let connection: Promise<Connection> | undefined;

async function connect(): Promise<Connection> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const [{ drizzle }, pg] = await Promise.all([import("drizzle-orm/node-postgres"), import("pg")]);
    const pool = new pg.default.Pool({ connectionString: url, max: 10, idleTimeoutMillis: 30_000 });
    const db = drizzle(pool, { schema });
    return {
      db,
      kind: "postgres",
      migrate: async (folder) => (await import("drizzle-orm/node-postgres/migrator")).migrate(db, { migrationsFolder: folder }),
      close: () => pool.end(),
    };
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("DATABASE_URL is not set. Add a PostgreSQL database on Replit before deploying.");
  }
  // Local development only: a real Postgres engine compiled to WebAssembly,
  // stored in <repo>/.local-db so nothing needs installing.
  const [{ PGlite }, { drizzle }] = await Promise.all([import("@electric-sql/pglite"), import("drizzle-orm/pglite")]);
  const dir = process.env.LOCAL_DB_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.local-db");
  const client = new PGlite(dir);
  // Same query builder API as node-postgres, so the rest of the code never knows the difference.
  const local = drizzle(client, { schema });
  return {
    db: local as unknown as Db,
    kind: "local-file",
    migrate: async (folder) => (await import("drizzle-orm/pglite/migrator")).migrate(local, { migrationsFolder: folder }),
    close: () => client.close(),
  };
}

/** The shared database connection (created on first use). */
export function getDb(): Promise<Connection> {
  connection ??= connect();
  return connection;
}

export interface DbStatus {
  ok: boolean;
  kind: DbKind;
  latencyMs?: number;
  version?: string;
}

/** Round-trip check used by the health endpoint. Never throws. */
export async function pingDb(): Promise<DbStatus> {
  const kind: DbKind = process.env.DATABASE_URL ? "postgres" : "local-file";
  try {
    const { db } = await getDb();
    const started = performance.now();
    const result = await db.execute<{ version: string }>(sql`select current_setting('server_version') as version`);
    const latencyMs = Math.round((performance.now() - started) * 10) / 10;
    const version = result.rows[0]?.version?.split(" ")[0];
    return { ok: true, kind, latencyMs, ...(version ? { version } : {}) };
  } catch {
    return { ok: false, kind };
  }
}
