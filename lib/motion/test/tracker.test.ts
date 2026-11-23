import assert from "node:assert/strict";
import { test } from "node:test";
import { EXERCISES, getExercise } from "../src/exercises/index.ts";
import { ExerciseTracker, type TrackerEvent } from "../src/tracker.ts";
import { run, wave } from "./synthetic.ts";

function feed(id: string, frames: ReturnType<typeof run>, opts = {}) {
  const def = getExercise(id);
  assert.ok(def, `exercise ${id} exists`);
  const tr = new ExerciseTracker(def!, opts);
  const events: TrackerEvent[] = [];
  for (const f of frames) events.push(...tr.update(f));
  return { tr, events, result: tr.finish() };
}

test("catalogue has 25 uniquely-identified exercises with complete content", () => {
  assert.equal(EXERCISES.length, 25);
  assert.equal(new Set(EXERCISES.map((e) => e.id)).size, 25);
  for (const e of EXERCISES) {
    assert.ok(e.name.en && e.name.hi, `${e.id} name`);
    assert.ok(e.steps.length > 0, `${e.id} steps`);
    assert.ok(e.reps || e.hold, `${e.id} has a counting rule`);
    assert.ok(e.dose.sets >= 1, `${e.id} dose`);
    assert.ok((e.dose.reps ?? 0) > 0 || (e.dose.holdSeconds ?? 0) > 0, `${e.id} reps or hold`);
  }
});

test("shoulder abduction counts full reps on the moving arm only", () => {
  // Left arm 20 -> 160 degrees, 3 cycles of 2 s.
  const frames = run(6000, (t) => ({ abdL: wave(t, 20, 160, 2000), abdR: 15 }));
  const { result } = feed("shoulder-abduction", frames);
  const left = result.reps.filter((r) => r.side === "left");
  const right = result.reps.filter((r) => r.side === "right");
  assert.equal(left.length, 3);
  assert.ok(left.every((r) => r.full));
  assert.equal(right.length, 0);
  assert.ok(Math.abs((result.best.left ?? 0) - 160) < 3, `best ${result.best.left}`);
});

test("a shallow rep is recorded as partial with a cue", () => {
  const frames = run(4000, (t) => ({ abdL: wave(t, 20, 110, 2000) }));
  const { result, events } = feed("shoulder-abduction", frames);
  const left = result.reps.filter((r) => r.side === "left");
  assert.equal(left.length, 2);
  assert.ok(left.every((r) => !r.full));
  assert.ok(events.some((e) => e.type === "partial"));
});

test("squat depth is measured from both knees and counted bilaterally", () => {
  // Knee flexion 5 -> 85 degrees => knee angle 175 -> 95.
  const frames = run(6000, (t) => ({ kneeFlex: wave(t, 5, 85, 3000) }));
  const { result } = feed("squat", frames);
  assert.equal(result.reps.length, 2);
  assert.ok(result.reps.every((r) => r.full && r.side === null));
  assert.ok(Math.abs(result.reps[0]!.peak - 95) < 4, `peak ${result.reps[0]!.peak}`);
});

test("noise below the start threshold does not count reps", () => {
  const frames = run(5000, (t) => ({ abdL: wave(t, 20, 45, 1000) }));
  const { result } = feed("shoulder-abduction", frames);
  assert.equal(result.reps.length, 0);
});

test("single-leg balance completes a 30 s hold and reports sway", () => {
  const frames = run(32000, (t) => ({ liftR: t > 500 ? 0.1 : 0 }));
  const { result, events } = feed("single-leg-stance", frames, { side: "right" });
  assert.ok(events.some((e) => e.type === "hold-complete"));
  const done = result.holds.find((h) => h.completed);
  assert.ok(done);
  if (!done) return;
  assert.ok(done.seconds >= 30);
  assert.ok(Math.abs(done.best - 10) < 1.5, `foot lift ${done.best} cm`);
  assert.ok((done.secondary.sway ?? 99) < 0.5, "a perfectly still body has ~0 sway");
});

