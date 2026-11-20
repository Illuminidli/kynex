import type { ExerciseDefinition, Region } from "../types.ts";
import { lowerExercises } from "./lower.ts";
import { neckUpperExercises } from "./neck-upper.ts";
import { spineExercises } from "./spine.ts";

/** The full exercise catalogue, in display order. */
export const EXERCISES: readonly ExerciseDefinition[] = [...neckUpperExercises, ...spineExercises, ...lowerExercises];

const byId = new Map(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string): ExerciseDefinition | undefined {
  return byId.get(id);
}

export const REGION_LABELS: Record<Region, { en: string; hi: string }> = {
  neck: { en: "Neck", hi: "गर्दन" },
  shoulder: { en: "Shoulder", hi: "कंधा" },
  elbow: { en: "Elbow", hi: "कोहनी" },
  spine: { en: "Spine", hi: "रीढ़" },
  hip: { en: "Hip", hi: "कूल्हा" },
  knee: { en: "Knee", hi: "घुटना" },
  ankle: { en: "Ankle", hi: "टखना" },
  balance: { en: "Balance", hi: "संतुलन" },
  core: { en: "Core", hi: "कोर" },
};
