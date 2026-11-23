import { getDb, schema } from "@kynex/db";
import { getExercise } from "@kynex/motion";
import { and, asc, desc, eq, inArray, isNotNull, lt, ne } from "drizzle-orm";
import { toSummary } from "../routes/library.ts";

const { exercises, motionTracks, sessionExercises, sessions, users } = schema;

type SessionRowDb = typeof sessions.$inferSelect;
type ExerciseRowDb = typeof sessionExercises.$inferSelect;

const problemsOf = (e: Pick<ExerciseRowDb, "reps" | "holds">) =>
  e.reps.filter((r) => r.faults.length > 0).length + e.holds.filter((h) => h.faults.length > 0).length;

function average(xs: number[]): number | null {
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

/** One line per session, for lists. */
export async function sessionRows(sessionList: SessionRowDb[]) {
  if (!sessionList.length) return [];
  const { db } = await getDb();
  const results = await db
    .select()
    .from(sessionExercises)
    .where(
      inArray(
        sessionExercises.sessionId,
        sessionList.map((s) => s.id),
      ),
    );
  return sessionList.map((s) => {
    const mine = results.filter((r) => r.sessionId === s.id);
    return {
      id: s.id,
      day: s.day,
      startedAt: s.startedAt.toISOString(),
      status: s.status,
      exercises: mine.length,
      repsFull: mine.reduce((a, r) => a + r.repsFull, 0),
      repsPartial: mine.reduce((a, r) => a + r.repsPartial, 0),
      holds: mine.reduce((a, r) => a + r.holdsDone, 0),
      quality: average(mine.map((r) => r.quality).filter((q): q is number => q !== null)),
      painBefore: s.checkIn?.pain ?? null,
      painAfter: s.painAfter,
      problems: mine.reduce((a, r) => a + problemsOf(r), 0),
      reviewed: s.reviewedAt !== null,
    };
  });
}
export type SessionRowDto = Awaited<ReturnType<typeof sessionRows>>[number];

/** The full report of one session. */
export async function sessionReport(sessionId: string, clinicId: string) {
  const { db } = await getDb();
  const [row] = await db
    .select({ s: sessions, patientName: users.displayName })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.patientId))
    .where(and(eq(sessions.id, sessionId), eq(sessions.clinicId, clinicId)));
  if (!row) return null;
  const s = row.s;
  const results = await db
    .select({ r: sessionExercises, exercise: exercises, track: motionTracks.sessionExerciseId })
    .from(sessionExercises)
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .leftJoin(motionTracks, eq(motionTracks.sessionExerciseId, sessionExercises.id))
    .where(eq(sessionExercises.sessionId, s.id))
    .orderBy(asc(sessionExercises.sort), asc(sessionExercises.createdAt));

  let reviewerName: string | null = null;
  if (s.reviewedBy) {
    const [r] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, s.reviewedBy));
    reviewerName = r?.name ?? null;
  }

  const exercisesOut = [];
  for (const { r, exercise, track } of results) {
    // Best reached in the patient's previous session with the same exercise, for "better than last time".
    const [prev] = await db
      .select({ best: sessionExercises.best })
      .from(sessionExercises)
      .innerJoin(sessions, eq(sessions.id, sessionExercises.sessionId))
      .where(
        and(
          eq(sessions.patientId, s.patientId),
          eq(sessionExercises.exerciseId, r.exerciseId),
          isNotNull(sessionExercises.best),
          lt(sessions.startedAt, s.startedAt),
          ne(sessions.id, s.id),
        ),
      )
      .orderBy(desc(sessions.startedAt))
      .limit(1);
    const def = getExercise(exercise.slug);
    exercisesOut.push({
      id: r.id,
      exercise: toSummary({ exercise, hidden: false }),
      mode: r.mode,
      status: r.status,
      target: r.target,
      setsDone: r.setsDone,
      repsFull: r.repsFull,
      repsPartial: r.repsPartial,
      holdsDone: r.holdsDone,
      best: r.best,
      previousBest: prev?.best ?? null,
      quality: r.quality,
      feeling: r.feeling,
      feedbackTags: r.feedbackTags ?? [],
      feedbackNote: r.feedbackNote ?? null,
      reps: r.reps,
      holds: r.holds,
      faults: Object.entries(r.faultCounts)
        .filter(([, n]) => n > 0)
        .map(([id, count]) => {
          const rule = def?.faults.find((f) => f.id === id);
          return { id, count, message: rule?.message ?? { en: id, hi: id }, severity: rule?.severity ?? ("minor" as const) };
        }),
      visibleRatio: r.visibleRatio,
      videoOnPhone: r.videoOnPhone,
      hasTrack: track !== null,
      durationSeconds: r.durationSeconds,
    });
  }

  return {
    id: s.id,
    patient: { id: s.patientId, displayName: row.patientName },
    day: s.day,
    startedAt: s.startedAt.toISOString(),
    endedAt: s.endedAt?.toISOString() ?? null,
    status: s.status,
    checkIn: s.checkIn,
    painAfter: s.painAfter,
    comment: s.comment ?? null,
    review: s.reviewedAt ? { at: s.reviewedAt.toISOString(), byName: reviewerName, note: s.reviewNote ?? "" } : null,
    exercises: exercisesOut,
    totals: {
      repsFull: exercisesOut.reduce((a, e) => a + e.repsFull, 0),
      repsPartial: exercisesOut.reduce((a, e) => a + e.repsPartial, 0),
      holds: exercisesOut.reduce((a, e) => a + e.holdsDone, 0),
      quality: average(exercisesOut.map((e) => e.quality).filter((q): q is number => q !== null)),
      problems: results.reduce((a, { r }) => a + problemsOf(r), 0),
    },
  };
}
