import { getDb, schema } from "@kynex/db";
import { and, eq } from "drizzle-orm";
import type { SignedInUser } from "../auth/sessions.ts";

const { careTeams, users } = schema;

export interface PatientAccess {
  id: string;
  clinicId: string;
  displayName: string;
  email: string;
  clinicianId: string | null;
}

/**
 * The patient, if the signed-in person may see them: the patient themself, their own doctor,
 * or an admin of the same clinic. Anyone else gets null (shown as "not found", so the API
 * never confirms that someone else's patient exists).
 */
export async function patientFor(user: SignedInUser, patientId: string): Promise<PatientAccess | null> {
  const { db } = await getDb();
  const [row] = await db
    .select({ id: users.id, clinicId: users.clinicId, displayName: users.displayName, email: users.email, clinicianId: careTeams.clinicianId })
    .from(users)
    .leftJoin(careTeams, eq(careTeams.patientId, users.id))
    .where(and(eq(users.id, patientId), eq(users.clinicId, user.clinicId), eq(users.role, "patient")))
    .limit(1);
  if (!row) return null;
  if (user.role === "patient" && user.id !== row.id) return null;
  if (user.role === "clinician" && row.clinicianId !== user.id) return null;
  return row;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: unknown): s is string => typeof s === "string" && UUID.test(s);
