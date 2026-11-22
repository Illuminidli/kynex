import {
  AcceptOfferParams,
  AcceptOfferResponse,
  AddTimeOffBody,
  AddTimeOffResponse,
  BookAppointmentBody,
  BookAppointmentResponse,
  DeclineOfferParams,
  DeclineOfferResponse,
  DeleteTimeOffParams,
  GetAvailabilityQueryParams,
  GetAvailabilityResponse,
  GetSlotsQueryParams,
  GetSlotsResponse,
  JoinWaitlistBody,
  JoinWaitlistResponse,
  LeaveWaitlistParams,
  ListAppointmentsQueryParams,
  ListAppointmentsResponse,
  ListCliniciansResponse,
  ListTimeOffResponse,
  ListVisitTypesResponse,
  ListWaitlistResponse,
  MoveAppointmentBody,
  MoveAppointmentParams,
  MoveAppointmentResponse,
  SetAppointmentStatusBody,
  SetAppointmentStatusParams,
  SetAppointmentStatusResponse,
  SetAvailabilityBody,
  SetAvailabilityResponse,
} from "@kynex/api-zod";
import { getDb, schema, type AppointmentStatus } from "@kynex/db";
import { and, asc, eq, gte, inArray, lt } from "drizzle-orm";
import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { requireRole, type SignedInUser } from "../auth/sessions.ts";
import {
  canChange,
  checkTime,
  expireOffers,
  freeSlots,
  isFinal,
  loadAppointments,
  loadWaitlist,
  offerFreedTime,
  RULES,
  visitTypeDto,
} from "../bookings/rules.ts";
import { logActivity } from "../care/activity.ts";
import { patientFor, type PatientAccess } from "../care/access.ts";
import { addDays, atMinute, clock, dayOf, describeDay, describeTime, minuteOf, today, weekdayOf } from "../care/time.ts";

const { appointments, availability, timeOff, users, visitTypes, waitlist } = schema;

export const bookingsRouter = Router();

/* ------------------------------------------------------------------ helpers */

async function visitType(clinicId: string, id: string) {
  const { db } = await getDb();
  const [vt] = await db.select().from(visitTypes).where(and(eq(visitTypes.id, id), eq(visitTypes.clinicId, clinicId), eq(visitTypes.active, true)));
  return vt ?? null;
}

/** The patient a booking is for: patients book for themselves; staff name the patient. */
async function bookingPatient(req: Request, res: Response, patientId: string | undefined): Promise<(PatientAccess & { clinicianId: string }) | null> {
  const user = req.user!;
  const id = user.role === "patient" ? user.id : patientId;
  const fail = (status: number, error: string) => {
    res.status(status).json({ error });
    return null;
  };
  if (!id) return fail(400, "Choose the patient.");
  const patient = await patientFor(user, id);
  if (!patient) return fail(404, "No such patient in your list.");
  if (!patient.clinicianId) return fail(409, "This patient has no doctor yet.");
  return { ...patient, clinicianId: patient.clinicianId };
}

/** The doctor whose hours / leave are being changed: doctors - themselves; admin - any doctor. */
async function targetClinician(user: SignedInUser, clinicianId: string | undefined | null): Promise<string | null> {
  if (user.role === "clinician") return !clinicianId || clinicianId === user.id ? user.id : null;
  if (!clinicianId) return null;
  const { db } = await getDb();
  const [doc] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, clinicianId), eq(users.clinicId, user.clinicId), eq(users.role, "clinician")));
  return doc?.id ?? null;
}

const visitLabel = (vt: { name: string }, start: Date) => `${vt.name} on ${describeTime(start)}`;

async function appointmentFor(user: SignedInUser, id: string) {
  const { db } = await getDb();
  const [a] = await db.select().from(appointments).where(and(eq(appointments.id, id), eq(appointments.clinicId, user.clinicId)));
  if (!a) return null;
  if (user.role === "patient" && a.patientId !== user.id) return null;
  if (user.role === "clinician" && a.clinicianId !== user.id) return null;
  return a;
}

const one = async (id: string, viewer: SignedInUser) => (await loadAppointments(eq(appointments.id, id), viewer))[0]!;

/* ------------------------------------------------------------------ visit types and doctors */

bookingsRouter.get("/visit-types", requireRole(), async (req, res) => {
  const { db } = await getDb();
  const rows = await db
    .select()
    .from(visitTypes)
    .where(and(eq(visitTypes.clinicId, req.user!.clinicId), eq(visitTypes.active, true)))
    .orderBy(asc(visitTypes.sort));
  res.json(ListVisitTypesResponse.parse({ visitTypes: rows.map(visitTypeDto) }));
});

