import { getDb, schema, type AppointmentStatus } from "@kynex/db";
import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, ne, notInArray, or, type SQL } from "drizzle-orm";
import type { SignedInUser } from "../auth/sessions.ts";
import { logActivity } from "../care/activity.ts";
import { addDays, atMinute, clock, dayOf, describeTime, minuteOf, today, weekdayOf } from "../care/time.ts";
import { alias } from "drizzle-orm/pg-core";

const { appointments, availability, timeOff, users, visitTypes, waitlist } = schema;

/** Booking rules (drafts, QI Spine can change them). */
export const RULES = {
  /** Free minutes the doctor keeps between two visits. */
  bufferMinutes: 10,
  /** Patients can move or cancel up to this many hours before the visit. */
  patientCutoffHours: 12,
  /** How far ahead anyone can book. */
  horizonDays: 60,
  /** Start times are offered every this many minutes. */
  stepMinutes: 15,
  /** Same-day bookings need at least this much notice. */
  minNoticeMinutes: 30,
  /** A waiting-list offer is held this long (or until 1 hour before the visit). */
  offerHoldHours: 12,
};

/** Visits that still take up time. */
export const ACTIVE: AppointmentStatus[] = ["booked", "confirmed", "arrived"];
const FINAL: AppointmentStatus[] = ["completed", "no-show", "cancelled"];
export const isFinal = (s: AppointmentStatus) => FINAL.includes(s);

type VisitType = typeof visitTypes.$inferSelect;

/* ------------------------------------------------------------- reading */

const patientU = alias(users, "patient_u");
const clinicianU = alias(users, "clinician_u");
const creatorU = alias(users, "creator_u");

/** Visits with names attached, in time order. */
export async function loadAppointments(where: SQL | undefined, viewer?: SignedInUser, limit?: number) {
  const { db } = await getDb();
  const q = db
    .select({
      a: appointments,
      vt: visitTypes,
      patientName: patientU.displayName,
      clinicianName: clinicianU.displayName,
      createdByName: creatorU.displayName,
    })
    .from(appointments)
    .innerJoin(visitTypes, eq(visitTypes.id, appointments.visitTypeId))
    .innerJoin(patientU, eq(patientU.id, appointments.patientId))
    .innerJoin(clinicianU, eq(clinicianU.id, appointments.clinicianId))
    .leftJoin(creatorU, eq(creatorU.id, appointments.createdBy))
    .where(where)
    .orderBy(asc(appointments.startsAt))
    .limit(limit ?? 5000);
  const rows = await q;
  return rows.map(({ a, vt, patientName, clinicianName, createdByName }) => ({
    id: a.id,
    patient: { id: a.patientId, displayName: patientName },
    clinician: { id: a.clinicianId, displayName: clinicianName },
    visitType: visitTypeDto(vt),
    startsAt: a.startsAt.toISOString(),
    endsAt: a.endsAt.toISOString(),
    status: a.status,
    seriesId: a.seriesId,
    meetingLink: a.meetingLink,
    note: a.note,
    cancelReason: a.cancelReason,
    createdByName: createdByName ?? null,
    canChange: viewer ? canChange(viewer, a) === null : false,
  }));
}
export type AppointmentDto = Awaited<ReturnType<typeof loadAppointments>>[number];

export const visitTypeDto = (vt: VisitType) => ({ id: vt.id, code: vt.code, name: vt.name, nameHi: vt.nameHi, minutes: vt.minutes, mode: vt.mode });

/** Why this person may not move or cancel the visit, or null if they may. */
export function canChange(user: SignedInUser, a: typeof appointments.$inferSelect): string | null {
  if (isFinal(a.status) || a.status === "arrived") return "This visit can no longer be changed.";
  if (user.role === "patient") {
    if (a.patientId !== user.id) return "This isn't your visit.";
    if (a.startsAt.getTime() - clock.now().getTime() < RULES.patientCutoffHours * 3600_000) {
      return `Visits can be moved or cancelled up to ${RULES.patientCutoffHours} hours before. Please call the clinic.`;
    }
  }
  return null;
}

/** The next visit still to come for a patient. */
export async function nextAppointment(patientId: string, viewer?: SignedInUser) {
  const [next] = await loadAppointments(
    and(eq(appointments.patientId, patientId), inArray(appointments.status, ACTIVE), gt(appointments.endsAt, clock.now())),
    viewer,
    1,
  );
  return next ?? null;
}

/* ------------------------------------------------------------- free time */

interface Busy {
  start: number;
  end: number;
  doctor: boolean;
}

