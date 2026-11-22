import {
  GetExerciseParams,
  GetExerciseResponse,
  ListExercisesResponse,
  SetExerciseVisibilityBody,
  SetExerciseVisibilityParams,
  SetExerciseVisibilityResponse,
} from "@kynex/api-zod";
import { getDb, schema } from "@kynex/db";
import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { requireRole } from "../auth/sessions.ts";

const { clinicExerciseSettings, exercises } = schema;

/** Body areas in head-to-toe order, so the library reads naturally. */
const REGION_ORDER = ["neck", "shoulder", "elbow", "spine", "core", "hip", "knee", "ankle", "balance"];

export const libraryRouter = Router();
libraryRouter.use("/exercises", requireRole("clinician", "admin"));

/** Every exercise with this clinic's hidden flag, optionally just one. */
export async function selectWithSettings(clinicId: string, slug?: string) {
  const { db } = await getDb();
  return db
    .select({ exercise: exercises, hidden: clinicExerciseSettings.hidden })
    .from(exercises)
    .leftJoin(
      clinicExerciseSettings,
      and(eq(clinicExerciseSettings.exerciseId, exercises.id), eq(clinicExerciseSettings.clinicId, clinicId)),
    )
    .where(slug === undefined ? undefined : eq(exercises.slug, slug));
}

export type Row = { exercise: typeof exercises.$inferSelect; hidden: boolean | null };

export function toSummary({ exercise: e, hidden }: Row) {
  return {
    slug: e.slug,
    name: e.content.name,
    summary: e.content.summary,
    region: e.region,
    position: e.position,
    view: e.view,
    kind: e.kind,
    laterality: e.laterality,
    calibration: e.calibration,
    videoStatus: e.videoStatus,
    hidden: hidden ?? false,
  };
}

libraryRouter.get("/exercises", async (req, res) => {
  const rows = await selectWithSettings(req.user!.clinicId);
  const rank = (r: Row) => REGION_ORDER.indexOf(r.exercise.region);
  rows.sort((a, b) => rank(a) - rank(b) || a.exercise.content.name.en.localeCompare(b.exercise.content.name.en));
  res.setHeader("Cache-Control", "no-store");
  res.json(ListExercisesResponse.parse({ exercises: rows.map(toSummary) }));
});

libraryRouter.get("/exercises/:slug", async (req, res) => {
  const params = GetExerciseParams.safeParse(req.params);
  if (!params.success) return void res.status(404).json({ error: "No exercise with that name." });
  const [row] = await selectWithSettings(req.user!.clinicId, params.data.slug);
  if (!row) return void res.status(404).json({ error: "No exercise with that name." });
  const c = row.exercise.content;
  res.setHeader("Cache-Control", "no-store");
  res.json(
    GetExerciseResponse.parse({
      ...toSummary(row),
      setup: c.setup,
      steps: c.steps,
      precautions: c.precautions,
      tags: c.tags,
      dose: c.dose,
    }),
  );
});

libraryRouter.put("/admin/exercises/:slug/visibility", requireRole("admin"), async (req, res) => {
  const params = SetExerciseVisibilityParams.safeParse(req.params);
  if (!params.success) return void res.status(404).json({ error: "No exercise with that name." });
  const body = SetExerciseVisibilityBody.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Say whether the exercise should be hidden (true or false)." });
  const { db } = await getDb();
  const [exercise] = await db.select().from(exercises).where(eq(exercises.slug, params.data.slug));
  if (!exercise) return void res.status(404).json({ error: "No exercise with that name." });
  const now = new Date();
  await db
    .insert(clinicExerciseSettings)
    .values({ clinicId: req.user!.clinicId, exerciseId: exercise.id, hidden: body.data.hidden, updatedBy: req.user!.id })
    .onConflictDoUpdate({
      target: [clinicExerciseSettings.clinicId, clinicExerciseSettings.exerciseId],
      set: { hidden: body.data.hidden, updatedBy: req.user!.id, updatedAt: now },
    });
  res.json(SetExerciseVisibilityResponse.parse(toSummary({ exercise, hidden: body.data.hidden })));
});
