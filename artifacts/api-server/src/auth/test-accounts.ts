import { getDb, schema, type UserRole } from "@kynex/db";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "./passwords.ts";

const { clinics, users } = schema;

export const CLINIC_NAME = "QI Spine";
export const MIN_DEMO_PASSWORD_LENGTH = 10;

/**
 * Phase 1 has no sign-up page: these ready-made accounts are created at start-up,
 * all sharing the password in the DEMO_PASSWORD secret. Each starts empty.
 */
export const TEST_ACCOUNTS: { email: string; displayName: string; role: UserRole }[] = [
  { email: "admin@kynex.test", displayName: "Admin", role: "admin" },
  { email: "clinician1@kynex.test", displayName: "Clinician One", role: "clinician" },
  { email: "clinician2@kynex.test", displayName: "Clinician Two", role: "clinician" },
  { email: "patient1@kynex.test", displayName: "Patient One", role: "patient" },
  { email: "patient2@kynex.test", displayName: "Patient Two", role: "patient" },
  { email: "patient3@kynex.test", displayName: "Patient Three", role: "patient" },
  { email: "patient4@kynex.test", displayName: "Patient Four", role: "patient" },
  { email: "patient5@kynex.test", displayName: "Patient Five", role: "patient" },
];

/**
 * Creates the clinic and any missing test accounts. If DEMO_PASSWORD has changed,
 * moves the accounts to the new one. Nothing else on existing accounts is touched.
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
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, account.email));
    if (!existing) {
      await db.insert(users).values({ ...account, clinicId: clinic.id, passwordHash: await hashPassword(password) });
    } else if (!(await verifyPassword(password, existing.passwordHash))) {
      await db.update(users).set({ passwordHash: await hashPassword(password), updatedAt: new Date() }).where(eq(users.id, existing.id));
    }
  }
  console.log(`Test accounts ready (${TEST_ACCOUNTS.length}) in clinic "${CLINIC_NAME}".`);
}
