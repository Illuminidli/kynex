import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clinics } from "./clinics.ts";
import { users } from "./users.ts";

/**
 * One row per signed-in device. The browser holds a random token in a secure
 * cookie; only its SHA-256 hash is stored here, so a database leak can't be
 * used to sign in. Deleting the row signs that device out.
 */
export const loginSessions = pgTable(
  "login_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("login_sessions_user_idx").on(t.userId)],
);
