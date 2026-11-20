import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clinics } from "./clinics.ts";

/** Roles, checked by the API (text column, not a Postgres enum, so adding one needs no migration). */
export const USER_ROLES = ["patient", "clinician", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Everyone who can sign in: patients, clinicians and admins. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    /** Always stored lower-case. */
    email: text("email").notNull().unique(),
    displayName: text("display_name").notNull(),
    role: text("role").$type<UserRole>().notNull(),
    /** scrypt hash: "scrypt$<salt>$<hash>" (never the password itself). */
    passwordHash: text("password_hash").notNull(),
    /** Wrong passwords in a row; 5 locks the account for 15 minutes. */
    failedSignIns: integer("failed_sign_ins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastSignInAt: timestamp("last_sign_in_at", { withTimezone: true }),
    /** When the account was created or last reset by an admin to start the journey again. */
    freshSince: timestamp("fresh_since", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("users_clinic_idx").on(t.clinicId)],
);
