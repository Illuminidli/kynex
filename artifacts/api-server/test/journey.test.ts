import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";

// A throwaway in-memory database with the real tables, library and test accounts.
delete process.env.DATABASE_URL;
process.env.LOCAL_DB_DIR = "memory://";
const PASSWORD = "test-password-123";
process.env.DEMO_PASSWORD = PASSWORD;

const { createApp } = await import("../src/app.ts");
const { prepareDatabase } = await import("../src/setup.ts");
const { clock } = await import("../src/care/time.ts");
const api = await import("@kynex/api-zod");

// Fixed clock: Monday 23 Nov 2026, 08:00 in India.
clock.now = () => new Date("2026-11-23T02:30:00Z");

let base = "";
let close: () => void = () => {};
const cookies: Record<string, string> = {};
const ids: Record<string, string> = {};

before(async () => {
  await prepareDatabase();
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
  for (const who of ["admin", "clinician1", "patient1", "patient2"]) {
    const res = await fetch(`${base}/api/auth/sign-in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `${who}@kynex.test`, password: PASSWORD }),
    });
    cookies[who] = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
    ids[who] = ((await res.json()) as { id: string }).id;
  }
});
after(() => close());

const call = (method: string, path: string, who?: string, body?: unknown) =>
  fetch(`${base}/api${path}`, {
    method,
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(who ? { cookie: cookies[who]! } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const json = async <T>(res: Response, status = 200): Promise<T> => {
  const text = await res.text();
  assert.equal(res.status, status, text);
  return (text ? JSON.parse(text) : null) as T;
};

const MON = [1, 2, 3, 4, 5, 6];
const plan = {
  startDate: "2026-11-20",
  endDate: null,
  note: "Gentle start.",
  items: [
    { exerciseSlug: "glute-bridge", sets: 2, reps: 10, holdSeconds: null, restSeconds: 45, weekdays: MON, timesPerDay: 1, side: "both", note: "" },
    { exerciseSlug: "plank", sets: 2, reps: null, holdSeconds: 20, restSeconds: 30, weekdays: [1, 3, 5], timesPerDay: 1, side: "both", note: "" },
  ],
};

/** A movement track of `frames` frames for 2 joints (all zeros). */
const track = (frames: number) => ({ fps: 10, joints: [11, 12], frames, data: Buffer.alloc(frames * 2 * 6).toString("base64") });
const rep = (set: number, startMs: number, peak: number, faults: string[] = []) => ({
  set,
  side: null,
  startMs,
  endMs: startMs + 2000,
  peak,
  progress: 1,
  full: true,
  heldMs: 1000,
  faults,
  quality: faults.length ? 90 : 100,
});

describe("M3 plans", () => {
  test("the doctor's list has the two demo patients; patients can't open it", async () => {
    const { patients } = api.ListPatientsResponse.parse(await json(await call("GET", "/patients", "clinician1")));
    assert.deepEqual(patients.map((p) => p.email).sort(), ["patient1@kynex.test", "patient2@kynex.test"]);
    assert.ok(patients.every((p) => p.clinicianName === "Doctor One" && !p.hasPlan));
    assert.equal((await call("GET", "/patients", "patient1")).status, 403);
  });

  test("a plan is checked, saved, logged, and shows on the patient's today page", async () => {
    const bad = structuredClone(plan);
    bad.items[0]!.reps = null;
    assert.equal((await call("PUT", `/patients/${ids.patient1}/plan`, "clinician1", bad)).status, 400);

    const saved = api.SavePlanResponse.parse(await json(await call("PUT", `/patients/${ids.patient1}/plan`, "clinician1", plan)));
    assert.equal(saved.plan!.items.length, 2);
    assert.equal(saved.plan!.items[1]!.reps, null);
    assert.equal(saved.plan!.items[1]!.holdSeconds, 20);

    const today = api.GetTodayResponse.parse(await json(await call("GET", "/me/today", "patient1")));
    assert.equal(today.day, "2026-11-23");
    assert.equal(today.timesPerDay, 1);
    assert.deepEqual(
      today.plan!.items.map((i) => i.today),
      [true, true],
    );

    // Hidden exercises can't be added.
    await json(await call("PUT", "/admin/exercises/squat/visibility", "admin", { hidden: true }));
    const withSquat = { ...plan, items: [...plan.items, { ...plan.items[0]!, exerciseSlug: "squat" }] };
    const refused = await call("PUT", `/patients/${ids.patient1}/plan`, "clinician1", withSquat);
    assert.equal(refused.status, 400);
    assert.match(((await refused.json()) as { error: string }).error, /hidden/);
    await json(await call("PUT", "/admin/exercises/squat/visibility", "admin", { hidden: false }));
  });
});

describe("M4 sessions and reports", () => {
  test("a red-flag answer stops the session and alerts the doctor", async () => {
    const started = api.StartSessionResponse.parse(await json(await call("POST", "/sessions", "patient1", { pain: 6, redFlags: ["numbness"] })));
    assert.equal(started.stopped, true);
    const { patients } = api.ListPatientsResponse.parse(await json(await call("GET", "/patients", "clinician1")));
    const p1 = patients.find((p) => p.id === ids.patient1)!;
    assert.equal(p1.attention[0]!.kind, "red-flag");
    assert.equal(patients[0]!.id, ids.patient1, "the patient needing attention comes first");

    const overview = api.GetPatientResponse.parse(await json(await call("GET", `/patients/${ids.patient1}`, "clinician1")));
    const symptom = overview.symptoms[0]!;
    await json(await call("POST", `/symptoms/${symptom.id}/acknowledge`, "clinician1"));
  });

  test("a full session: exercises saved with movement tracks, report with problems and 'better than last time'", async () => {
    const today = api.GetTodayResponse.parse(await json(await call("GET", "/me/today", "patient1")));
    const [bridge, plank] = today.plan!.items;

    for (const [n, best] of [[1, 150], [2, 162]] as const) {
      const s = api.StartSessionResponse.parse(await json(await call("POST", "/sessions", "patient1", { pain: 3, redFlags: [] })));
      assert.equal(s.status, "in-progress");
      const reps = Array.from({ length: 10 }, (_, i) => rep(1 + Math.floor(i / 5), i * 3000, best - (i % 3), i === 4 ? ["heel-lift"] : []));
      const bad = { itemId: bridge!.id, exerciseSlug: "glute-bridge", mode: "camera", status: "done", setsDone: 2, repsFull: 10, repsPartial: 0, holdsDone: 0, best, quality: 95, feeling: "ok", reps, holds: [], faultCounts: { "heel-lift": 1 }, visibleRatio: 0.98, videoOnPhone: true, durationSeconds: 70, track: { ...track(5), frames: 6 } };
      assert.equal((await call("POST", `/sessions/${s.id}/exercises`, "patient1", bad)).status, 400, "a track shorter than it claims is refused");
      await json(await call("POST", `/sessions/${s.id}/exercises`, "patient1", { ...bad, track: track(300) }));
      await json(
        await call("POST", `/sessions/${s.id}/exercises`, "patient1", {
          itemId: plank!.id, exerciseSlug: "plank", mode: "manual", status: "done", setsDone: 2, repsFull: 0, repsPartial: 0, holdsDone: 2, best: null, quality: null,
          feeling: n === 2 ? "painful" : "hard", reps: [], holds: [], faultCounts: {}, visibleRatio: null, videoOnPhone: false, durationSeconds: 60, track: null,
        }),
      );
      const report = api.FinishSessionResponse.parse(await json(await call("POST", `/sessions/${s.id}/finish`, "patient1", { painAfter: n === 2 ? 6 : 3, status: "completed" })));
      assert.equal(report.status, "completed");
      assert.equal(report.totals.repsFull, 10);
      assert.equal(report.totals.problems, 1);
      const b = report.exercises.find((e) => e.exercise.slug === "glute-bridge")!;
      assert.equal(b.target.reps, 10);
      assert.equal(b.faults[0]!.message.en, "Heels are lifting");
      assert.equal(b.hasTrack, true);
      assert.equal(b.previousBest, n === 1 ? null : 150);
      ids[`session${n}`] = s.id;
      ids[`bridge${n}`] = b.id;
    }
    const after = api.GetTodayResponse.parse(await json(await call("GET", "/me/today", "patient1")));
    assert.equal(after.sessionsDoneToday, 2);
  });

  test("the doctor sees pain going up, 'painful', the track, and can review; other patients can't see it", async () => {
    const o = api.GetPatientResponse.parse(await json(await call("GET", `/patients/${ids.patient1}`, "clinician1")));
    const kinds = o.attention.map((a) => a.kind);
    assert.ok(kinds.includes("pain") && kinds.includes("painful") && kinds.includes("review"), kinds.join());
    assert.deepEqual(
      o.rom[0]!.points.map((p) => p.best),
      [150, 162],
    );
    assert.equal(o.adherence.at(-1)!.done, 2);

    const t = api.GetMotionTrackResponse.parse(await json(await call("GET", `/session-exercises/${ids.bridge2}/track`, "clinician1")));
    assert.equal(t.frames, 300);
    assert.equal((await call("GET", `/session-exercises/${ids.bridge2}/track`, "patient2")).status, 404);
    assert.equal((await call("GET", `/sessions/${ids.session2}`, "patient2")).status, 404);

    const reviewed = api.ReviewSessionResponse.parse(await json(await call("POST", `/sessions/${ids.session2}/review`, "clinician1", { note: "Ease off the plank." })));
    assert.equal(reviewed.review!.note, "Ease off the plank.");
    assert.equal(reviewed.review!.byName, "Doctor One");
  });
});

describe("M5b bookings", () => {
  let types: { id: string; code: string }[] = [];
  const vt = (code: string) => types.find((t) => t.code === code)!.id;

  test("free times follow working hours, leave and the gap between visits", async () => {
    types = api.ListVisitTypesResponse.parse(await json(await call("GET", "/visit-types", "patient1"))).visitTypes;
    assert.equal(types.length, 4);
    const tue = api.GetSlotsResponse.parse(await json(await call("GET", `/bookings/slots?visitTypeId=${vt("follow-up")}&date=2026-11-24`, "patient1")));
    assert.equal(tue.slots[0]!.startsAt, "2026-11-24T03:30:00.000Z", "first slot 9:00 India time");
    const sun = api.GetSlotsResponse.parse(await json(await call("GET", `/bookings/slots?visitTypeId=${vt("follow-up")}&date=2026-11-29`, "patient1")));
    assert.match(sun.closed!, /doesn't work/);

    await json(await call("POST", "/time-off", "clinician1", { clinicianId: null, startDate: "2026-11-26", endDate: "2026-11-26", reason: "Conference" }));
    const thu = api.GetSlotsResponse.parse(await json(await call("GET", `/bookings/slots?visitTypeId=${vt("follow-up")}&date=2026-11-26`, "patient1")));
    assert.match(thu.closed!, /on leave/);
  });

  test("a patient books, can't double-book the doctor, and the doctor confirms", async () => {
    const booked = api.BookAppointmentResponse.parse(
      await json(await call("POST", "/appointments", "patient1", { visitTypeId: vt("follow-up"), startsAt: "2026-11-24T03:30:00.000Z" })),
    );
    assert.equal(booked.booked[0]!.status, "booked");
    ids.visit1 = booked.booked[0]!.id;

    // 9:30 is inside the 10-minute gap after the 9:00-9:30 visit.
    const clash = await call("POST", "/appointments", "patient2", { visitTypeId: vt("follow-up"), startsAt: "2026-11-24T04:00:00.000Z" });
    assert.equal(clash.status, 409);
    assert.match(((await clash.json()) as { error: string }).error, /Clashes/);

    const confirmed = api.SetAppointmentStatusResponse.parse(await json(await call("POST", `/appointments/${ids.visit1}/status`, "clinician1", { status: "confirmed" })));
    assert.equal(confirmed.status, "confirmed");
    assert.equal((await call("POST", `/appointments/${ids.visit1}/status`, "clinician1", { status: "completed" })).status, 409, "can't complete a visit before its day");
    assert.equal((await call("POST", `/appointments/${ids.visit1}/status`, "patient1", { status: "confirmed" })).status, 403);
  });

  test("repeating visits: the preview shows clashes; booking skips them", async () => {
    const body = { patientId: ids.patient2, visitTypeId: vt("follow-up"), startsAt: "2026-11-25T05:30:00.000Z", repeat: { weekdays: [3, 5], weeks: 2 } };
    const preview = api.BookAppointmentResponse.parse(await json(await call("POST", "/appointments", "clinician1", { ...body, preview: true })));
    assert.equal(preview.planned.length, 4);
    assert.equal(preview.booked.length, 0);
    const result = api.BookAppointmentResponse.parse(await json(await call("POST", "/appointments", "clinician1", body)));
    assert.equal(result.booked.length, preview.planned.filter((p) => p.ok).length);
    assert.ok(result.seriesId);
    assert.equal((await call("POST", "/appointments", "patient1", { ...body, patientId: undefined })).status, 403, "patients can't book repeating visits");
  });

  test("waiting list: a cancelled visit is offered to the patient waiting, who takes it", async () => {
    await json(await call("POST", "/waitlist", "patient2", { visitTypeId: vt("follow-up"), fromDate: "2026-11-24", toDate: "2026-11-24", timeOfDay: "morning" }));
    // Within 12 hours of the visit the patient can't cancel; the clinic can.
    clock.now = () => new Date("2026-11-23T20:00:00Z");
    assert.equal((await call("POST", `/appointments/${ids.visit1}/status`, "patient1", { status: "cancelled" })).status, 409);
    assert.equal((await call("POST", `/appointments/${ids.visit1}/status`, "clinician1", { status: "cancelled" })).status, 400, "a reason is needed");
    await json(await call("POST", `/appointments/${ids.visit1}/status`, "clinician1", { status: "cancelled", reason: "Patient called in" }));

    const { offers } = api.GetTodayResponse.parse(await json(await call("GET", "/me/today", "patient2")));
    assert.equal(offers.length, 1);
    assert.equal(offers[0]!.offerStartsAt, "2026-11-24T03:30:00.000Z");
    const taken = api.AcceptOfferResponse.parse(await json(await call("POST", `/waitlist/${offers[0]!.id}/accept`, "patient2")));
    assert.equal(taken.patient.id, ids.patient2);
    assert.equal(taken.status, "confirmed");
    clock.now = () => new Date("2026-11-23T02:30:00Z");
  });

  test("the admin sees everything: numbers, patients, today's visits and the activity feed", async () => {
    const o = api.GetOverviewResponse.parse(await json(await call("GET", "/admin/overview", "admin")));
    assert.equal(o.counts.patients, 2);
    assert.equal(o.counts.sessionsToday, 3);
    assert.equal(o.counts.cancellations30, 1);
    const feed = api.ListActivityResponse.parse(await json(await call("GET", "/activity", "admin")));
    const kinds = new Set(feed.items.map((i) => i.kind));
    for (const k of ["plan.changed", "session.red-flag", "session.completed", "review.session", "booking.created", "booking.cancelled", "booking.offered"]) {
      assert.ok(kinds.has(k), `feed has ${k}`);
    }
    const bookingsOnly = api.ListActivityResponse.parse(await json(await call("GET", "/activity?area=booking", "admin")));
    assert.ok(bookingsOnly.items.every((i) => i.area === "booking"));
    assert.equal((await call("GET", "/admin/overview", "clinician1")).status, 403);
  });

  test("admin reset clears a patient's whole journey", async () => {
    await json(await call("POST", `/admin/users/${ids.patient1}/reset`, "admin"));
    const plan = api.GetPlanResponse.parse(await json(await call("GET", `/patients/${ids.patient1}/plan`, "clinician1")));
    assert.equal(plan.plan, null);
    const o = api.GetPatientResponse.parse(await json(await call("GET", `/patients/${ids.patient1}`, "clinician1")));
    assert.equal(o.sessions.length, 0);
    assert.equal(o.activity.length, 0);
  });
});
