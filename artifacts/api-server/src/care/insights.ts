import { getDb, schema } from "@kynex/db";
import { getExercise } from "@kynex/motion";
import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { SignedInUser } from "../auth/sessions.ts";
import { nextAppointment } from "../bookings/rules.ts";
import { dueOn, loadPlan, type PlanDto } from "./plans.ts";
import { sessionRows, type SessionRowDto } from "./reports.ts";
import { addDays, daysBetween, describeDay, today } from "./time.ts";
import { alias } from "drizzle-orm/pg-core";

const { careTeams, exercises, patientNotes, sessionExercises, sessions, symptomReports, users } = schema;

/** Sessions planned on a day (the most "times a day" among the exercises due). */
export function plannedOn(plan: PlanDto | null, day: string): number {
  if (!plan) return 0;
  return Math.max(0, ...plan.items.filter((i) => dueOn(plan, i, day)).map((i) => i.timesPerDay));
}

/** Sessions that count as done: finished, or stopped after at least one exercise. */
const counts = (s: { status: string }) => s.status === "completed" || s.status === "stopped";

export function adherence(plan: PlanDto | null, done: { day: string; status: string }[], from: string, to: string) {
  return daysBetween(from, to).map((day) => ({
    day,
    planned: plannedOn(plan, day),
    done: done.filter((s) => s.day === day && counts(s)).length,
  }));
}

/** Percent of planned sessions done over the 14 days before today (today isn't over yet). */
export function adherencePercent(days: { day: string; planned: number; done: number }[]): number | null {
  const t = today();
  const window = days.filter((d) => d.day < t && d.day >= addDays(t, -14));
  const planned = window.reduce((a, d) => a + d.planned, 0);
  if (!planned) return null;
  return Math.round((100 * window.reduce((a, d) => a + Math.min(d.done, d.planned), 0)) / planned);
}

type Attention = { kind: "red-flag" | "symptom" | "pain" | "painful" | "missed" | "form" | "review"; text: string };
const RANK: Record<Attention["kind"], number> = { "red-flag": 0, symptom: 1, pain: 2, painful: 3, missed: 4, form: 5, review: 6 };

const RED_FLAG_WORDS: Record<string, string> = {
  numbness: "numbness or tingling",
  bladder: "bladder or bowel changes",
  chest: "chest pain or breathlessness",
  fall: "a fall or injury",
  severe: "severe new pain",
};

/** What the doctor should look at, most urgent first. */
function attentionFor(input: {
  plan: PlanDto | null;
  rows: SessionRowDto[];
  feelings: { sessionId: string; feeling: string | null; name: string }[];
  openSymptoms: { redFlags: string[]; text: string; createdAt: Date }[];
  days: { day: string; planned: number; done: number }[];
}): Attention[] {
  const out: Attention[] = [];
  for (const s of input.openSymptoms) {
    if (s.redFlags.length) out.push({ kind: "red-flag", text: `Red-flag answer at check-in: ${s.redFlags.map((f) => RED_FLAG_WORDS[f] ?? f).join(", ")}` });
  }
  const plain = input.openSymptoms.filter((s) => !s.redFlags.length);
  if (plain.length) out.push({ kind: "symptom", text: `${plain.length} symptom report${plain.length > 1 ? "s" : ""} to read` });

  const last = input.rows.find((r) => r.status !== "in-progress");
  if (last) {
    const before = last.painBefore;
    const after = last.painAfter;
    if (after !== null && before !== null && after >= before + 2) out.push({ kind: "pain", text: `Pain went up in the last session (${before} → ${after})` });
    else if ((after ?? before ?? 0) >= 7) out.push({ kind: "pain", text: `High pain in the last session (${after ?? before}/10)` });
    const painful = input.feelings.filter((f) => f.sessionId === last.id && f.feeling === "painful").map((f) => f.name);
    if (painful.length) out.push({ kind: "painful", text: `Said "painful": ${painful.join(", ")}` });
    const moves = last.repsFull + last.repsPartial + last.holds;
    if (moves >= 3 && last.problems / moves >= 0.3) out.push({ kind: "form", text: `Form problems in ${last.problems} of ${moves} reps last session` });
  }

  if (input.plan?.items.length) {
    const t = today();
    const recent = input.days.filter((d) => d.day < t && d.day >= addDays(t, -3));
    const planned = recent.reduce((a, d) => a + d.planned, 0);
    const done = recent.reduce((a, d) => a + Math.min(d.done, d.planned), 0);
    if (planned >= 2 && done === 0) out.push({ kind: "missed", text: "No sessions in the last 3 planned days" });
    else {
      const pct = adherencePercent(input.days);
      if (pct !== null && pct < 50) out.push({ kind: "missed", text: `Only ${pct}% of planned sessions done (14 days)` });
    }
  }

  const toReview = input.rows.filter((r) => r.status !== "in-progress" && !r.reviewed).length;
  if (toReview) out.push({ kind: "review", text: `${toReview} session${toReview > 1 ? "s" : ""} to review` });
  return out.sort((a, b) => RANK[a.kind] - RANK[b.kind]);
}

