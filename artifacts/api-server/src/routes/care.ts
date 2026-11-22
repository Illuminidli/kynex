import {
  AcknowledgeSymptomParams,
  AcknowledgeSymptomResponse,
  AddNoteBody,
  AddNoteParams,
  AddNoteResponse,
  GetPatientParams,
  GetPatientResponse,
  GetPlanParams,
  GetPlanResponse,
  ListPatientsResponse,
  ReportSymptomBody,
  ReportSymptomResponse,
  SavePlanBody,
  SavePlanParams,
  SavePlanResponse,
} from "@kynex/api-zod";
import { getDb, schema } from "@kynex/db";
import { and, eq, gt, inArray } from "drizzle-orm";
import { Router } from "express";
import { requireRole } from "../auth/sessions.ts";
import { ACTIVE, loadAppointments } from "../bookings/rules.ts";
import { listActivity, logActivity } from "../care/activity.ts";
import { patientFor } from "../care/access.ts";
import { patientOverview, patientRows, symptomDto } from "../care/insights.ts";
import { loadPlan, PlanProblem, savePlan } from "../care/plans.ts";
import { clock } from "../care/time.ts";

const { appointments, patientNotes, sessions, symptomReports, users } = schema;

export const careRouter = Router();
const NOT_FOUND = { error: "No such patient in your list." };

careRouter.get("/patients", requireRole("clinician", "admin"), async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(ListPatientsResponse.parse({ patients: await patientRows(req.user!) }));
});

careRouter.get("/patients/:patientId", requireRole("clinician", "admin"), async (req, res) => {
  const params = GetPatientParams.safeParse(req.params);
  const patient = params.success ? await patientFor(req.user!, params.data.patientId) : null;
  if (!patient) return void res.status(404).json(NOT_FOUND);
  const { db } = await getDb();
  const [doc] = patient.clinicianId ? await db.select({ name: users.displayName }).from(users).where(eq(users.id, patient.clinicianId)) : [];
  const overview = await patientOverview(patient.id, patient.clinicId);
  res.setHeader("Cache-Control", "no-store");
  res.json(
    GetPatientResponse.parse({
      patient: { id: patient.id, displayName: patient.displayName, email: patient.email },
      clinicianName: doc?.name ?? null,
      ...overview,
      appointments: await loadAppointments(
        and(eq(appointments.patientId, patient.id), inArray(appointments.status, ACTIVE), gt(appointments.endsAt, clock.now())),
        req.user,
      ),
      activity: await listActivity(patient.clinicId, { patientIds: [patient.id], limit: 30 }),
    }),
  );
});

careRouter.get("/patients/:patientId/plan", requireRole("clinician", "admin"), async (req, res) => {
  const params = GetPlanParams.safeParse(req.params);
  const patient = params.success ? await patientFor(req.user!, params.data.patientId) : null;
  if (!patient) return void res.status(404).json(NOT_FOUND);
  res.setHeader("Cache-Control", "no-store");
  res.json(GetPlanResponse.parse({ plan: await loadPlan(patient.id, patient.clinicId) }));
});

careRouter.put("/patients/:patientId/plan", requireRole("clinician", "admin"), async (req, res) => {
  const params = SavePlanParams.safeParse(req.params);
  const patient = params.success ? await patientFor(req.user!, params.data.patientId) : null;
  if (!patient) return void res.status(404).json(NOT_FOUND);
  const body = SavePlanBody.safeParse(req.body);
  if (!body.success) return void res.status(400).json({ error: "Some plan details are missing or out of range. Check each exercise and try again." });
  let change: string;
  try {
    change = await savePlan(patient.id, patient.clinicId, req.user!.id, body.data);
  } catch (err) {
    if (err instanceof PlanProblem) return void res.status(400).json({ error: err.message });
    throw err;
  }
  await logActivity({
    user: req.user!,
    patientId: patient.id,
    kind: "plan.changed",
    summary: `${req.user!.displayName} updated ${patient.displayName}'s plan: ${change}.`,
  });
  res.json(SavePlanResponse.parse({ plan: await loadPlan(patient.id, patient.clinicId) }));
});

careRouter.post("/patients/:patientId/notes", requireRole("clinician", "admin"), async (req, res) => {
  const params = AddNoteParams.safeParse(req.params);
  const patient = params.success ? await patientFor(req.user!, params.data.patientId) : null;
  if (!patient) return void res.status(404).json(NOT_FOUND);
  const body = AddNoteBody.safeParse(req.body);
  if (!body.success || !body.data.text.trim()) return void res.status(400).json({ error: "Write the note first." });
  const { db } = await getDb();
  const [note] = await db
    .insert(patientNotes)
    .values({ clinicId: patient.clinicId, patientId: patient.id, authorId: req.user!.id, text: body.data.text.trim() })
    .returning();
  await logActivity({ user: req.user!, patientId: patient.id, kind: "note.added", summary: `${req.user!.displayName} added a note about ${patient.displayName}.` });
  res.json(AddNoteResponse.parse({ id: note!.id, text: note!.text, createdAt: note!.createdAt.toISOString(), authorName: req.user!.displayName }));
});

careRouter.post("/symptoms", requireRole("patient"), async (req, res) => {
  const body = ReportSymptomBody.safeParse(req.body);
  if (!body.success || (!body.data.text.trim() && body.data.pain === null)) {
    return void res.status(400).json({ error: "Say what you're feeling, or give a pain score." });
  }
  const { db } = await getDb();
  let sessionId = body.data.sessionId;
  if (sessionId) {
    const [own] = await db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.patientId, req.user!.id)));
    if (!own) sessionId = null;
  }
  const [row] = await db
    .insert(symptomReports)
    .values({
      clinicId: req.user!.clinicId,
      patientId: req.user!.id,
      sessionId,
      source: sessionId ? "session" : "home",
      pain: body.data.pain,
      text: body.data.text.trim(),
    })
    .returning();
  await logActivity({
    user: req.user!,
    patientId: req.user!.id,
    kind: "symptom.reported",
    summary: `${req.user!.displayName} reported a symptom${body.data.pain !== null ? ` (pain ${body.data.pain}/10)` : ""}${body.data.text.trim() ? `: "${body.data.text.trim().slice(0, 120)}"` : "."}`,
    detail: sessionId ? { sessionId } : {},
  });
  res.json(ReportSymptomResponse.parse(symptomDto(row!, null)));
});

careRouter.post("/symptoms/:symptomId/acknowledge", requireRole("clinician", "admin"), async (req, res) => {
  const params = AcknowledgeSymptomParams.safeParse(req.params);
  if (!params.success) return void res.status(404).json({ error: "No such symptom report." });
  const { db } = await getDb();
  const [s] = await db.select().from(symptomReports).where(eq(symptomReports.id, params.data.symptomId));
  const patient = s ? await patientFor(req.user!, s.patientId) : null;
  if (!s || !patient) return void res.status(404).json({ error: "No such symptom report." });
  const [row] = await db
    .update(symptomReports)
    .set({ acknowledgedBy: req.user!.id, acknowledgedAt: s.acknowledgedAt ?? new Date() })
    .where(eq(symptomReports.id, s.id))
    .returning();
  if (!s.acknowledgedAt) {
    await logActivity({ user: req.user!, patientId: patient.id, kind: "symptom.acknowledged", summary: `${req.user!.displayName} read ${patient.displayName}'s symptom report.` });
  }
  res.json(AcknowledgeSymptomResponse.parse(symptomDto(row!, req.user!.displayName)));
});
