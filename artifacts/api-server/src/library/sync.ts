import { getDb, schema, type ExerciseContent } from "@kynex/db";
import { EXERCISES, type ExerciseDefinition } from "@kynex/motion";
import { sql } from "drizzle-orm";

const { exercises } = schema;

/** The words and facts of an exercise as stored in the library. */
export function contentOf(def: ExerciseDefinition): ExerciseContent {
  return {
    name: def.name,
    summary: def.summary,
    setup: def.setup,
    steps: def.steps,
    precautions: def.precautions,
    tags: def.tags,
    dose: def.dose,
  };
}

/**
 * Copies every camera-engine exercise into the library. New exercises are added;
 * existing rows get the engine's latest wording and calibration status. Rows are
 * never deleted, so later plans keep working if an exercise leaves the engine.
 * Until M7 adds editing, the engine is the only source of exercise wording.
 */
export async function syncExerciseLibrary(): Promise<number> {
  const { db } = await getDb();
  const rows = EXERCISES.map((def) => ({
    slug: def.id,
    region: def.region,
    position: def.position,
    view: def.view,
    kind: def.kind,
    laterality: def.laterality,
    content: contentOf(def),
    calibration: def.calibration,
  }));
  await db
    .insert(exercises)
    .values(rows)
    .onConflictDoUpdate({
      target: exercises.slug,
      set: {
        region: sql`excluded.region`,
        position: sql`excluded.position`,
        view: sql`excluded.view`,
        kind: sql`excluded.kind`,
        laterality: sql`excluded.laterality`,
        content: sql`excluded.content`,
        calibration: sql`excluded.calibration`,
        // Only touch updated_at when something really changed.
        updatedAt: sql`case when ${exercises.content} is distinct from excluded.content
          or ${exercises.calibration} is distinct from excluded.calibration then now() else ${exercises.updatedAt} end`,
      },
    });
  return rows.length;
}