/** Everything needed about some patients, loaded together. */
async function gather(patientIds: string[], clinicId: string) {
  const { db } = await getDb();
  const from = addDays(today(), -27);
  const recentSessions = patientIds.length
    ? await db
        .select()
        .from(sessions)
        .where(and(inArray(sessions.patientId, patientIds), gte(sessions.day, addDays(today(), -60))))
        .orderBy(desc(sessions.startedAt))
    : [];
  const rows = await sessionRows(recentSessions);
  const feelings = recentSessions.length
    ? await db
        .select({ sessionId: sessionExercises.sessionId, feeling: sessionExercises.feeling, content: exercises.content })
        .from(sessionExercises)
        .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
        .where(
          inArray(
            sessionExercises.sessionId,
            recentSessions.map((s) => s.id),
          ),
        )
    : [];
  const openSymptoms = patientIds.length
    ? await db
        .select()
        .from(symptomReports)
        .where(and(inArray(symptomReports.patientId, patientIds), isNull(symptomReports.acknowledgedAt)))
    : [];
  const plans = new Map<string, PlanDto | null>();
  for (const id of patientIds) plans.set(id, await loadPlan(id, clinicId));

  return (patientId: string) => {
    const plan = plans.get(patientId) ?? null;
    const mine = recentSessions.filter((s) => s.patientId === patientId);
    const myRows = rows.filter((r) => mine.some((s) => s.id === r.id));
    const days = adherence(plan, mine, from, today());
    return {
      plan,
      sessions: mine,
      rows: myRows,
      days,
      attention: attentionFor({
        plan,
        rows: myRows,
        feelings: feelings
          .filter((f) => mine.some((s) => s.id === f.sessionId))
          .map((f) => ({ sessionId: f.sessionId, feeling: f.feeling, name: f.content.name.en })),
        openSymptoms: openSymptoms.filter((s) => s.patientId === patientId),
        days,
      }),
    };
  };
}

const doctor = alias(users, "doctor");

export interface PatientRowDto {
  id: string;
  displayName: string;
  email: string;
  clinicianName: string | null;
  hasPlan: boolean;
  exercises: number;
  lastSessionAt: string | null;
  adherence: number | null;
  attention: Attention[];
  nextAppointment: Awaited<ReturnType<typeof nextAppointment>>;
}

/** The patient list: the doctor's own, or (admin) the whole clinic's. Most urgent first. */
export async function patientRows(viewer: SignedInUser) {
  const { db } = await getDb();
  const list = await db
    .select({ id: users.id, displayName: users.displayName, email: users.email, clinicianId: careTeams.clinicianId, clinicianName: doctor.displayName })
    .from(users)
    .leftJoin(careTeams, eq(careTeams.patientId, users.id))
    .leftJoin(doctor, eq(doctor.id, careTeams.clinicianId))
    .where(
      and(
        eq(users.clinicId, viewer.clinicId),
        eq(users.role, "patient"),
        viewer.role === "clinician" ? eq(careTeams.clinicianId, viewer.id) : undefined,
      ),
    )
    .orderBy(asc(users.displayName));
  const info = await gather(
    list.map((p) => p.id),
    viewer.clinicId,
  );
  const out: PatientRowDto[] = [];
  for (const p of list) {
    const i = info(p.id);
    const row: PatientRowDto = {
      id: p.id,
      displayName: p.displayName,
      email: p.email,
      clinicianName: p.clinicianName ?? null,
      hasPlan: !!i.plan,
      exercises: i.plan?.items.length ?? 0,
      lastSessionAt: i.sessions[0]?.startedAt.toISOString() ?? null,
      adherence: adherencePercent(i.days),
      attention: i.attention,
      nextAppointment: await nextAppointment(p.id, viewer),
    };
    out.push(row);
  }
  const urgency = (r: PatientRowDto) => (r.attention.length ? RANK[r.attention[0]!.kind] : 99);
  return out.sort((a, b) => urgency(a) - urgency(b) || a.displayName.localeCompare(b.displayName));
}

