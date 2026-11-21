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
const { EXERCISES } = await import("@kynex/motion");
const { GetExerciseResponse, GetHealthResponse, ListExercisesResponse } = await import("@kynex/api-zod");
const { getDb } = await import("@kynex/db");
const { sql } = await import("drizzle-orm");

let base = "";
let close: () => void = () => {};
const cookies: Record<string, string> = {};

before(async () => {
  await prepareDatabase();
  await prepareDatabase(); // every restart copies the library again: must not duplicate anything
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
  for (const who of ["admin", "clinician1", "patient1"]) {
    const res = await fetch(`${base}/api/auth/sign-in`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `${who}@kynex.test`, password: PASSWORD }),
    });
    cookies[who] = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  }
});
after(() => close());

const get = (path: string, who?: string) => fetch(`${base}/api${path}`, { headers: who ? { cookie: cookies[who]! } : {} });
const put = (path: string, body: unknown, who: string) =>
  fetch(`${base}/api${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: cookies[who]! },
    body: JSON.stringify(body),
  });

describe("exercise library", () => {
  test("clinicians see every camera-engine exercise exactly once", async () => {
    const res = await get("/exercises", "clinician1");
    assert.equal(res.status, 200);
    const { exercises } = ListExercisesResponse.parse(await res.json());
    assert.equal(exercises.length, EXERCISES.length);
    assert.deepEqual(new Set(exercises.map((e) => e.slug)), new Set(EXERCISES.map((e) => e.id)));
    assert.equal(exercises[0]!.region, "neck"); // head-to-toe order
  });

  test("one exercise comes with steps, precautions, dose and Hindi", async () => {
    const res = await get("/exercises/glute-bridge", "clinician1");
    assert.equal(res.status, 200);
    const e = GetExerciseResponse.parse(await res.json());
    assert.equal(e.name.en, "Glute bridge");
    assert.ok(e.name.hi.length > 0);
    assert.ok(e.steps.length > 0);
    assert.deepEqual(e.dose, { sets: 2, reps: 10, restSeconds: 45 });
    assert.equal(e.videoStatus, "none");
    assert.equal(e.calibration, "draft");
  });

  test("unknown or malformed exercise names are 404", async () => {
    assert.equal((await get("/exercises/no-such-thing", "clinician1")).status, 404);
    assert.equal((await get("/exercises/DROP%20TABLE", "clinician1")).status, 404);
  });

  test("patients and signed-out visitors can't open the library", async () => {
    assert.equal((await get("/exercises", "patient1")).status, 403);
    assert.equal((await get("/exercises/glute-bridge", "patient1")).status, 403);
    assert.equal((await get("/exercises")).status, 401);
  });

  test("admin hides and shows an exercise; clinicians see the change", async () => {
    const hide = await put("/admin/exercises/plank/visibility", { hidden: true }, "admin");
    assert.equal(hide.status, 200);
    assert.equal(((await hide.json()) as { hidden: boolean }).hidden, true);
    const list = ListExercisesResponse.parse(await (await get("/exercises", "clinician1")).json());
    assert.equal(list.exercises.find((e) => e.slug === "plank")!.hidden, true);

    const show = await put("/admin/exercises/plank/visibility", { hidden: false }, "admin");
    assert.equal(((await show.json()) as { hidden: boolean }).hidden, false);
  });

  test("only admins can hide, and the request must be well-formed", async () => {
    assert.equal((await put("/admin/exercises/plank/visibility", { hidden: true }, "clinician1")).status, 403);
    assert.equal((await put("/admin/exercises/plank/visibility", { hidden: "yes" }, "admin")).status, 400);
    assert.equal((await put("/admin/exercises/nope/visibility", { hidden: true }, "admin")).status, 404);
  });
});

describe("start-up on a database the host already changed", () => {
  test("tables copied in without Kynex's migration record: start-up still fills the library", async () => {
    const { db } = await getDb();
    // What a host-side schema copy leaves behind: the M2 tables exist (empty), but the
    // migration log doesn't list them, so the next start re-runs the M2 migration.
    await db.execute(sql`delete from clinic_exercise_settings`);
    await db.execute(sql`delete from exercises`);
    await db.execute(sql`delete from drizzle.__drizzle_migrations where created_at = (select max(created_at) from drizzle.__drizzle_migrations)`);

    await prepareDatabase(); // must not throw

    const health = GetHealthResponse.parse(await (await get("/health")).json());
    assert.equal(health.exercises, EXERCISES.length);
  });
});