bookingsRouter.get("/clinicians", requireRole("clinician", "admin"), async (req, res) => {
  const { db } = await getDb();
  const rows = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(and(eq(users.clinicId, req.user!.clinicId), eq(users.role, "clinician")))
    .orderBy(asc(users.displayName));
  res.json(ListCliniciansResponse.parse({ clinicians: rows }));
});

/* ------------------------------------------------------------------ free times and visits */

bookingsRouter.get("/bookings/slots", requireRole(), async (req, res) => {
  const q = GetSlotsQueryParams.safeParse(req.query);
  if (!q.success) return void res.status(400).json({ error: "Choose a visit type and a day." });
  const patient = await bookingPatient(req, res, q.data.patientId);
  if (!patient) return;
  const vt = await visitType(req.user!.clinicId, q.data.visitTypeId);
  if (!vt) return void res.status(404).json({ error: "No such visit type." });
  const day = typeof q.data.date === "string" ? q.data.date : dayOf(q.data.date as Date);
  const result = await freeSlots({
    clinicId: req.user!.clinicId,
    clinicianId: patient.clinicianId,
    patientId: patient.id,
    visitType: vt,
    day,
    ignoreId: q.data.ignoreAppointmentId,
  });
  res.setHeader("Cache-Control", "no-store");
  res.json(GetSlotsResponse.parse({ date: day, ...result }));
});

bookingsRouter.get("/appointments", requireRole(), async (req, res) => {
  const q = ListAppointmentsQueryParams.safeParse(req.query);
  if (!q.success) return void res.status(400).json({ error: "Give a date range." });
  const user = req.user!;
  const from = String(q.data.from).slice(0, 10);
  const to = String(q.data.to).slice(0, 10);
  if (to < from || to > addDays(from, 92)) return void res.status(400).json({ error: "Choose a range of up to 3 months." });
  const who =
    user.role === "patient"
      ? eq(appointments.patientId, user.id)
      : user.role === "clinician"
        ? eq(appointments.clinicianId, user.id)
        : eq(appointments.clinicId, user.clinicId);
  const rows = await loadAppointments(
    and(
      who,
      eq(appointments.clinicId, user.clinicId),
      q.data.patientId ? eq(appointments.patientId, q.data.patientId) : undefined,
      gte(appointments.startsAt, atMinute(from, 0)),
      lt(appointments.startsAt, atMinute(addDays(to, 1), 0)),
    ),
    user,
  );
  res.setHeader("Cache-Control", "no-store");
  res.json(ListAppointmentsResponse.parse({ appointments: rows }));
});

