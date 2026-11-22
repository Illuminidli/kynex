import { GetOverviewResponse, ListActivityQueryParams, ListActivityResponse } from "@kynex/api-zod";
import { getDb, schema } from "@kynex/db";
import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { Router } from "express";
import { requireRole } from "../auth/sessions.ts";
import { loadAppointments } from "../bookings/rules.ts";
import { listActivity } from "../care/activity.ts";
import { patientFor } from "../care/access.ts";
import { adherence, patientRows } from "../care/insights.ts";
import { loadPlan } from "../care/plans.ts";
import { addDays, atMinute, today } from "../care/time.ts";

const { appointments, sessions, symptomReports, users, waitlist } = schema;

export const overviewRouter = Router();

overviewRouter.get("/admin/overview", requireRole("admin"), async (req, res) => {
  const user = req.user!;
  const { db } = await getDb();
  const day = today();
  const patients = await patientRows(user);

  // Clinic-wide adherence over the last 7 full days.
  const weekFrom = addDays(day, -7);
  const weekSessions = await db
    .select({ patientId: sessions.patientId, day: sessions.day, status: sessions.status })
    .from(sessions)
    .where(and(eq(sessions.clinicId, user.clinicId), gte(sessions.day, weekFrom)));
  let planned = 0;
  let done = 0;
  for (const p of patients) {
    const days = adherence(
      await loadPlan(p.id, user.clinicId),
      weekSessions.filter((s) => s.patientId === p.id),
      weekFrom,
      addDays(day, -1),
    );
    planned += days.reduce((a, d) => a + d.planned, 0);
    done += days.reduce((a, d) => a + Math.min(d.done, d.planned), 0);
  }

  const count = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0);
  const n = sql<number>`count(*)`;
  const since30 = atMinute(addDays(day, -30), 0);
  const [clinicians, openSymptoms, noShows30, cancellations30, waiting] = await Promise.all([
    count(db.select({ n }).from(users).where(and(eq(users.clinicId, user.clinicId), eq(users.role, "clinician")))),
    count(db.select({ n }).from(symptomReports).where(and(eq(symptomReports.clinicId, user.clinicId), isNull(symptomReports.acknowledgedAt)))),
    count(db.select({ n }).from(appointments).where(and(eq(appointments.clinicId, user.clinicId), eq(appointments.status, "no-show"), gte(appointments.startsAt, since30)))),
    count(db.select({ n }).from(appointments).where(and(eq(appointments.clinicId, user.clinicId), eq(appointments.status, "cancelled"), gte(appointments.updatedAt, since30)))),
    count(db.select({ n }).from(waitlist).where(and(eq(waitlist.clinicId, user.clinicId), inArray(waitlist.status, ["waiting", "offered"])))),
  ]);
  const todays = await loadAppointments(
    and(eq(appointments.clinicId, user.clinicId), gte(appointments.startsAt, atMinute(day, 0)), lt(appointments.startsAt, atMinute(addDays(day, 1), 0))),
    user,
  );

  res.setHeader("Cache-Control", "no-store");
  res.json(
    GetOverviewResponse.parse({
      day,
      counts: {
        patients: patients.length,
        clinicians,
        sessionsToday: weekSessions.filter((s) => s.day === day && s.status !== "in-progress").length,
        sessionsWeek: weekSessions.filter((s) => s.day >= addDays(day, -6) && s.status !== "in-progress").length,
        adherence7: planned ? Math.round((100 * done) / planned) : null,
        openAlerts: patients.reduce((a, p) => a + p.attention.filter((x) => x.kind !== "review").length, 0),
        openSymptoms,
        appointmentsToday: todays.filter((a) => a.status !== "cancelled").length,
        noShows30,
        cancellations30,
        waiting,
      },
      patients,
      today: todays,
      recent: await listActivity(user.clinicId, { limit: 15 }),
    }),
  );
});

overviewRouter.get("/activity", requireRole("clinician", "admin"), async (req, res) => {
  const q = ListActivityQueryParams.safeParse(req.query);
  if (!q.success) return void res.status(400).json({ error: "Those filters aren't valid." });
  const user = req.user!;
  let patientIds: string[] | undefined;
  if (q.data.patientId) {
    const patient = await patientFor(user, q.data.patientId);
    if (!patient) return void res.status(404).json({ error: "No such patient in your list." });
    patientIds = [patient.id];
  } else if (user.role === "clinician") {
    patientIds = (await patientRows(user)).map((p) => p.id);
  }
  const day = (d: unknown) => (d ? String(d).slice(0, 10) : undefined);
  res.setHeader("Cache-Control", "no-store");
  res.json(
    ListActivityResponse.parse({
      items: await listActivity(user.clinicId, { patientIds, area: q.data.area, from: day(q.data.from), to: day(q.data.to), limit: 200 }),
    }),
  );
});
