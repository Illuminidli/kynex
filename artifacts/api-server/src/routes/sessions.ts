import {
  FinishSessionBody,
  FinishSessionParams,
  FinishSessionResponse,
  GetMotionTrackParams,
  GetMotionTrackResponse,
  GetSessionParams,
  GetSessionResponse,
  GetTodayResponse,
  ListMySessionsResponse,
  ReviewSessionBody,
  ReviewSessionParams,
  ReviewSessionResponse,
  SaveSessionExerciseBody,
  SaveSessionExerciseParams,
  SaveSessionExerciseResponse,
  StartSessionBody,
  StartSessionResponse,
} from "@kynex/api-zod";
import { getDb, schema, type ExerciseTarget } from "@kynex/db";
import { getExercise } from "@kynex/motion";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { Router, type Request } from "express";
import { requireRole } from "../auth/sessions.ts";
import { expireOffers, loadWaitlist, nextAppointment } from "../bookings/rules.ts";
import { logActivity } from "../care/activity.ts";

/** Plain words for the quick feedback reasons (activity feed). */
const FEEDBACK_WORDS: Record<string, string> = {
  unclear: "didn't understand the exercise",
  "not-counted": "the app didn't count properly",
  "not-seen": "the camera couldn't see them",
  hurt: "it hurt",
  "too-easy": "too easy",
  "too-hard": "too hard",
};
import { patientFor } from "../care/access.ts";
import { plannedOn, RED_FLAG_WORDS } from "../care/insights.ts";
import { loadPlan } from "../care/plans.ts";
import { sessionReport, sessionRows } from "../care/reports.ts";
import { clock, describeDay, today } from "../care/time.ts";

const { exercises, motionTracks, prescriptionItems, prescriptions, sessionExercises, sessions, symptomReports, waitlist } = schema;

export const sessionsRouter = Router();
const NO_SESSION = { error: "No such session." };

/* ------------------------------------------------------------------ patient */

sessionsRouter.get("/me/today", requireRole("patient"), async (req, res) => {
  const me = req.user!;
  const day = today();
  const { db } = await getDb();
  const plan = await loadPlan(me.id, me.clinicId, day);
  const todays = await db.select().from(sessions).where(and(eq(sessions.patientId, me.id), eq(sessions.day, day))).orderBy(desc(sessions.startedAt));
  const open = todays.find((s) => s.status === "in-progress");
  const done = open
    ? await db.select({ itemId: sessionExercises.prescriptionItemId }).from(sessionExercises).where(eq(sessionExercises.sessionId, open.id))
    : [];
  const [last] = await db.select().from(sessions).where(and(eq(sessions.patientId, me.id), isNotNull(sessions.endedAt))).orderBy(desc(sessions.startedAt)).limit(1);
  await expireOffers(me.clinicId);
  res.setHeader("Cache-Control", "no-store");
  res.json(
    GetTodayResponse.parse({
      day,
      hasPlan: !!plan,
      plan,
      timesPerDay: plannedOn(plan, day),
      sessionsDoneToday: todays.filter((s) => s.status === "completed" || s.status === "stopped").length,
      inProgress: open ? { id: open.id, doneItemIds: done.map((d) => d.itemId).filter((x): x is string => !!x) } : null,
      nextAppointment: await nextAppointment(me.id, me),
      offers: await loadWaitlist(and(eq(waitlist.patientId, me.id), eq(waitlist.status, "offered"))),
      lastSession: last ? ((await sessionRows([last]))[0] ?? null) : null,
    }),
  );
});

sessionsRouter.get("/me/sessions", requireRole("patient"), async (req, res) => {
  const { db } = await getDb();
  const rows = await db.select().from(sessions).where(eq(sessions.patientId, req.user!.id)).orderBy(desc(sessions.startedAt)).limit(60);
  res.setHeader("Cache-Control", "no-store");
  res.json(ListMySessionsResponse.parse({ sessions: await sessionRows(rows) }));
});

sessionsRouter.post("/sessions", requireRole("patient"), async (req, res) => {
  const body = StartSessionBody.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Answer the check-in questions first." });
  const me = req.user!;
  const { db } = await getDb();
  const plan = await loadPlan(me.id, me.clinicId);
  if (!plan?.items.length) return void res.status(409).json({ error: "Your doctor hasn't set your exercises yet." });

  // Only one session at a time: an unfinished one from before is closed as stopped.
  await db
    .update(sessions)
    .set({ status: "stopped", endedAt: clock.now() })
    .where(and(eq(sessions.patientId, me.id), eq(sessions.status, "in-progress")));

  const redFlags = [...new Set(body.data.redFlags)];
  const stopped = redFlags.length > 0;
  const [s] = await db
    .insert(sessions)
    .values({
      clinicId: me.clinicId,
      patientId: me.id,
      day: today(),
      status: stopped ? "red-flag" : "in-progress",
      checkIn: { pain: body.data.pain, redFlags },
      endedAt: stopped ? clock.now() : null,
    })
    .returning();
  if (stopped) {
    await db.insert(symptomReports).values({ clinicId: me.clinicId, patientId: me.id, sessionId: s!.id, source: "check-in", pain: body.data.pain, redFlags });
    await logActivity({
      user: me,
      patientId: me.id,
      kind: "session.red-flag",
      summary: `${me.displayName}'s session was stopped at the check-in: ${redFlags.map((f) => RED_FLAG_WORDS[f] ?? f).join(", ")} (pain ${body.data.pain}/10).`,
      detail: { sessionId: s!.id },
    });
  } else {
    await logActivity({ user: me, patientId: me.id, kind: "session.started", summary: `${me.displayName} started a session (pain ${body.data.pain}/10).`, detail: { sessionId: s!.id } });
  }
  res.json(StartSessionResponse.parse({ id: s!.id, status: s!.status, stopped }));
});