/** The doctor's full page about one patient (activity and visits are added by the route). */
export async function patientOverview(patientId: string, clinicId: string) {
  const { db } = await getDb();
  const i = (await gather([patientId], clinicId))(patientId);
  const from = addDays(today(), -27);

  // Range of motion over time, per exercise measured by the camera.
  const romRows = await db
    .select({ sessionId: sessions.id, day: sessions.day, best: sessionExercises.best, slug: exercises.slug, content: exercises.content })
    .from(sessionExercises)
    .innerJoin(sessions, eq(sessions.id, sessionExercises.sessionId))
    .innerJoin(exercises, eq(exercises.id, sessionExercises.exerciseId))
    .where(and(eq(sessions.patientId, patientId), gte(sessions.day, from)))
    .orderBy(asc(sessions.startedAt));
  const rom = new Map<string, { slug: string; name: { en: string; hi: string }; unit: string; goal: number | null; points: { day: string; sessionId: string; best: number }[] }>();
  for (const r of romRows) {
    if (r.best === null) continue;
    const def = getExercise(r.slug);
    const series = rom.get(r.slug) ?? {
      slug: r.slug,
      name: r.content.name,
      unit: def?.metric.unit ?? "deg",
      goal: def?.reps?.target ?? def?.hold?.threshold ?? null,
      points: [],
    };
    series.points.push({ day: r.day, sessionId: r.sessionId, best: Math.round(r.best * 10) / 10 });
    rom.set(r.slug, series);
  }

  const symptoms = await db
    .select({ s: symptomReports, byName: users.displayName })
    .from(symptomReports)
    .leftJoin(users, eq(users.id, symptomReports.acknowledgedBy))
    .where(eq(symptomReports.patientId, patientId))
    .orderBy(desc(symptomReports.createdAt))
    .limit(30);
  const notes = await db
    .select({ n: patientNotes, authorName: users.displayName })
    .from(patientNotes)
    .leftJoin(users, eq(users.id, patientNotes.authorId))
    .where(eq(patientNotes.patientId, patientId))
    .orderBy(desc(patientNotes.createdAt))
    .limit(50);

  return {
    plan: i.plan,
    adherence: i.days,
    adherencePercent: adherencePercent(i.days),
    pain: i.sessions
      .filter((s) => s.day >= from && (s.checkIn || s.painAfter !== null))
      .map((s) => ({ day: s.day, sessionId: s.id, before: s.checkIn?.pain ?? null, after: s.painAfter }))
      .reverse(),
    rom: [...rom.values()],
    sessions: i.rows.slice(0, 40),
    symptoms: symptoms.map(({ s, byName }) => symptomDto(s, byName)),
    notes: notes.map(({ n, authorName }) => ({ id: n.id, text: n.text, createdAt: n.createdAt.toISOString(), authorName: authorName ?? null })),
    attention: i.attention,
  };
}

export function symptomDto(s: typeof symptomReports.$inferSelect, acknowledgedByName: string | null) {
  return {
    id: s.id,
    createdAt: s.createdAt.toISOString(),
    source: s.source,
    pain: s.pain,
    redFlags: s.redFlags,
    text: s.text,
    sessionId: s.sessionId,
    acknowledgedAt: s.acknowledgedAt?.toISOString() ?? null,
    acknowledgedByName: s.acknowledgedAt ? acknowledgedByName : null,
  };
}

export { describeDay, RED_FLAG_WORDS };
