import { ListUsersResponse, ResetUserParams, ResetUserResponse } from "@kynex/api-zod";
import { getDb, schema } from "@kynex/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { Router } from "express";
import { requireRole } from "../auth/sessions.ts";

const { activity, appointments, loginSessions, patientNotes, prescriptions, sessions, symptomReports, users, waitlist } = schema;

export const adminRouter = Router();
adminRouter.use("/admin", requireRole("admin"));

const columns = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  role: users.role,
  freshSince: users.freshSince,
  lastSignInAt: users.lastSignInAt,
  lockedUntil: users.lockedUntil,
};
type Row = Pick<typeof users.$inferSelect, keyof typeof columns>;

const toAdminUser = (u: Row) => ({
  ...u,
  freshSince: u.freshSince.toISOString(),
  lastSignInAt: u.lastSignInAt?.toISOString() ?? null,
  // An old lock that has run out is no longer a lock.
  lockedUntil: u.lockedUntil && u.lockedUntil > new Date() ? u.lockedUntil.toISOString() : null,
});

adminRouter.get("/admin/users", async (req, res) => {
  const { db } = await getDb();
  const rows = await db
    .select(columns)
    .from(users)
    .where(eq(users.clinicId, req.user!.clinicId)) // only this admin's clinic
    .orderBy(sql`case ${users.role} when 'admin' then 0 when 'clinician' then 1 else 2 end`, asc(users.email));
  res.setHeader("Cache-Control", "no-store");
  res.json(ListUsersResponse.parse({ users: rows.map(toAdminUser) }));
});

adminRouter.post("/admin/users/:userId/reset", async (req, res) => {
  const params = ResetUserParams.safeParse(req.params);
  if (!params.success) return void res.status(400).json({ error: "That account link isn't valid." });
  if (params.data.userId === req.user!.id) {
    return void res.status(400).json({ error: "You can't reset your own account while signed in to it." });
  }
  const { db } = await getDb();
  const [row] = await db
    .update(users)
    .set({ failedSignIns: 0, lockedUntil: null, freshSince: new Date(), updatedAt: new Date() })
    .where(and(eq(users.id, params.data.userId), eq(users.clinicId, req.user!.clinicId)))
    .returning(columns);
  if (!row) return void res.status(404).json({ error: "No such account in your clinic." });
  // Sign the account out on every device, and (for a patient) clear their journey: plan, sessions and
  // results, symptom reports, notes, visits, waiting list and activity. The doctor stays assigned.
  await db.delete(loginSessions).where(eq(loginSessions.userId, row.id));
  if (row.role === "patient") {
    for (const table of [prescriptions, sessions, symptomReports, patientNotes, appointments, waitlist, activity]) {
      await db.delete(table).where(eq(table.patientId, row.id));
    }
  }
  res.json(ResetUserResponse.parse(toAdminUser(row)));
});
