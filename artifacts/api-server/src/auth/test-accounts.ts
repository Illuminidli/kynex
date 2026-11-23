import { getDb, schema, type UserRole } from "@kynex/db";
import { and, eq, inArray, like, notInArray } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./passwords.ts";

const { availability, careTeams, clinics, users, visitTypes } = schema;

export const CLINIC_NAME = "QI Spine";
export const MIN_DEMO_PASSWORD_LENGTH = 10;

/**
 * Phase 1 has no sign-up page: these ready-made accounts are created at start-up,
 * all sharing the password in the DEMO_PASSWORD secret. Each starts empty.
 * The demo has one doctor and two patients (decided 23 Nov 2026).
 */
export const TEST_ACCOUNTS: { email: string; displayName: string; role: UserRole }[] = [
  { email: "admin@kynex.test", displayName: "Admin", role: "admin" },
  { email: "clinician1@kynex.test", displayName: "Doctor One", role: "clinician" },
  { email: "patient1@kynex.test", displayName: "Patient One", role: "patient" },
  { email: "patient2@kynex.test", displayName: "Patient Two", role: "patient" },
];

/** Visit types offered (drafts, QI Spine can change them). */
export const VISIT_TYPES = [
  { code: "assessment", name: "First assessment", nameHi: "पहली जाँच", minutes: 45, mode: "clinic" as const, sort: 0 },
  { code: "follow-up", name: "Follow-up", nameHi: "फ़ॉलो-अप", minutes: 30, mode: "clinic" as const, sort: 1 },
  { code: "video", name: "Video consult", nameHi: "वीडियो परामर्श", minutes: 20, mode: "video" as const, sort: 2 },
  { code: "home", name: "Home visit", nameHi: "घर पर विज़िट", minutes: 60, mode: "home" as const, sort: 3 },
];

/** A doctor's starting hours: Monday to Saturday, 9 to 1 and 2 to 6 (India time). */
const DEFAULT_HOURS = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
  { weekday, startMinute: 9 * 60, endMinute: 13 * 60 },
  { weekday, startMinute: 14 * 60, endMinute: 18 * 60 },
]);

/**
 * Creates the clinic and any missing test accounts. If DEMO_PASSWORD has changed,
 * moves the accounts to the new one. Test accounts no longer in the list are removed
 * (with everything of theirs). Each patient gets the doctor; the clinic gets its visit
 * types and the doctor default working hours, once.
 */
export async function ensureTestAccounts(password: string | undefined): Promise<void> {
  if (!password || password.length < MIN_DEMO_PASSWORD_LENGTH) {
    console.warn(`Test accounts not set up: add a DEMO_PASSWORD secret of at least ${MIN_DEMO_PASSWORD_LENGTH} characters, then restart.`);
    return;
  }
  const { db } = await getDb();
  await db.insert(clinics).values({ name: CLINIC_NAME }).onConflictDoNothing({ target: clinics.name });
  const [clinic] = await db.select({ id: clinics.id }).from(clinics).where(eq(clinics.name, CLINIC_NAME));
  if (!clinic) throw new Error("Could not create the clinic.");

  for (const account of TEST_ACCOUNTS) {
    const [existing] = await db
      .select({ id: users.id, passwordHash: users.passwordHash, displayName: users.displayName })
      .from(users)
      .where(eq(users.email, account.email));
    if (!existing) {
      await db.insert(users).values({ ...account, clinicId: clinic.id, passwordHash: await hashPassword(password) });
      continue;
    }
    if (!(await verifyPassword(password, existing.passwordHash))) {
      await db.update(users).set({ passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(users.id, existing.id));
    }
    if (existing.displayName !== account.displayName) {
      await db.update(users).set({ displayName: account.displayName, updatedAt: new Date() }).where(eq(users.id, existing.id));
    }
  }
  // Earlier test accounts (clinician2, patient3-5) are no longer part of the demo.
  await db.delete(users).where(
    and(
      like(users.email, "%@kynex.test"),
      notInArray(
        users.email,
        TEST_ACCOUNTS.map((a) => a.email),
      ),
    ),
  );

  const [doctor] = await db.select({ id: users.id }).from(users).where(eq(users.email, "clinician1@kynex.test"));
  const patients = await db
    .select({ id: users.id })
    .from(users)
    .where(
      inArray(
        users.email,
        TEST_ACCOUNTS.filter((a) => a.role === "patient").map((a) => a.email),
      ),
    );
  if (doctor) {
    for (const p of patients) {
      await db.insert(careTeams).values({ patientId: p.id, clinicianId: doctor.id, clinicId: clinic.id }).onConflictDoNothing();
    }
    const [hasHours] = await db.select({ id: availability.id }).from(availability).where(eq(availability.clinicianId, doctor.id)).limit(1);
    if (!hasHours) await db.insert(availability).values(DEFAULT_HOURS.map((h) => ({ ...h, clinicianId: doctor.id, clinicId: clinic.id })));
  }
  await db
    .insert(visitTypes)
    .values(VISIT_TYPES.map((v) => ({ ...v, clinicId: clinic.id })))
    .onConflictDoNothing();

  console.log(`Test accounts ready (${TEST_ACCOUNTS.length}) in clinic "${CLINIC_NAME}".`);
}
