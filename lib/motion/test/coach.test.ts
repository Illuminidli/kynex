import assert from "node:assert/strict";
import { test } from "node:test";
import { VoiceCoach } from "../src/coach.ts";
import { PARTIAL_CUE, type RepRecord } from "../src/tracker.ts";

const tip = (en: string) => ({ en, hi: en });

test("never speaks while the previous line is still playing", () => {
  const c = new VoiceCoach();
  c.offer("count", tip("1"), 0);
  assert.equal(c.take(10, true), null);
  assert.equal(c.take(20, false)?.text.en, "1");
  assert.equal(c.take(30, false), null);
});

test("a count replaces a waiting tip, but a tip can't replace a waiting count", () => {
  const c = new VoiceCoach();
  c.offer("tip", tip("Keep your feet flat"), 0);
  c.offer("count", tip("3"), 100);
  assert.equal(c.take(200, false)?.text.en, "3");

  c.offer("count", tip("4"), 5000);
  assert.equal(c.offer("tip", tip("Slow down"), 5100), false);
  assert.equal(c.take(5200, false)?.text.en, "4");
});

test("a newer count replaces an older waiting count", () => {
  const c = new VoiceCoach();
  c.offer("count", tip("5"), 0);
  c.offer("count", tip("6"), 50);
  assert.equal(c.take(100, false)?.text.en, "6");
});

test("tips: at most one every 8 seconds, and the same tip at most every 20 seconds", () => {
  const c = new VoiceCoach();
  c.offer("tip", tip("A"), 0);
  assert.equal(c.take(0, false)?.text.en, "A");
  assert.equal(c.offer("tip", tip("B"), 3000), false); // too soon after A
  assert.equal(c.offer("tip", tip("A"), 9000), false); // same tip again too soon
  assert.equal(c.offer("tip", tip("B"), 9000), true);
  assert.equal(c.take(9000, false)?.text.en, "B");
  assert.equal(c.offer("tip", tip("A"), 21000), true);
});

test("a tip that waited too long is dropped", () => {
  const c = new VoiceCoach();
  c.offer("tip", tip("Keep your back straight"), 0);
  assert.equal(c.take(1000, true), null); // still speaking
  assert.equal(c.take(2000, false), null); // 2 s late: moment has passed
});

test("setup reminders repeat at most every 6 seconds", () => {
  const c = new VoiceCoach();
  c.hear([{ type: "view", ok: false, want: "side" }], 0, () => 0);
  assert.match(c.take(0, false)!.text.en, /side-on/);
  c.hear([{ type: "view", ok: false, want: "side" }], 2000, () => 0);
  assert.equal(c.take(2000, false), null);
  c.hear([{ type: "view", ok: false, want: "side" }], 6500, () => 0);
  assert.match(c.take(6500, false)!.text.en, /side-on/);
});

test("a partial rep is counted with a short nudge; a number is never announced twice", () => {
  const c = new VoiceCoach();
  const rep = {} as RepRecord;
  c.hear([{ type: "partial", rep, cue: PARTIAL_CUE }], 0, () => 1);
  assert.equal(c.take(0, false)?.text.en, "1. A little further.");
  c.hear([{ type: "rep", rep }], 1000, () => 1); // alternating: other side done, pair not complete
  assert.equal(c.take(1000, false), null);
  c.hear([{ type: "rep", rep }], 2000, () => 2);
  assert.equal(c.take(2000, false)?.text.en, "2");
});