bookingsRouter.post("/appointments", requireRole(), async (req, res) => {
  const body = BookAppointmentBody.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Some booking details are missing." });
  const user = req.user!;
  const input = body.data;
  const patient = await bookingPatient(req, res, input.patientId);
  if (!patient) return;
  const vt = await visitType(user.clinicId, input.visitTypeId);
  if (!vt) return void res.status(404).json({ error: "No such visit type." });
  if (input.repeat && user.role === "patient") return void res.status(403).json({ error: "Repeating visits are booked by the clinic." });
  if (input.meetingLink && vt.mode === "video" && !/^https:\/\/\S+$/.test(input.meetingLink)) {
    return void res.status(400).json({ error: "The meeting link must start with https://" });
  }

  // Every date asked for: the first, then the chosen weekdays at the same time, week after week.
  const first = new Date(input.startsAt);
  const firstDay = dayOf(first);
  const minute = minuteOf(first);
  const starts: Date[] = [first];
  if (input.repeat) {
    const lastDay = addDays(firstDay, input.repeat.weeks * 7 - 1);
    for (let d = addDays(firstDay, 1); d <= lastDay; d = addDays(d, 1)) {
      if (input.repeat.weekdays.includes(weekdayOf(d))) starts.push(atMinute(d, minute));
    }
  }

  const planned: { startsAt: string; ok: boolean; reason: string | null }[] = [];
  const { db } = await getDb();
  const seriesId = starts.length > 1 ? randomUUID() : null;
  const bookedIds: string[] = [];
  for (const start of starts) {
    const reason = await checkTime({ clinicId: user.clinicId, clinicianId: patient.clinicianId, patientId: patient.id, visitType: vt, start });
    planned.push({ startsAt: start.toISOString(), ok: !reason, reason });
    if (reason || input.preview) continue;
    // Booked one by one, so a later date sees the earlier ones of the same series.
    const [row] = await db
      .insert(appointments)
      .values({
        clinicId: user.clinicId,
        clinicianId: patient.clinicianId,
        patientId: patient.id,
        visitTypeId: vt.id,
        startsAt: start,
        endsAt: new Date(start.getTime() + vt.minutes * 60_000),
        // The clinic's own bookings are confirmed; a patient's waits for the clinic to confirm.
        status: user.role === "patient" ? "booked" : "confirmed",
        seriesId,
        meetingLink: input.meetingLink ?? null,
        note: input.note?.trim() ?? "",
        createdBy: user.id,
      })
      .returning({ id: appointments.id });
    bookedIds.push(row!.id);
  }

  if (!input.preview) {
    if (!bookedIds.length) return void res.status(409).json({ error: planned[0]?.reason ?? "That time can't be booked." });
    const skipped = planned.filter((p) => !p.ok).length;
    await logActivity({
      user,
      patientId: patient.id,
      kind: "booking.created",
      summary:
        bookedIds.length === 1
          ? `${user.displayName} booked a ${visitLabel(vt, first)}${user.id === patient.id ? "" : ` for ${patient.displayName}`}.`
          : `${user.displayName} booked ${bookedIds.length} repeating ${vt.name} visits for ${patient.displayName}, from ${describeDay(firstDay)}${skipped ? ` (${skipped} date${skipped > 1 ? "s" : ""} skipped: clashes)` : ""}.`,
      detail: { appointmentId: bookedIds[0], seriesId },
    });
  }
  const booked = bookedIds.length ? await loadAppointments(inArray(appointments.id, bookedIds), user) : [];
  res.json(BookAppointmentResponse.parse({ booked, planned, seriesId: bookedIds.length > 1 ? seriesId : null }));
});

bookingsRouter.patch("/appointments/:appointmentId", requireRole(), async (req, res) => {
  const params = MoveAppointmentParams.safeParse(req.params);
  const a = params.success ? await appointmentFor(req.user!, params.data.appointmentId) : null;
  if (!a) return void res.status(404).json({ error: "No such visit." });
  const body = MoveAppointmentBody.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Choose the new time." });
  const user = req.user!;
  const blocked = canChange(user, a);
  if (blocked) return void res.status(409).json({ error: blocked });
  const vt = (await visitType(user.clinicId, a.visitTypeId))!;
  const start = new Date(body.data.startsAt);
  const reason = await checkTime({ clinicId: user.clinicId, clinicianId: a.clinicianId, patientId: a.patientId, visitType: vt, start, ignoreId: a.id });
  if (reason) return void res.status(409).json({ error: reason });
  const { db } = await getDb();
  await db
    .update(appointments)
    .set({ startsAt: start, endsAt: new Date(start.getTime() + vt.minutes * 60_000), status: user.role === "patient" ? "booked" : a.status, updatedAt: clock.now() })
    .where(eq(appointments.id, a.id));
  const [patient] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, a.patientId));
  await logActivity({
    user,
    patientId: a.patientId,
    kind: "booking.moved",
    summary: `${user.displayName} moved ${patient?.name ?? "the patient"}'s ${vt.name} from ${describeTime(a.startsAt)} to ${describeTime(start)}.`,
    detail: { appointmentId: a.id },
  });
  await offerFreedTime(user.clinicId, a.clinicianId, a.startsAt);
  res.json(MoveAppointmentResponse.parse(await one(a.id, user)));
});

const STATUS_WORDS: Record<AppointmentStatus, string> = {
  booked: "booked",
  confirmed: "confirmed",
  arrived: "marked as arrived",
  completed: "marked as completed",
  "no-show": "marked as a no-show",
  cancelled: "cancelled",
};