/** Why the whole day is closed, or null. */
async function dayClosed(clinicId: string, clinicianId: string, day: string): Promise<string | null> {
  if (day < today()) return "That day has passed.";
  if (day > addDays(today(), RULES.horizonDays)) return `Visits can be booked up to ${RULES.horizonDays} days ahead.`;
  const { db } = await getDb();
  const [off] = await db
    .select({ clinicianId: timeOff.clinicianId, reason: timeOff.reason })
    .from(timeOff)
    .where(
      and(
        eq(timeOff.clinicId, clinicId),
        lte(timeOff.startDate, day),
        gte(timeOff.endDate, day),
        or(isNull(timeOff.clinicianId), eq(timeOff.clinicianId, clinicianId)),
      ),
    )
    .limit(1);
  if (off) return off.clinicianId ? `The doctor is on leave${off.reason ? ` (${off.reason})` : ""}.` : `The clinic is closed${off.reason ? `: ${off.reason}` : ""}.`;
  return null;
}

async function workingWindows(clinicianId: string, day: string) {
  const { db } = await getDb();
  return db
    .select({ start: availability.startMinute, end: availability.endMinute })
    .from(availability)
    .where(and(eq(availability.clinicianId, clinicianId), eq(availability.weekday, weekdayOf(day))))
    .orderBy(asc(availability.startMinute));
}

async function busyTimes(clinicianId: string, patientId: string | null, day: string, ignoreId?: string): Promise<Busy[]> {
  const { db } = await getDb();
  const from = atMinute(day, 0);
  const to = atMinute(addDays(day, 1), 0);
  const who = patientId ? or(eq(appointments.clinicianId, clinicianId), eq(appointments.patientId, patientId)) : eq(appointments.clinicianId, clinicianId);
  const rows = await db
    .select({ start: appointments.startsAt, end: appointments.endsAt, clinicianId: appointments.clinicianId })
    .from(appointments)
    .where(
      and(
        who,
        inArray(appointments.status, ACTIVE),
        lt(appointments.startsAt, to),
        gt(appointments.endsAt, from),
        ignoreId ? ne(appointments.id, ignoreId) : undefined,
      ),
    );
  return rows.map((r) => ({ start: r.start.getTime(), end: r.end.getTime(), doctor: r.clinicianId === clinicianId }));
}

/** Why a visit can't start at `start`, or null if it can. */
function clash(start: Date, minutes: number, windows: { start: number; end: number }[], busy: Busy[], day: string): string | null {
  const s = start.getTime();
  const e = s + minutes * 60_000;
  if (s < clock.now().getTime() + RULES.minNoticeMinutes * 60_000) return "That time has passed (or is too soon to book).";
  const m = minuteOf(start);
  if (dayOf(start) !== day || !windows.some((w) => m >= w.start && m + minutes <= w.end)) return "Outside the doctor's working hours.";
  const buffer = RULES.bufferMinutes * 60_000;
  for (const b of busy) {
    if (b.doctor && s < b.end + buffer && e > b.start - buffer) return "Clashes with another visit (or the 10-minute gap between visits).";
    if (!b.doctor && s < b.end && e > b.start) return "The patient already has a visit then.";
  }
  return null;
}

/** Free start times on a day. */
export async function freeSlots(opts: { clinicId: string; clinicianId: string; patientId: string | null; visitType: VisitType; day: string; ignoreId?: string }) {
  const closed = await dayClosed(opts.clinicId, opts.clinicianId, opts.day);
  if (closed) return { slots: [], closed };
  const windows = await workingWindows(opts.clinicianId, opts.day);
  if (!windows.length) return { slots: [], closed: "The doctor doesn't work on this day." };
  const busy = await busyTimes(opts.clinicianId, opts.patientId, opts.day, opts.ignoreId);
  const slots: { startsAt: string; endsAt: string }[] = [];
  for (const w of windows) {
    for (let m = w.start; m + opts.visitType.minutes <= w.end; m += RULES.stepMinutes) {
      const start = atMinute(opts.day, m);
      if (!clash(start, opts.visitType.minutes, windows, busy, opts.day)) {
        slots.push({ startsAt: start.toISOString(), endsAt: new Date(start.getTime() + opts.visitType.minutes * 60_000).toISOString() });
      }
    }
  }
  return { slots, closed: slots.length ? null : "No free times left on this day." };
}