/** The patient's own unfinished session. */
async function openSession(req: Request, sessionId: string) {
  const { db } = await getDb();
  const [s] = await db.select().from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.patientId, req.user!.id)));
  return s ?? null;
}

sessionsRouter.post("/sessions/:sessionId/exercises", requireRole("patient"), async (req, res) => {
  const params = SaveSessionExerciseParams.safeParse(req.params);
  const s = params.success ? await openSession(req, params.data.sessionId) : null;
  if (!s) return void res.status(404).json(NO_SESSION);
  if (s.status !== "in-progress") return void res.status(409).json({ error: "This session has already ended." });
  const body = SaveSessionExerciseBody.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "The exercise results couldn't be read." });
  const input = body.data;
  const def = getExercise(input.exerciseSlug);
  const { db } = await getDb();
  const [exercise] = await db.select().from(exercises).where(eq(exercises.slug, input.exerciseSlug));
  if (!def || !exercise) return void res.status(400).json({ error: "Unknown exercise." });

  // The dose asked for, copied from the plan so later plan changes don't rewrite this report.
  let item: typeof prescriptionItems.$inferSelect | undefined;
  if (input.itemId) {
    [item] = await db
      .select({ i: prescriptionItems })
      .from(prescriptionItems)
      .innerJoin(prescriptions, eq(prescriptions.id, prescriptionItems.prescriptionId))
      .where(and(eq(prescriptionItems.id, input.itemId), eq(prescriptions.patientId, req.user!.id)))
      .then((r) => r.map((x) => x.i));
    if (!item) return void res.status(400).json({ error: "That exercise isn't in your plan any more." });
  }
  const target: ExerciseTarget = {
    sets: item?.sets ?? def.dose.sets,
    reps: def.kind === "reps" ? (item?.reps ?? def.dose.reps ?? null) : null,
    holdSeconds: def.kind === "reps" ? null : (item?.holdSeconds ?? def.dose.holdSeconds ?? def.hold?.targetSeconds ?? null),
    side: item?.side ?? "both",
    rest: def.reps?.rest ?? null,
    goal: def.reps?.target ?? def.hold?.threshold ?? null,
    unit: def.metric.unit,
  };

  // The movement track must be exactly as long as it says (joints x 3 numbers x 2 bytes per frame).
  if (input.track) {
    const bytes = Buffer.from(input.track.data, "base64");
    if (bytes.length !== input.track.frames * input.track.joints.length * 6) return void res.status(400).json({ error: "The movement data is incomplete." });
  }

  const id = await db.transaction(async (tx) => {
    // Sending the same exercise again (e.g. after a dropped connection) replaces the first copy.
    if (input.itemId) {
      await tx.delete(sessionExercises).where(and(eq(sessionExercises.sessionId, s.id), eq(sessionExercises.prescriptionItemId, input.itemId)));
    }
    const [row] = await tx
      .insert(sessionExercises)
      .values({
        sessionId: s.id,
        prescriptionItemId: item?.id ?? null,
        exerciseId: exercise.id,
        sort: item?.sort ?? 99,
        mode: input.mode,
        status: input.status,
        target,
        setsDone: input.setsDone,
        repsFull: input.repsFull,
        repsPartial: input.repsPartial,
        holdsDone: input.holdsDone,
        best: input.best,
        quality: input.quality,
        feeling: input.feeling,
        feedbackTags: input.feedbackTags ?? [],
        feedbackNote: input.feedbackNote?.trim() || null,
        reps: input.reps,
        holds: input.holds,
        faultCounts: input.faultCounts,
        visibleRatio: input.visibleRatio,
        videoOnPhone: input.videoOnPhone,
        durationSeconds: input.durationSeconds,
      })
      .returning({ id: sessionExercises.id });
    if (input.track) await tx.insert(motionTracks).values({ sessionExerciseId: row!.id, ...input.track });
    return row!.id;
  });
  // Feedback goes to the activity feed so the clinic (and admin) see app problems quickly.
  const tags = input.feedbackTags ?? [];
  const note = input.feedbackNote?.trim();
  if (tags.length || note) {
    const me = req.user!;
    await logActivity({
      user: me,
      patientId: me.id,
      // feedback.app = the app or camera let them down; feedback.exercise = anything else.
      kind: tags.some((t) => t === "not-counted" || t === "not-seen" || t === "unclear") ? "feedback.app" : "feedback.exercise",
      summary: `${me.displayName} gave feedback on ${exercise.content.name.en}: ${[...tags.map((t) => FEEDBACK_WORDS[t]), ...(note ? [`"${note}"`] : [])].join(", ")}.`,
      detail: { sessionId: s.id, exercise: exercise.slug, tags, appProblem: tags.some((t) => t === "not-counted" || t === "not-seen" || t === "unclear") },
    });
  }
  res.json(SaveSessionExerciseResponse.parse({ id }));
});