bookingsRouter.post("/appointments/:appointmentId/status", requireRole(), async (req, res) => {
  const params = SetAppointmentStatusParams.safeParse(req.params);
  const a = params.success ? await appointmentFor(req.user!, params.data.appointmentId) : null;
  if (!a) return void res.status(404).json({ error: "No such visit." });
  const body = SetAppointmentStatusBody.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Choose what happened." });
  const user = req.user!;
  const next = body.data.status;
  const reason = body.data.reason?.trim() ?? "";

  if (isFinal(a.status)) return void res.status(409).json({ error: `This visit is already ${STATUS_WORDS[a.status]}.` });
  if (user.role === "patient") {
    if (next !== "cancelled") return void res.status(403).json({ error: "Only the clinic can change that." });
    const blocked = canChange(user, a);
    if (blocked) return void res.status(409).json({ error: blocked });
  } else {
    if (next === "cancelled" && !reason) return void res.status(400).json({ error: "Give a reason for cancelling." });
    if ((next === "arrived" || next === "completed" || next === "no-show") && dayOf(a.startsAt) > today()) {
      return void res.status(409).json({ error: "That can only be marked on the day of the visit or after." });
    }
  }

  const { db } = await getDb();
  await db
    .update(appointments)
    .set({
      status: next,
      updatedAt: clock.now(),
      ...(next === "cancelled" ? { cancelledBy: user.id, cancelReason: reason || "Cancelled by the patient" } : {}),
    })
    .where(eq(appointments.id, a.id));
  const vt = (await visitType(user.clinicId, a.visitTypeId))!;
  const [patient] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, a.patientId));
  await logActivity({
    user,
    patientId: a.patientId,
    kind: `booking.${next}`,
    summary: `${user.displayName} ${STATUS_WORDS[next]} ${patient?.name ?? "the patient"}'s ${visitLabel(vt, a.startsAt)}${reason ? ` — "${reason}"` : ""}.`,
    detail: { appointmentId: a.id },
  });
  if (next === "cancelled") await offerFreedTime(user.clinicId, a.clinicianId, a.startsAt);
  res.json(SetAppointmentStatusResponse.parse(await one(a.id, user)));
});

/* ------------------------------------------------------------------ working hours and time off */

bookingsRouter.get("/availability", requireRole("clinician", "admin"), async (req, res) => {
  const q = GetAvailabilityQueryParams.safeParse(req.query);
  const clinicianId = q.success ? await targetClinician(req.user!, q.data.clinicianId) : null;
  if (!clinicianId) return void res.status(404).json({ error: "Choose a doctor." });
  const { db } = await getDb();
  const hours = await db
    .select({ weekday: availability.weekday, startMinute: availability.startMinute, endMinute: availability.endMinute })
    .from(availability)
    .where(eq(availability.clinicianId, clinicianId))
    .orderBy(asc(availability.weekday), asc(availability.startMinute));
  res.setHeader("Cache-Control", "no-store");
  res.json(GetAvailabilityResponse.parse({ clinicianId, hours }));
});

bookingsRouter.put("/availability", requireRole("clinician", "admin"), async (req, res) => {
  const body = SetAvailabilityBody.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Some hours are out of range." });
  const clinicianId = await targetClinician(req.user!, body.data.clinicianId);
  if (!clinicianId) return void res.status(404).json({ error: "Choose a doctor." });
  const hours = [...body.data.hours].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
  for (const [n, h] of hours.entries()) {
    if (h.endMinute <= h.startMinute) return void res.status(400).json({ error: "Each block of hours must end after it starts." });
    const prev = hours[n - 1];
    if (prev && prev.weekday === h.weekday && prev.endMinute > h.startMinute) return void res.status(400).json({ error: "Two blocks of hours overlap on the same day." });
  }
  const { db } = await getDb();
  await db.transaction(async (tx) => {
    await tx.delete(availability).where(eq(availability.clinicianId, clinicianId));
    if (hours.length) await tx.insert(availability).values(hours.map((h) => ({ ...h, clinicianId, clinicId: req.user!.clinicId })));
  });
  await logActivity({ user: req.user!, patientId: null, kind: "booking.hours", summary: `${req.user!.displayName} changed working hours.` });
  res.json(SetAvailabilityResponse.parse({ clinicianId, hours }));
});

async function timeOffList(clinicId: string, where = eq(timeOff.clinicId, clinicId)) {
  const { db } = await getDb();
  const rows = await db
    .select({ t: timeOff, name: users.displayName })
    .from(timeOff)
    .leftJoin(users, eq(users.id, timeOff.clinicianId))
    .where(and(where, gte(timeOff.endDate, today())))
    .orderBy(asc(timeOff.startDate));
  return rows.map(({ t, name }) => ({ id: t.id, clinicianId: t.clinicianId, clinicianName: name ?? null, startDate: t.startDate, endDate: t.endDate, reason: t.reason }));
}

bookingsRouter.get("/time-off", requireRole("clinician", "admin"), async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(ListTimeOffResponse.parse({ timeOff: await timeOffList(req.user!.clinicId) }));
});

