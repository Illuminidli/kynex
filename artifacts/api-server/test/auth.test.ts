import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";

// A throwaway in-memory database with the real tables and test accounts.
delete process.env.DATABASE_URL;
process.env.LOCAL_DB_DIR = "memory://";
const PASSWORD = "test-password-123";
process.env.DEMO_PASSWORD = PASSWORD;

const { createApp } = await import("../src/app.ts");
const { prepareDatabase } = await import("../src/setup.ts");
const { GetMeResponse, ListUsersResponse } = await import("@kynex/api-zod");

let base = "";
let close: () => void = () => {};

before(async () => {
  await prepareDatabase();
  await prepareDatabase(); // running twice (every restart) must be harmless
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
after(() => close());

function post(path: string, body?: unknown, cookie?: string, extra: Record<string, string> = {}) {
  return fetch(`${base}/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const get = (path: string, cookie?: string) => fetch(`${base}/api${path}`, { headers: cookie ? { cookie } : {} });

async function signIn(email: string, password = PASSWORD) {
  const res = await post("/auth/sign-in", { email, password });
  const setCookie = res.headers.get("set-cookie") ?? "";
  return { res, cookie: setCookie.split(";")[0] ?? "", setCookie };
}

describe("sign-in", () => {
  test("right password signs in and sets a protected cookie", async () => {
    const { res, cookie, setCookie } = await signIn("Patient1@Kynex.test "); // case and spaces don't matter
    assert.equal(res.status, 200);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    const me = GetMeResponse.parse(await (await get("/auth/me", cookie)).json());
    assert.equal(me.role, "patient");
    assert.equal(me.displayName, "Patient One");
    assert.equal(me.clinic.name, "QI Spine");
  });

  test("wrong password and unknown email get the same answer", async () => {
    const wrong = await post("/auth/sign-in", { email: "patient1@kynex.test", password: "nope" });
    const unknown = await post("/auth/sign-in", { email: "nobody@kynex.test", password: "nope" });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(await wrong.json(), await unknown.json());
  });

  test("missing fields are rejected", async () => {
    assert.equal((await post("/auth/sign-in", { email: "patient1@kynex.test" })).status, 400);
  });

  test("not signed in: me is 401", async () => {
    assert.equal((await get("/auth/me")).status, 401);
    assert.equal((await get("/auth/me", "kynex_session=made-up")).status, 401);
  });

  test("sign-out ends the session", async () => {
    const { cookie } = await signIn("patient1@kynex.test");
    assert.equal((await post("/auth/sign-out", undefined, cookie)).status, 204);
    assert.equal((await get("/auth/me", cookie)).status, 401);
  });

  test("5 wrong passwords lock the account, even against the right password", async () => {
    for (let i = 1; i <= 4; i++) {
      assert.equal((await post("/auth/sign-in", { email: "patient2@kynex.test", password: "wrong" })).status, 401);
    }
    const fifth = await post("/auth/sign-in", { email: "patient2@kynex.test", password: "wrong" });
    assert.equal(fifth.status, 423);
    const body = (await fifth.json()) as { lockedUntil: string };
    assert.ok(new Date(body.lockedUntil) > new Date());
    assert.equal((await signIn("patient2@kynex.test")).res.status, 423);
  });

  test("a sign-in from another website is blocked", async () => {
    const res = await post("/auth/sign-in", { email: "patient1@kynex.test", password: PASSWORD }, undefined, {
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
    });
    assert.equal(res.status, 403);
  });
});

describe("roles", () => {
  test("patients and clinicians can't open the admin area", async () => {
    for (const email of ["patient1@kynex.test", "clinician1@kynex.test"]) {
      const { cookie } = await signIn(email);
      assert.equal((await get("/admin/users", cookie)).status, 403);
    }
    assert.equal((await get("/admin/users")).status, 401);
  });

  test("admin sees all 4 demo accounts, admin first, without password data", async () => {
    const { cookie } = await signIn("admin@kynex.test");
    const res = await get("/admin/users", cookie);
    assert.equal(res.status, 200);
    const raw = await res.text();
    assert.doesNotMatch(raw, /scrypt|password/i);
    const { users } = ListUsersResponse.parse(JSON.parse(raw));
    assert.equal(users.length, 4);
    assert.deepEqual(
      users.map((u) => u.role),
      ["admin", "clinician", "patient", "patient"],
    );
  });

  test("admin reset unlocks an account, signs it out everywhere and starts it fresh", async () => {
    const { cookie: admin } = await signIn("admin@kynex.test");
    const { cookie: patient } = await signIn("patient1@kynex.test");
    const { users } = ListUsersResponse.parse(await (await get("/admin/users", admin)).json());
    const p4 = users.find((u) => u.email === "patient1@kynex.test")!;
    const p2 = users.find((u) => u.email === "patient2@kynex.test")!;
    assert.ok(p2.lockedUntil, "patient2 should still be locked from the earlier test");

    const reset4 = await post(`/admin/users/${p4.id}/reset`, undefined, admin);
    assert.equal(reset4.status, 200);
    assert.ok(new Date(((await reset4.json()) as { freshSince: string }).freshSince) > new Date(p4.freshSince));
    assert.equal((await get("/auth/me", patient)).status, 401, "reset should sign the patient out");

    assert.equal((await post(`/admin/users/${p2.id}/reset`, undefined, admin)).status, 200);
    assert.equal((await signIn("patient2@kynex.test")).res.status, 200, "reset should unlock");
  });

  test("admin can't reset their own account; bad ids are rejected", async () => {
    const { cookie } = await signIn("admin@kynex.test");
    const me = GetMeResponse.parse(await (await get("/auth/me", cookie)).json());
    assert.equal((await post(`/admin/users/${me.id}/reset`, undefined, cookie)).status, 400);
    assert.equal((await post(`/admin/users/not-a-uuid/reset`, undefined, cookie)).status, 400);
    assert.equal((await post(`/admin/users/00000000-0000-4000-8000-000000000000/reset`, undefined, cookie)).status, 404);
  });

  test("health counts the accounts", async () => {
    const body = (await (await get("/health")).json()) as { testAccounts: number };
    assert.equal(body.testAccounts, 4);
  });
});