test("neck rotation captures a baseline then counts each side", () => {
  const frames = run(1600 + 8000, (t) => {
    if (t < 1600) return { headYaw: 0 };
    const tt = t - 1600;
    // left turn, right turn, left turn, right turn
    const cycle = Math.floor(tt / 2000);
    const dir = cycle % 2 === 0 ? 1 : -1;
    return { headYaw: dir * wave(tt % 2000, 0, 70, 2000) };
  });
  const { result, events } = feed("neck-rotation", frames);
  assert.ok(events.some((e) => e.type === "baseline-ready"));
  const l = result.reps.filter((r) => r.side === "left").length;
  const r = result.reps.filter((r) => r.side === "right").length;
  assert.equal(l + r, 4);
  assert.equal(l, 2);
  assert.equal(r, 2);
});

test("neck rotation: a start reading taken while the head is turned is thrown away", () => {
  // Phone test 22 Nov 2026: the patient was still looking aside when tracking began, the
  // "straight ahead" reading was taken at ~35 degrees, and one side could never count.
  const frames = run(1600 + 1600 + 8000, (t) => {
    if (t < 1600) return { headYaw: 35 }; // looking aside
    if (t < 3200) return { headYaw: 0 }; // now looking straight at the phone
    const tt = t - 3200;
    const dir = Math.floor(tt / 2000) % 2 === 0 ? 1 : -1;
    return { headYaw: dir * wave(tt % 2000, 0, 55, 2000) };
  });
  const { result, events } = feed("neck-rotation", frames);
  assert.ok(events.some((e) => e.type === "baseline-retry"), "asks the person to hold still facing forward");
  assert.equal(result.reps.filter((r) => r.side === "left" && r.full).length, 2);
  assert.equal(result.reps.filter((r) => r.side === "right" && r.full).length, 2);
});

test("a start reading taken while moving is thrown away", () => {
  const frames = run(1600 + 1600 + 4000, (t) => {
    if (t < 1600) return { headYaw: wave(t, -15, 15, 800) }; // fidgeting
    if (t < 3200) return { headYaw: 0 };
    const tt = t - 3200;
    const dir = Math.floor(tt / 2000) % 2 === 0 ? 1 : -1;
    return { headYaw: dir * wave(tt % 2000, 0, 55, 2000) };
  });
  const { result, events } = feed("neck-rotation", frames);
  assert.ok(events.some((e) => e.type === "baseline-retry"));
  assert.equal(result.reps.filter((r) => r.full).length, 2);
});

test("neck rotation: shoulders that stay still are not flagged", () => {
  const frames = run(1600 + 4000, (t) => ({ headYaw: t < 1600 ? 0 : wave(t - 1600, 0, 55, 2000), turn: 22 }));
  const { result } = feed("neck-rotation", frames);
  assert.ok(result.reps.length > 0);
  assert.ok(result.reps.every((r) => !r.faults.includes("shoulders-turning")), "a slightly angled seat is not a fault");
});

test("tracking pauses when required landmarks are not visible", () => {
  const frames = run(2000, (t) => ({ abdL: wave(t, 20, 160, 2000) })).map((f) => ({
    ...f,
    image: f.image.map((p) => ({ ...p, visibility: 0.1 })),
  }));
  const { result, tr } = feed("shoulder-abduction", frames);
  assert.equal(result.reps.length, 0);
  assert.equal(tr.snapshot().status, "not-visible");
});

test("a side-on exercise done facing the camera pauses with a wrong-view status", () => {
  const frames = run(3000, () => ({ turn: 0 }));
  const { result, tr } = feed("chin-tuck", frames);
  assert.equal(tr.snapshot().status, "wrong-view");
  assert.equal(result.reps.length, 0);
});

test("a facing exercise done side-on pauses, and resumes when the person turns back", () => {
  const side = run(2000, () => ({ turn: 85 }));
  const { tr } = feed("shoulder-abduction", side);
  assert.equal(tr.snapshot().status, "wrong-view");
  const back = run(6000, (t) => ({ abdL: wave(t, 20, 160, 2000) })).map((f) => ({ ...f, t: f.t + 2100 }));
  for (const f of back) tr.update(f);
  assert.notEqual(tr.snapshot().status, "wrong-view");
  assert.ok(tr.finish().reps.length >= 2);
});