bookingsRouter.post("/time-off", requireRole("clinician", "admin"), async (req, res) => {
  const body = AddTimeOffBody.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Choose the dates." });
  const user = req.user!;
  const startDate = String(body.data.startDate).slice(0, 10);
  const endDate = String(body.data.endDate).slice(0, 10);
  if (endDate < startDate) return void res.status(400).json({ error: "The last day is before the first day." });
  // A clinic holiday (no doctor) is the admin's to set; doctors add their own leave.
  let clinicianId: string | null = null;
  if (user.role === "clinician") clinicianId = user.id;
  else if (body.data.clinicianId) {
    clinicianId = await targetClinician(user, body.data.clinicianId);
    if (!clinicianId) return void res.status(404).json({ error: "No such doctor." });
  }
  const { db } = await getDb();
  const [row] = await db
    .insert(timeOff)
    .values({ clinicId: user.clinicId, clinicianId, startDate, endDate, reason: body.data.reason.trim(), createdBy: user.id })
    .returning();
  await logActivity({
    user,
    patientId: null,
    kind: "booking.time-off",
    summary: `${user.displayName} added ${clinicianId ? "leave" : "a clinic holiday"}: ${describeDay(startDate)}${endDate !== startDate ? ` to ${describeDay(endDate)}` : ""}${row!.reason ? ` (${row!.reason})` : ""}.`,
  });
  res.json(AddTimeOffResponse.parse((await timeOffList(user.clinicId, eq(timeOff.id, row!.id)))[0]));
});

bookingsRouter.delete("/time-off/:timeOffId", requireRole("clinician", "admin"), async (req, res) => {
  const params = DeleteTimeOffParams.safeParse(req.params);
  if (!params.success) return void res.status(404).json({ error: "Not found." });
  const { db } = await getDb();
  const [t] = await db.select().from(timeOff).where(and(eq(timeOff.id, params.data.timeOffId), eq(timeOff.clinicId, req.user!.clinicId)));
  if (!t || (req.user!.role === "clinician" && t.clinicianId !== req.user!.id)) return void res.status(404).json({ error: "Not found." });
  await db.delete(timeOff).where(eq(timeOff.id, t.id));
  await logActivity({ user: req.user!, patientId: null, kind: "booking.time-off-removed", summary: `${req.user!.displayName} removed time off from ${describeDay(t.startDate)}.` });
  res.status(204).end();
});

/* ------------------------------------------------------------------ waiting list */

bookingsRouter.get("/waitlist", requireRole(), async (req, res) => {
  const user = req.user!;
  await expireOffers(user.clinicId);
  const where =
    user.role === "patient"
      ? and(eq(waitlist.patientId, user.id), inArray(waitlist.status, ["waiting", "offered"]))
      : and(
          eq(waitlist.clinicId, user.clinicId),
          inArray(waitlist.status, ["waiting", "offered"]),
          user.role === "clinician" ? eq(waitlist.clinicianId, user.id) : undefined,
        );
  res.setHeader("Cache-Control", "no-store");
  res.json(ListWaitlistResponse.parse({ entries: await loadWaitlist(where) }));
});

bookingsRouter.post("/waitlist", requireRole(), async (req, res) => {
  const body = JoinWaitlistBody.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Choose a visit type and dates." });
  const user = req.user!;
  const patient = await bookingPatient(req, res, body.data.patientId);
  if (!patient) return;
  const vt = await visitType(user.clinicId, body.data.visitTypeId);
  if (!vt) return void res.status(404).json({ error: "No such visit type." });
  const fromDate = String(body.data.fromDate).slice(0, 10);
  const toDate = String(body.data.toDate).slice(0, 10);
  if (fromDate < today() || toDate < fromDate || toDate > addDays(today(), RULES.horizonDays)) {
    return void res.status(400).json({ error: `Choose dates from today up to ${RULES.horizonDays} days ahead.` });
  }
  const { db } = await getDb();
  const [row] = await db
    .insert(waitlist)
    .values({ clinicId: user.clinicId, patientId: patient.id, clinicianId: patient.clinicianId, visitTypeId: vt.id, fromDate, toDate, timeOfDay: body.data.timeOfDay })
    .returning({ id: waitlist.id });
  await logActivity({
    user,
    patientId: patient.id,
    kind: "booking.waitlist",
    summary: `${patient.displayName} joined the waiting list for a ${vt.name}, ${describeDay(fromDate)} to ${describeDay(toDate)} (${body.data.timeOfDay === "any" ? "any time" : body.data.timeOfDay}).`,
  });
  res.json(JoinWaitlistResponse.parse((await loadWaitlist(eq(waitlist.id, row!.id)))[0]));
});

