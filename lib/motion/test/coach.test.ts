import type { FaultRule } from "../src/types.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { VoiceCoach } from "../src/coach.ts";
import { HOLD_CUE, PARTIAL_CUE, type RepRecord } from "../src/tracker.ts";

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

test("setup reminders repeat at most every 10 seconds", () => {
  const c = new VoiceCoach();
  c.hear([{ type: "view", ok: false, want: "side" }], 0, () => 0);
  assert.match(c.take(0, false)!.text.en, /side-on/);
  c.hear([{ type: "view", ok: false, want: "side" }], 2000, () => 0);
  assert.equal(c.take(2000, false), null);
  c.hear([{ type: "view", ok: false, want: "side" }], 6500, () => 0);
  assert.equal(c.take(6500, false), null);
  c.hear([{ type: "view", ok: false, want: "side" }], 10500, () => 0);
  assert.match(c.take(10500, false)!.text.en, /side-on/);
});

test("a start reading that had to be taken again asks the person to hold still", () => {
  const c = new VoiceCoach();
  c.hear([{ type: "baseline-retry" }], 0, () => 0);
  assert.equal(c.take(0, false)?.text.en, "Hold still in the starting position.");
});

test("a rep that isn't complete doesn't count: the coach says why and asks for it again", () => {
  const c = new VoiceCoach();
  const rep = { faults: [] as string[] } as RepRecord;
  c.hear([{ type: "partial", rep, cue: PARTIAL_CUE }], 0, () => 0);
  assert.equal(c.take(0, false)?.text.en, "Not complete. Go a little further, and do that one again.");
  c.hear([{ type: "partial", rep, cue: HOLD_CUE }], 3000, () => 0);
  assert.equal(c.take(3000, false)?.text.en, "Not complete. Hold the top a little longer, and do that one again.");
});

test("a number is never announced twice (alternating sides)", () => {
  const c = new VoiceCoach();
  const rep = { faults: [] as string[] } as RepRecord;
  c.hear([{ type: "rep", rep }], 0, () => 1);
  assert.equal(c.take(0, false)?.text.en, "1");
  c.hear([{ type: "rep", rep }], 1000, () => 1); // other side done, pair not complete
  assert.equal(c.take(1000, false), null);
  c.hear([{ type: "rep", rep }], 2000, () => 2);
  assert.equal(c.take(2000, false)?.text.en, "2");
});

test("nothing is spoken during a rep; one correction after a rep that had a problem", () => {
  const c = new VoiceCoach();
  const elbow: FaultRule = { id: "elbow-bent", message: { en: "Elbow is bending", hi: "" }, cue: { en: "Keep your elbow straight", hi: "कोहनी सीधी रखिए" }, severity: "minor", phase: "active", test: () => true };
  c.hear([{ type: "fault", side: "left", fault: elbow }], 0, () => 0, [elbow]);
  assert.equal(c.take(0, false), null);
  c.hear([{ type: "rep", rep: { faults: ["elbow-bent"] } as RepRecord }], 1500, () => 3, [elbow]);
  assert.equal(c.take(1500, false)?.text.en, "3. Keep your elbow straight");
  assert.equal(VoiceCoach.soundFor({ type: "fault", side: "left", fault: elbow }), "form");
});
