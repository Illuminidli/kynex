import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

// Tests use a throwaway in-memory database, never the local or live one.
delete process.env.DATABASE_URL;
process.env.LOCAL_DB_DIR = "memory://";

const { createApp } = await import("../src/app.ts");
const { getHealthResponse } = await import("@kynex/api-zod");

let base = "";
let close: () => void = () => {};

before(async () => {
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
after(() => close());

test("health reports server and database ok", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.status, 200);
  const body = getHealthResponse.parse(await res.json());
  assert.equal(body.status, "ok");
  assert.equal(body.database.ok, true);
  assert.equal(body.database.kind, "local-file");
  assert.match(body.database.version ?? "", /^\d+/);
});

test("security headers are set", async () => {
  const res = await fetch(`${base}/api/health`);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-powered-by"), null);
  assert.match(res.headers.get("permissions-policy") ?? "", /camera=\(self\)/);
  assert.ok(res.headers.get("ratelimit-policy"), "rate limit headers missing");
});

test("unknown API paths return JSON 404 without internals", async () => {
  const res = await fetch(`${base}/api/does-not-exist`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "Not found" });
});