test("tracking pauses and names the joints when part of the body is off-screen", () => {
  const frames = run(1500, () => ({})).map((f) => ({
    ...f,
    image: f.image.map((p, i) => (i === 27 || i === 28 ? { ...p, y: 1.2 } : p)),
  }));
  const { tr } = feed("squat", frames);
  const s = tr.snapshot();
  assert.equal(s.status, "not-visible");
  assert.deepEqual([...s.missing].sort(), [27, 28]);
});

/* ---------------- M5c: the box, complete reps, timer reset (23 Nov 2026 phone tests) ---------------- */

/** Moves the person sideways in the picture (e.g. out of the box) for frames where `when` is true. */
function shifted(frames: ReturnType<typeof run>, dx: number, when: (t: number) => boolean) {
  return frames.map((f) => (when(f.t) ? { ...f, image: f.image.map((p) => ({ ...p, x: p.x + dx })) } : f));
}

test("box: reps done before the person is in the box don't count; counting starts once in place", () => {
  // 4 squats outside the box (shifted off to the side), then 4 inside it.
  const frames = shifted(
    run(16000, (t) => ({ kneeFlex: wave(t % 2000, 0, 90, 2000) })),
    0.7,
    (t) => t < 8000,
  );
  const { result, events } = feed("squat", frames, { placement: true });
  assert.ok(events.some((e) => e.type === "placement" && e.ok));
  const full = result.reps.filter((r) => r.full).length;
  assert.ok(full >= 2 && full <= 4, `only reps inside the box count (got ${full})`);
  assert.ok(result.reps.every((r) => r.startMs >= 8000), "nothing counted while outside the box");
});

test("box: stepping out pauses counting and says so; coming back resumes", () => {
  const frames = shifted(
    run(20000, (t) => ({ kneeFlex: wave(t % 2000, 0, 90, 2000) })),
    0.7,
    (t) => t >= 8000 && t < 12000,
  );
  const { result, events } = feed("squat", frames, { placement: true });
  const placements = events.filter((e) => e.type === "placement").map((e) => (e as { ok: boolean }).ok);
  assert.deepEqual(placements, [true, false, true]);
  assert.ok(result.reps.every((r) => r.endMs < 8000 || r.startMs >= 12000), "no rep counted while out of the box");
});

test("without the placement option, behaviour is unchanged (always in place)", () => {
  const frames = run(8000, (t) => ({ kneeFlex: wave(t % 2000, 0, 90, 2000) }));
  const { tr, events } = feed("squat", frames);
  assert.ok(!events.some((e) => e.type === "placement"));
  assert.equal(tr.snapshot().placed, true);
});

test("balance: a foot touching down before the target gives hold-broken (the timer starts again)", () => {
  // Lift for 3 s, put the foot down, lift again for the full 30 s.
  const frames = run(36000, (t) => ({ liftR: (t > 500 && t < 3500) || t > 4500 ? 0.1 : 0 }));
  const { events, result } = feed("single-leg-stance", frames, { side: "right" });
  const broken = events.filter((e) => e.type === "hold-broken");
  assert.equal(broken.length, 1);
  assert.ok(Math.abs((broken[0] as { seconds: number }).seconds - 3) < 0.5);
  assert.ok(result.holds.some((h) => h.completed && h.seconds >= 30));
});

test("only complete reps count toward the snapshot's full totals", () => {
  const frames = run(8000, (t) => ({ kneeFlex: wave(t % 2000, 0, t < 4000 ? 90 : 55, 2000) }));
  const { tr } = feed("squat", frames);
  const s = tr.snapshot();
  assert.ok(s.reps.full >= 1 && s.reps.full < s.reps.total, `full ${s.reps.full} of ${s.reps.total}`);
});
