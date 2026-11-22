import { getDb, schema, type UserRole } from "@kynex/db";
import { and, desc, eq, gte, inArray, like, lt, sql, type SQL } from "drizzle-orm";
import { addDays, atMinute } from "./time.ts";
import { alias } from "drizzle-orm/pg-core";

const { activity, users } = schema;

export type ActivityArea = "plan" | "session" | "symptom" | "booking" | "review" | "note" | "account";

/** Kinds start with their area: plan.changed, session.completed, booking.cancelled ... */
export const areaOf = (kind: string): ActivityArea => {
  const head = kind.split(".")[0] as ActivityArea;
  return (["plan", "session", "symptom", "booking", "review", "note", "account"] as const).includes(head) ? head : "account";
};

/** Adds one line to the activity log (the audit trail and the admin's feed). */
export async function logActivity(entry: {
  /** Who did it (null = Kynex itself, e.g. an automatic waiting-list offer). */
  user: { id: string | null; clinicId: string };
  patientId: string | null;
  kind: string;
  summary: string;
  detail?: Record<string, unknown>;
}) {
  const { db } = await getDb();
  await db.insert(activity).values({
    clinicId: entry.user.clinicId,
    actorId: entry.user.id,
    patientId: entry.patientId,
    kind: entry.kind,
    summary: entry.summary,
    detail: entry.detail ?? {},
  });
}

const actor = alias(users, "actor");
const patient = alias(users, "patient");

/** Newest first. `patientIds` limits it to some patients (a doctor's own). */
export async function listActivity(
  clinicId: string,
  filter: { patientIds?: string[]; area?: ActivityArea; from?: string; to?: string; limit?: number },
) {
  const { db } = await getDb();
  const where: (SQL | undefined)[] = [eq(activity.clinicId, clinicId)];
  if (filter.patientIds) where.push(filter.patientIds.length ? inArray(activity.patientId, filter.patientIds) : sql`false`);
  if (filter.area) where.push(like(activity.kind, `${filter.area}.%`));
  if (filter.from) where.push(gte(activity.createdAt, atMinute(filter.from, 0)));
  if (filter.to) where.push(lt(activity.createdAt, atMinute(addDays(filter.to, 1), 0)));
  const rows = await db
    .select({
      a: activity,
      actorName: actor.displayName,
      actorRole: actor.role,
      patientName: patient.displayName,
    })
    .from(activity)
    .leftJoin(actor, eq(actor.id, activity.actorId))
    .leftJoin(patient, eq(patient.id, activity.patientId))
    .where(and(...where))
    .orderBy(desc(activity.createdAt))
    .limit(filter.limit ?? 100);
  return rows.map(({ a, actorName, actorRole, patientName }) => ({
    id: a.id,
    kind: a.kind,
    area: areaOf(a.kind),
    summary: a.summary,
    createdAt: a.createdAt.toISOString(),
    actorName: actorName ?? null,
    actorRole: (actorRole as UserRole | null) ?? null,
    patient: a.patientId && patientName ? { id: a.patientId, displayName: patientName } : null,
    sessionId: typeof a.detail.sessionId === "string" ? a.detail.sessionId : null,
    appointmentId: typeof a.detail.appointmentId === "string" ? a.detail.appointmentId : null,
  }));
}