sessionsRouter.post("/sessions/:sessionId/finish", requireRole("patient"), async (req, res) => {
  const params = FinishSessionParams.safeParse(req.params);
  const s = params.success ? await openSession(req, params.data.sessionId) : null;
  if (!s) return void res.status(404).json(NO_SESSION);
  const body = FinishSessionBody.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Give your pain score after the session." });
  const me = req.user!;
  const { db } = await getDb();
  if (s.status === "in-progress") {
    const comment = body.data.comment?.trim() || null;
    await db.update(sessions).set({ status: body.data.status, painAfter: body.data.painAfter, comment, endedAt: clock.now() }).where(eq(sessions.id, s.id));
    const report = (await sessionReport(s.id, me.clinicId))!;
    const t = report.totals;
    await logActivity({
      user: me,
      patientId: me.id,
      kind: body.data.status === "completed" ? "session.completed" : "session.stopped",
      summary:
        `${me.displayName} ${body.data.status === "completed" ? "finished" : "stopped"} a session: ${report.exercises.length} exercise${report.exercises.length === 1 ? "" : "s"}, ` +
        `${t.repsFull} full rep${t.repsFull === 1 ? "" : "s"}${t.repsPartial ? `, ${t.repsPartial} partial` : ""}${t.holds ? `, ${t.holds} hold${t.holds === 1 ? "" : "s"}` : ""}` +
        `${t.problems ? `, ${t.problems} with form problems` : ""}; pain ${s.checkIn?.pain ?? "?"} → ${body.data.painAfter ?? "?"}.`,
      detail: { sessionId: s.id },
    });
    if (comment) {
      await logActivity({ user: me, patientId: me.id, kind: "feedback.session", summary: `${me.displayName} commented on the session: "${comment}"`, detail: { sessionId: s.id, appProblem: false } });
    }
  }
  res.json(FinishSessionResponse.parse(await sessionReport(s.id, me.clinicId)));
});

/* ------------------------------------------------------------------ everyone with access */

/** The session, if the signed-in person may see it. */
async function visibleSession(req: Request, sessionId: string) {
  const { db } = await getDb();
  const [s] = await db.select().from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.clinicId, req.user!.clinicId)));
  if (!s) return null;
  const patient = await patientFor(req.user!, s.patientId);
  return patient ? { s, patient } : null;
}

sessionsRouter.get("/sessions/:sessionId", requireRole(), async (req, res) => {
  const params = GetSessionParams.safeParse(req.params);
  const found = params.success ? await visibleSession(req, params.data.sessionId) : null;
  if (!found) return void res.status(404).json(NO_SESSION);
  res.setHeader("Cache-Control", "no-store");
  res.json(GetSessionResponse.parse(await sessionReport(found.s.id, req.user!.clinicId)));
});

sessionsRouter.post("/sessions/:sessionId/review", requireRole("clinician", "admin"), async (req, res) => {
  const params = ReviewSessionParams.safeParse(req.params);
  const found = params.success ? await visibleSession(req, params.data.sessionId) : null;
  if (!found) return void res.status(404).json(NO_SESSION);
  const body = ReviewSessionBody.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "The note is too long." });
  const { db } = await getDb();
  await db.update(sessions).set({ reviewedBy: req.user!.id, reviewedAt: clock.now(), reviewNote: body.data.note.trim() }).where(eq(sessions.id, found.s.id));
  await logActivity({
    user: req.user!,
    patientId: found.patient.id,
    kind: "review.session",
    summary: `${req.user!.displayName} reviewed ${found.patient.displayName}'s session of ${describeDay(found.s.day)}${body.data.note.trim() ? `: "${body.data.note.trim().slice(0, 120)}"` : "."}`,
    detail: { sessionId: found.s.id },
  });
  res.json(ReviewSessionResponse.parse(await sessionReport(found.s.id, req.user!.clinicId)));
});

sessionsRouter.get("/session-exercises/:resultId/track", requireRole(), async (req, res) => {
  const params = GetMotionTrackParams.safeParse(req.params);
  if (!params.success) return void res.status(404).json({ error: "No such movement track." });
  const { db } = await getDb();
  const [row] = await db
    .select({ t: motionTracks, sessionId: sessionExercises.sessionId })
    .from(motionTracks)
    .innerJoin(sessionExercises, eq(sessionExercises.id, motionTracks.sessionExerciseId))
    .where(eq(motionTracks.sessionExerciseId, params.data.resultId));
  if (!row || !(await visibleSession(req, row.sessionId))) return void res.status(404).json({ error: "No such movement track." });
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.json(GetMotionTrackResponse.parse({ fps: row.t.fps, joints: row.t.joints, frames: row.t.frames, data: row.t.data }));
});