/** Why a visit can't be booked at this time, or null. */
export async function checkTime(opts: { clinicId: string; clinicianId: string; patientId: string; visitType: VisitType; start: Date; ignoreId?: string }) {
  const day = dayOf(opts.start);
  const closed = await dayClosed(opts.clinicId, opts.clinicianId, day);
  if (closed) return closed;
  const windows = await workingWindows(opts.clinicianId, day);
  if (!windows.length) return "The doctor doesn't work on this day.";
  return clash(opts.start, opts.visitType.minutes, windows, await busyTimes(opts.clinicianId, opts.patientId, day, opts.ignoreId), day);
}

/* ------------------------------------------------------------- waiting list */

/**
 * A visit time has just become free: offer it to the first patient waiting for that doctor whose
 * dates, time of day and visit length fit. `skip` = entries that already said no to it.
 */
export async function offerFreedTime(clinicId: string, clinicianId: string, start: Date, skip: string[] = []) {
  const { db } = await getDb();
  const day = dayOf(start);
  const expires = new Date(Math.min(start.getTime() - 3600_000, clock.now().getTime() + RULES.offerHoldHours * 3600_000));
  if (expires <= clock.now()) return;
  const waiting = await db
    .select({ w: waitlist, vt: visitTypes })
    .from(waitlist)
    .innerJoin(visitTypes, eq(visitTypes.id, waitlist.visitTypeId))
    .where(
      and(
        eq(waitlist.clinicId, clinicId),
        eq(waitlist.clinicianId, clinicianId),
        eq(waitlist.status, "waiting"),
        lte(waitlist.fromDate, day),
        gte(waitlist.toDate, day),
        skip.length ? notInArray(waitlist.id, skip) : undefined,
      ),
    )
    .orderBy(asc(waitlist.createdAt));
  for (const { w, vt } of waiting) {
    const m = minuteOf(start);
    if (w.timeOfDay === "morning" && m >= 13 * 60) continue;
    if (w.timeOfDay === "afternoon" && m < 13 * 60) continue;
    if (await checkTime({ clinicId, clinicianId, patientId: w.patientId, visitType: vt, start })) continue;
    // Only one live offer per time slot.
    const [taken] = await db
      .select({ id: waitlist.id })
      .from(waitlist)
      .where(and(eq(waitlist.clinicianId, clinicianId), eq(waitlist.status, "offered"), eq(waitlist.offerStartsAt, start)))
      .limit(1);
    if (taken) return;
    await db
      .update(waitlist)
      .set({ status: "offered", offerStartsAt: start, offerExpiresAt: expires, updatedAt: clock.now() })
      .where(eq(waitlist.id, w.id));
    await logActivity({
      user: { id: null, clinicId },
      patientId: w.patientId,
      kind: "booking.offered",
      summary: `A ${vt.name} slot on ${describeTime(start)} was offered from the waiting list.`,
      detail: { waitlistId: w.id },
    });
    return;
  }
}

/** Offers not taken in time go back to waiting, and their slot moves on to the next person. */
export async function expireOffers(clinicId: string) {
  const { db } = await getDb();
  const expired = await db
    .select()
    .from(waitlist)
    .where(and(eq(waitlist.clinicId, clinicId), eq(waitlist.status, "offered"), lt(waitlist.offerExpiresAt, clock.now())));
  for (const w of expired) {
    await db.update(waitlist).set({ status: "waiting", offerStartsAt: null, offerExpiresAt: null, updatedAt: clock.now() }).where(eq(waitlist.id, w.id));
    if (w.offerStartsAt) await offerFreedTime(clinicId, w.clinicianId, w.offerStartsAt, [w.id]);
  }
}

const patientW = alias(users, "patient_w");

export async function loadWaitlist(where: SQL | undefined) {
  const { db } = await getDb();
  const rows = await db
    .select({ w: waitlist, vt: visitTypes, patientName: patientW.displayName })
    .from(waitlist)
    .innerJoin(visitTypes, eq(visitTypes.id, waitlist.visitTypeId))
    .innerJoin(patientW, eq(patientW.id, waitlist.patientId))
    .where(where)
    .orderBy(asc(waitlist.createdAt));
  return rows.map(({ w, vt, patientName }) => ({
    id: w.id,
    patient: { id: w.patientId, displayName: patientName },
    visitType: visitTypeDto(vt),
    fromDate: w.fromDate,
    toDate: w.toDate,
    timeOfDay: w.timeOfDay,
    status: w.status,
    offerStartsAt: w.offerStartsAt?.toISOString() ?? null,
    offerExpiresAt: w.offerExpiresAt?.toISOString() ?? null,
    createdAt: w.createdAt.toISOString(),
  }));
}
