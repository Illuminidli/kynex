import type { SavePlanBody } from "@kynex/api-zod";
import { getDb, schema } from "@kynex/db";
import { getExercise } from "@kynex/motion";
import { and, asc, eq, inArray } from "drizzle-orm";
import { toSummary } from "../routes/library.ts";
import { today, weekdayOf } from "./time.ts";

const { clinicExerciseSettings, exercises, prescriptionItems, prescriptions, users } = schema;

type PlanInput = ReturnType<typeof SavePlanBody.parse>;

export type PlanDto = NonNullable<Awaited<ReturnType<typeof loadPlan>>>;
export type PlanItemDto = PlanDto["items"][number];

/** Is this plan item due on `day`? */
export function dueOn(plan: { startDate: string; endDate: string | null }, item: { weekdays: number[] }, day: string) {
  return day >= plan.startDate && (!plan.endDate || day <= plan.endDate) && item.weekdays.includes(weekdayOf(day));
}

/** A patient's plan with each exercise, or null if the doctor hasn't made one. */
export async function loadPlan(patientId: string, clinicId: string, day = today()) {
  const { db } = await getDb();
  const [plan] = await db
    .select({ p: prescriptions, updatedByName: users.displayName })
    .from(prescriptions)
    .leftJoin(users, eq(users.id, prescriptions.updatedBy))
    .where(eq(prescriptions.patientId, patientId));
  if (!plan) return null;
  const rows = await db
    .select({ item: prescriptionItems, exercise: exercises, hidden: clinicExerciseSettings.hidden })
    .from(prescriptionItems)
    .innerJoin(exercises, eq(exercises.id, prescriptionItems.exerciseId))
    .leftJoin(clinicExerciseSettings, and(eq(clinicExerciseSettings.exerciseId, exercises.id), eq(clinicExerciseSettings.clinicId, clinicId)))
    .where(eq(prescriptionItems.prescriptionId, plan.p.id))
    .orderBy(asc(prescriptionItems.sort));
  return {
    id: plan.p.id,
    startDate: plan.p.startDate,
    endDate: plan.p.endDate,
    note: plan.p.note,
    updatedAt: plan.p.updatedAt.toISOString(),
    updatedByName: plan.updatedByName ?? null,
    items: rows.map(({ item, exercise, hidden }) => ({
      id: item.id,
      exercise: toSummary({ exercise, hidden }),
      sets: item.sets,
      reps: item.reps,
      holdSeconds: item.holdSeconds,
      restSeconds: item.restSeconds,
      weekdays: item.weekdays,
      timesPerDay: item.timesPerDay,
      side: item.side,
      note: item.note,
      today: dueOn(plan.p, item, day),
    })),
  };
}

export class PlanProblem extends Error {}

const doseText = (i: { sets: number; reps: number | null; holdSeconds: number | null }) =>
  i.reps ? `${i.sets}×${i.reps}` : `${i.sets}×${i.holdSeconds}s`;

/**
 * Checks and saves a plan (replacing any earlier one). Returns a one-line description of what
 * changed, for the activity log. Throws PlanProblem with a message for the doctor.
 */
export async function savePlan(patientId: string, clinicId: string, byUserId: string, input: PlanInput): Promise<string> {
  if (input.endDate && input.endDate < input.startDate) throw new PlanProblem("The end date is before the start date.");
  const slugs = input.items.map((i) => i.exerciseSlug);
  if (new Set(slugs).size !== slugs.length) throw new PlanProblem("An exercise is in the plan twice. Use sets or times a day instead.");

  const { db } = await getDb();
  const found = await db
    .select({ exercise: exercises, hidden: clinicExerciseSettings.hidden })
    .from(exercises)
    .leftJoin(clinicExerciseSettings, and(eq(clinicExerciseSettings.exerciseId, exercises.id), eq(clinicExerciseSettings.clinicId, clinicId)))
    .where(inArray(exercises.slug, slugs));
  const bySlug = new Map(found.map((r) => [r.exercise.slug, r]));
  const before = await loadPlan(patientId, clinicId);
  const had = new Set(before?.items.map((i) => i.exercise.slug));

  const items = input.items.map((i, n) => {
    const row = bySlug.get(i.exerciseSlug);
    const def = getExercise(i.exerciseSlug);
    if (!row || !def) throw new PlanProblem(`There is no exercise called "${i.exerciseSlug}".`);
    if (row.hidden && !had.has(i.exerciseSlug)) throw new PlanProblem(`${row.exercise.content.name.en} is hidden in this clinic, so it can't be added.`);
    const reps = def.kind === "reps" ? i.reps : null;
    const holdSeconds = def.kind === "reps" ? null : i.holdSeconds;
    if (def.kind === "reps" && !reps) throw new PlanProblem(`Give the number of reps for ${def.name.en}.`);
    if (def.kind !== "reps" && !holdSeconds) throw new PlanProblem(`Give the hold time for ${def.name.en}.`);
    return {
      exerciseId: row.exercise.id,
      sort: n,
      sets: i.sets,
      reps,
      holdSeconds,
      restSeconds: i.restSeconds,
      weekdays: [...new Set(i.weekdays)].sort(),
      timesPerDay: i.timesPerDay,
      // Left / right only means something for one-side-at-a-time exercises.
      side: def.laterality === "unilateral" ? i.side : ("both" as const),
      note: i.note.trim(),
    };
  });

  await db.transaction(async (tx) => {
    const now = new Date();
    const [plan] = await tx
      .insert(prescriptions)
      .values({ clinicId, patientId, updatedBy: byUserId, startDate: input.startDate, endDate: input.endDate, note: input.note.trim() })
      .onConflictDoUpdate({
        target: prescriptions.patientId,
        set: { updatedBy: byUserId, startDate: input.startDate, endDate: input.endDate, note: input.note.trim(), updatedAt: now },
      })
      .returning({ id: prescriptions.id });
    await tx.delete(prescriptionItems).where(eq(prescriptionItems.prescriptionId, plan!.id));
    await tx.insert(prescriptionItems).values(items.map((i) => ({ ...i, prescriptionId: plan!.id })));
  });

  // What changed, in words.
  const name = (slug: string) => getExercise(slug)?.name.en ?? slug;
  if (!before) return `new plan with ${input.items.map((i) => `${name(i.exerciseSlug)} ${doseText(items[slugs.indexOf(i.exerciseSlug)]!)}`).join(", ")}`;
  const parts: string[] = [];
  const old = new Map(before.items.map((i) => [i.exercise.slug, i]));
  for (const [n, i] of items.entries()) {
    const slug = slugs[n]!;
    const was = old.get(slug);
    if (!was) parts.push(`added ${name(slug)} ${doseText(i)}`);
    else if (doseText(was) !== doseText(i) || was.weekdays.join() !== i.weekdays.join() || was.timesPerDay !== i.timesPerDay || was.side !== i.side || was.restSeconds !== i.restSeconds || was.note !== i.note) {
      parts.push(`changed ${name(slug)}${doseText(was) !== doseText(i) ? ` (${doseText(was)} → ${doseText(i)})` : ""}`);
    }
  }
  for (const slug of old.keys()) if (!slugs.includes(slug)) parts.push(`removed ${name(slug)}`);
  if (before.startDate !== input.startDate || before.endDate !== input.endDate) parts.push("changed the dates");
  if (before.note !== input.note.trim()) parts.push("changed the note");
  return parts.length ? parts.join("; ") : "saved with no changes";
}
