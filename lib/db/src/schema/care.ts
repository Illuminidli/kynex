import { date, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clinics } from "./clinics.ts";
import { exercises } from "./exercises.ts";
import { users } from "./users.ts";

/** Which doctor looks after which patient (phase 1: one doctor per patient). */
export const careTeams = pgTable(
  "care_teams",
  {
    patientId: uuid("patient_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    clinicianId: uuid("clinician_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("care_teams_clinician_idx").on(t.clinicianId)],
);

/** A patient's exercise plan. One per patient; every change is recorded in `activity`. */
export const prescriptions = pgTable("prescriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  clinicId: uuid("clinic_id")
    .notNull()
    .references(() => clinics.id),
  patientId: uuid("patient_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Who last changed the plan. */
  updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  /** Clinic dates (India time), "YYYY-MM-DD". */
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const PLAN_SIDES = ["both", "left", "right"] as const;
export type PlanSide = (typeof PLAN_SIDES)[number];

/** One exercise in a plan, with its dose and schedule. */
export const prescriptionItems = pgTable(
  "prescription_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    prescriptionId: uuid("prescription_id")
      .notNull()
      .references(() => prescriptions.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id),
    sort: integer("sort").notNull(),
    sets: integer("sets").notNull(),
    /** Reps per set (rep exercises) or seconds per hold (hold exercises); the other is null. */
    reps: integer("reps"),
    holdSeconds: integer("hold_seconds"),
    restSeconds: integer("rest_seconds").notNull(),
    /** Days of the week it is done, 0 = Sunday ... 6 = Saturday. */
    weekdays: integer("weekdays").array().notNull(),
    timesPerDay: integer("times_per_day").notNull().default(1),
    side: text("side").$type<PlanSide>().notNull().default("both"),
    note: text("note").notNull().default(""),
  },
  (t) => [index("prescription_items_plan_idx").on(t.prescriptionId)],
);

/** Doctor's notes about a patient. */
export const patientNotes = pgTable(
  "patient_notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("patient_notes_patient_idx").on(t.patientId)],
);

/**
 * Everything that happens with a patient, newest first: plan changes, sessions, check-ins,
 * symptom reports, bookings, reviews. It is both the audit trail (who did what, when) and the
 * admin's activity feed. Rows are only ever added.
 */
export const activity = pgTable(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    patientId: uuid("patient_id").references(() => users.id, { onDelete: "cascade" }),
    /** e.g. plan.changed, session.completed, booking.cancelled (see ACTIVITY_KINDS in the API). */
    kind: text("kind").notNull(),
    /** One plain sentence for the feed. */
    summary: text("summary").notNull(),
    detail: jsonb("detail").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_clinic_time_idx").on(t.clinicId, t.createdAt), index("activity_patient_idx").on(t.patientId)],
);
