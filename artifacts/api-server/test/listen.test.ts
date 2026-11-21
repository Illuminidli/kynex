import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { listen } from "../src/listen.ts";

test("a free port starts normally", async () => {
  const server = await listen(express(), 0, "127.0.0.1");
  assert.ok((server.address() as AddressInfo).port > 0);
  server.close();
});

test("a busy port is reported clearly instead of looking like a start", async () => {
  const first = await listen(express(), 0, "127.0.0.1");
  const port = (first.address() as AddressInfo).port;
  await assert.rejects(listen(express(), port, "127.0.0.1"), /already in use: another copy of Kynex/);
  first.close();
});
