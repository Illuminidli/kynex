import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { clinics } from "./clinics.ts";
import { users } from "./users.ts";

export interface LocalisedText {
  en: string;
  hi: string;
}

/** The words of an exercise, in English and Hindi. Kept as one JSON value so M7 can version it as a whole. */
export interface ExerciseContent {
  name: LocalisedText;
  summary: LocalisedText;
  setup: LocalisedText;
  steps: LocalisedText[];
  precautions: LocalisedText[];
  tags: string[];
  dose: { sets: number; reps?: number; holdSeconds?: number; restSeconds: number };
}

/** Video approval status, checked by the API. M7 adds the videos themselves. */
export const VIDEO_STATUSES = ["none", "draft", "approved"] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

/**
 * The exercise library, shared by every clinic. Rows are copied from the camera
 * engine (lib/motion) when the server starts; `slug` is the engine's exercise id,
 * which links a row to its camera rules.
 */
export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    region: text("region").notNull(),
    position: text("position").notNull(),
    view: text("view").notNull(),
    kind: text("kind").notNull(),
    laterality: text("laterality").notNull(),
    content: jsonb("content").$type<ExerciseContent>().notNull(),
    /** How far the camera thresholds are proven: draft, lab-tested, clinician-reviewed. */
    calibration: text("calibration").notNull(),
    videoStatus: text("video_status").$type<VideoStatus>().notNull().default("none"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("exercises_region_idx").on(t.region)],
);

/** A clinic's own choices about a library exercise. Phase 1: hidden or not. */
export const clinicExerciseSettings = pgTable(
  "clinic_exercise_settings",
  {
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
    /** Hidden exercises can't be added to new plans in this clinic. */
    hidden: boolean("hidden").notNull().default(false),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.clinicId, t.exerciseId] })],
);
