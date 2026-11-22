import { boolean, index, integer, jsonb, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clinics } from "./clinics.ts";
import { exercises } from "./exercises.ts";
import { prescriptionItems } from "./care.ts";
import { users } from "./users.ts";

export const SESSION_STATUSES = ["in-progress", "completed", "stopped", "red-flag"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export interface CheckIn {
  pain: number;
  /** Ids of red-flag questions answered yes (see the API's check-in questions). */
  redFlags: string[];
}

/** One exercise session done by a patient from their plan. */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The clinic day it counts for (India time), "YYYY-MM-DD". */
    day: text("day").notNull(),
    status: text("status").$type<SessionStatus>().notNull().default("in-progress"),
    checkIn: jsonb("check_in").$type<CheckIn>(),
    painAfter: integer("pain_after"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
  },
  (t) => [index("sessions_patient_day_idx").on(t.patientId, t.day), index("sessions_clinic_idx").on(t.clinicId, t.startedAt)],
);

export const FEELINGS = ["easy", "ok", "hard", "painful"] as const;
export type Feeling = (typeof FEELINGS)[number];

/** A rep as saved: the camera engine's record, plus which set it belongs to. Times are ms from the track start. */
export interface SavedRep {
  set: number;
  side: "left" | "right" | null;
  startMs: number;
  endMs: number;
  peak: number;
  progress: number;
  full: boolean;
  heldMs: number;
  faults: string[];
  quality: number;
}

export interface SavedHold {
  set: number;
  side: "left" | "right" | null;
  startMs: number;
  endMs: number;
  seconds: number;
  completed: boolean;
  best: number;
  faults: string[];
  quality: number;
}

/** What was asked for this exercise in this session (copied from the plan so later plan changes don't rewrite history). */
export interface ExerciseTarget {
  sets: number;
  reps: number | null;
  holdSeconds: number | null;
  side: "both" | "left" | "right";
  /** Camera thresholds used, for charts: metric value at rest, at target, and for a full rep. */
  rest: number | null;
  goal: number | null;
  unit: string;
}

/** The result of one exercise within a session. */
export const sessionExercises = pgTable(
  "session_exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    prescriptionItemId: uuid("prescription_item_id").references(() => prescriptionItems.id, { onDelete: "set null" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id),
    sort: integer("sort").notNull(),
    /** camera = counted by the camera; manual = tapped or timed by the patient. */
    mode: text("mode").$type<"camera" | "manual">().notNull(),
    /** done, or skipped / stopped part-way. */
    status: text("status").$type<"done" | "skipped" | "stopped">().notNull(),
    target: jsonb("target").$type<ExerciseTarget>().notNull(),
    setsDone: integer("sets_done").notNull(),
    repsFull: integer("reps_full").notNull().default(0),
    repsPartial: integer("reps_partial").notNull().default(0),
    holdsDone: integer("holds_done").notNull().default(0),
    /** Best range reached (metric units), camera mode only. */
    best: real("best"),
    /** Average form score 0-100, camera mode only. */
    quality: integer("quality"),
    feeling: text("feeling").$type<Feeling>(),
    reps: jsonb("reps").$type<SavedRep[]>().notNull().default([]),
    holds: jsonb("holds").$type<SavedHold[]>().notNull().default([]),
    faultCounts: jsonb("fault_counts").$type<Record<string, number>>().notNull().default({}),
    visibleRatio: real("visible_ratio"),
    /** The patient's phone kept a video of this exercise (the video itself never leaves the phone). */
    videoOnPhone: boolean("video_on_phone").notNull().default(false),
    durationSeconds: integer("duration_seconds").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("session_exercises_session_idx").on(t.sessionId)],
);

/**
 * The body movement of one exercise, as joint positions only (no picture): enough to replay it
 * as an animated figure. `data` is base64 of little-endian int16 millimetres, frame after frame,
 * x, y, z for each joint in `joints`, at `fps` frames a second.
 */
export const motionTracks = pgTable("motion_tracks", {
  sessionExerciseId: uuid("session_exercise_id")
    .primaryKey()
    .references(() => sessionExercises.id, { onDelete: "cascade" }),
  fps: integer("fps").notNull(),
  joints: integer("joints").array().notNull(),
  frames: integer("frames").notNull(),
  data: text("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A symptom the patient reported: at the check-in, during a session, or from the home page. */
export const symptomReports = pgTable(
  "symptom_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "set null" }),
    source: text("source").$type<"check-in" | "session" | "home">().notNull(),
    pain: integer("pain"),
    redFlags: text("red_flags").array().notNull().default([]),
    text: text("text").notNull().default(""),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id, { onDelete: "set null" }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("symptom_reports_patient_idx").on(t.patientId)],
);