async function waitlistEntry(user: SignedInUser, id: string) {
  const { db } = await getDb();
  const [w] = await db.select().from(waitlist).where(and(eq(waitlist.id, id), eq(waitlist.clinicId, user.clinicId)));
  if (!w) return null;
  if (user.role === "patient" && w.patientId !== user.id) return null;
  if (user.role === "clinician" && w.clinicianId !== user.id) return null;
  return w;
}

bookingsRouter.delete("/waitlist/:entryId", requireRole(), async (req, res) => {
  const params = LeaveWaitlistParams.safeParse(req.params);
  const w = params.success ? await waitlistEntry(req.user!, params.data.entryId) : null;
  if (!w) return void res.status(404).json({ error: "Not on the waiting list." });
  const { db } = await getDb();
  await db.update(waitlist).set({ status: "removed", updatedAt: clock.now() }).where(eq(waitlist.id, w.id));
  if (w.status === "offered" && w.offerStartsAt) await offerFreedTime(w.clinicId, w.clinicianId, w.offerStartsAt, [w.id]);
  await logActivity({ user: req.user!, patientId: w.patientId, kind: "booking.waitlist-left", summary: `${req.user!.displayName} took an entry off the waiting list.` });
  res.status(204).end();
});

bookingsRouter.post("/waitlist/:entryId/accept", requireRole(), async (req, res) => {
  const params = AcceptOfferParams.safeParse(req.params);
  const user = req.user!;
  await expireOffers(user.clinicId);
  const w = params.success ? await waitlistEntry(user, params.data.entryId) : null;
  if (!w) return void res.status(404).json({ error: "Not on the waiting list." });
  if (w.status !== "offered" || !w.offerStartsAt) return void res.status(409).json({ error: "This offer has run out. You're still on the waiting list." });
  const vt = (await visitType(user.clinicId, w.visitTypeId))!;
  const start = w.offerStartsAt;
  const reason = await checkTime({ clinicId: user.clinicId, clinicianId: w.clinicianId, patientId: w.patientId, visitType: vt, start });
  const { db } = await getDb();
  if (reason) {
    await db.update(waitlist).set({ status: "waiting", offerStartsAt: null, offerExpiresAt: null, updatedAt: clock.now() }).where(eq(waitlist.id, w.id));
    return void res.status(409).json({ error: "Sorry, that time has just been taken. You're still on the waiting list." });
  }
  const [row] = await db
    .insert(appointments)
    .values({
      clinicId: user.clinicId,
      clinicianId: w.clinicianId,
      patientId: w.patientId,
      visitTypeId: vt.id,
      startsAt: start,
      endsAt: new Date(start.getTime() + vt.minutes * 60_000),
      status: "confirmed",
      createdBy: user.id,
      note: "Booked from the waiting list",
    })
    .returning({ id: appointments.id });
  await db.update(waitlist).set({ status: "booked", updatedAt: clock.now() }).where(eq(waitlist.id, w.id));
  const [patient] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, w.patientId));
  await logActivity({
    user,
    patientId: w.patientId,
    kind: "booking.created",
    summary: `${patient?.name ?? "The patient"} took the offered ${visitLabel(vt, start)} from the waiting list.`,
    detail: { appointmentId: row!.id },
  });
  res.json(AcceptOfferResponse.parse(await one(row!.id, user)));
});

bookingsRouter.post("/waitlist/:entryId/decline", requireRole(), async (req, res) => {
  const params = DeclineOfferParams.safeParse(req.params);
  const w = params.success ? await waitlistEntry(req.user!, params.data.entryId) : null;
  if (!w) return void res.status(404).json({ error: "Not on the waiting list." });
  if (w.status !== "offered" || !w.offerStartsAt) return void res.status(404).json({ error: "There is no offer to decline." });
  const { db } = await getDb();
  await db.update(waitlist).set({ status: "waiting", offerStartsAt: null, offerExpiresAt: null, updatedAt: clock.now() }).where(eq(waitlist.id, w.id));
  await logActivity({ user: req.user!, patientId: w.patientId, kind: "booking.offer-declined", summary: `${req.user!.displayName} said no to an offered slot on ${describeTime(w.offerStartsAt)}.` });
  await offerFreedTime(w.clinicId, w.clinicianId, w.offerStartsAt, [w.id]);
  res.json(DeclineOfferResponse.parse((await loadWaitlist(eq(waitlist.id, w.id)))[0]));
});
