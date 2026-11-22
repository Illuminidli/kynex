import type { PlanItem, SessionExerciseInput } from "@kynex/api-client-react";
import { ExerciseTracker, VoiceCoach, type ExerciseDefinition, type PoseFrame, type SessionResult, type Side, type TrackerSnapshot } from "@kynex/motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { drawPose, useCamera } from "../lib/pose.ts";
import { TrackRecorder } from "../lib/track.ts";
import { CameraRecorder } from "../lib/videos.ts";
import { isSpeaking, speak, stopSpeaking } from "../lib/voice.ts";

type Lang = "en" | "hi";
const W = (en: string, hi: string) => ({ en, hi });

/** What one exercise produced, ready to save (the patient adds how it felt). */
export interface RunOutput {
  result: Omit<SessionExerciseInput, "itemId" | "exerciseSlug" | "feeling">;
  video: { blob: Blob; outline: number[][]; mirrored: boolean } | null;
}

interface Props {
  def: ExerciseDefinition;
  item: PlanItem;
  mode: "camera" | "manual";
  facing: "user" | "environment";
  lang: Lang;
  voiceOn: boolean;
  setVoiceOn: (v: boolean) => void;
  onFinish: (out: RunOutput) => void;
}

/** One side = a round of all the sets. One-side-at-a-time exercises prescribed "both" do left, then right. */
function roundsOf(def: ExerciseDefinition, item: PlanItem): (Side | undefined)[] {
  if (def.laterality !== "unilateral") return [undefined];
  return item.side === "both" ? ["left", "right"] : [item.side];
}

function countOf(def: ExerciseDefinition, s: TrackerSnapshot): number {
  if (def.kind !== "reps") return s.holdsCompleted;
  return def.laterality === "alternating" ? Math.min(s.reps.left, s.reps.right) : s.reps.total;
}

const SIDE_WORD = { left: W("left side", "बायाँ"), right: W("right side", "दायाँ") };

export function ExerciseRun(props: Props) {
  return props.mode === "camera" ? <CameraRun {...props} /> : <ManualRun {...props} />;
}

/* ================================================================ camera */

function CameraRun({ def, item, facing, lang, voiceOn, setVoiceOn, onFinish }: Props) {
  const rounds = roundsOf(def, item);
  const perSet = def.kind === "reps" ? (item.reps ?? def.dose.reps ?? 10) : 1;
  const holdSeconds = item.holdSeconds ?? def.dose.holdSeconds ?? def.hold?.targetSeconds ?? 20;
  const [phase, setPhase] = useState<"live" | "rest">("live");
  const [round, setRound] = useState(0);
  const [set, setSet] = useState(1);
  const [restLeft, setRestLeft] = useState(0);
  const [snap, setSnap] = useState<TrackerSnapshot | null>(null);
  const [tip, setTip] = useState<{ text: string; at: number } | null>(null);
  const [seen, setSeen] = useState(true);

  const live = useRef({ phase, round, set, lang, voiceOn });
  live.current = { phase, round, set, lang, voiceOn };
  const tracker = useRef<ExerciseTracker | null>(null);
  const coach = useRef(new VoiceCoach());
  const setStart = useRef(0);
  const windows = useRef<{ set: number; side: Side | null; start: number; end: number }[]>([]);
  const results = useRef<{ r: SessionResult; side: Side | null }[]>([]);
  const track = useRef(new TrackRecorder());
  const recorder = useRef(new CameraRecorder());
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const lastUi = useRef(0);
  const lastSeen = useRef(performance.now());
  const startedAt = useRef(Date.now());
  const finished = useRef(false);
  const tipShownAt = useRef(new Map<string, number>());
  const globalSet = (r: number, s: number) => r * item.sets + s;

  const say = useCallback((t: { en: string; hi: string }) => {
    if (live.current.voiceOn) speak(t, live.current.lang);
  }, []);

  const newTracker = useCallback(
    (side: Side | undefined) => {
      tracker.current = new ExerciseTracker(def, {
        ...(side ? { side } : {}),
        ...(def.kind !== "reps" ? { overrides: { hold: { targetSeconds: holdSeconds } } } : {}),
      });
      coach.current = new VoiceCoach();
      setStart.current = 0;
    },
    [def, holdSeconds],
  );

  // Put the finished rounds together into one result.
  const finish = useCallback(
    async (status: "done" | "stopped") => {
      if (finished.current) return;
      finished.current = true;
      if (tracker.current) results.current.push({ r: tracker.current.finish(), side: rounds[live.current.round] ?? null });
      tracker.current = null;
      const setOf = (t: number) => windows.current.find((w) => t >= w.start - 200 && t <= w.end + 200)?.set ?? windows.current.at(-1)?.set ?? 1;
      const reps = results.current.flatMap(({ r }) =>
        r.reps.map((x) => ({
          set: setOf(x.startMs),
          side: x.side,
          startMs: Math.max(0, Math.round(track.current.rel(x.startMs))),
          endMs: Math.max(0, Math.round(track.current.rel(x.endMs))),
          peak: Math.round(x.peak * 10) / 10,
          progress: Math.round(x.progress * 100) / 100,
          full: x.full,
          heldMs: Math.round(x.heldMs),
          faults: x.faults,
          quality: Math.round(x.quality),
        })),
      );
      const holds = results.current.flatMap(({ r }) =>
        r.holds.map((h) => ({
          set: setOf(h.startMs),
          side: h.side,
          startMs: Math.max(0, Math.round(track.current.rel(h.startMs))),
          endMs: Math.max(0, Math.round(track.current.rel(h.endMs))),
          seconds: h.seconds,
          completed: h.completed,
          best: Math.round(h.best * 10) / 10,
          faults: h.faults,
          quality: Math.round(h.quality),
        })),
      );
      const faultCounts: Record<string, number> = {};
      for (const { r } of results.current) for (const [k, n] of Object.entries(r.faultCounts)) faultCounts[k] = (faultCounts[k] ?? 0) + n;
      // Best range across both sides: the one furthest toward the target.
      const goal = def.reps?.target ?? def.hold?.threshold ?? 0;
      const rest = def.reps?.rest ?? 0;
      const bests = results.current.flatMap(({ r }) => Object.values(r.best)).filter((v): v is number => typeof v === "number");
      const best = bests.length ? (goal < rest ? Math.min(...bests) : Math.max(...bests)) : null;
      const qs = [...reps.map((r) => r.quality), ...holds.map((h) => h.quality)];
      const vis = results.current.map(({ r }) => r.visibleRatio);
      const blob = await recorder.current.stop();
      stopSpeaking();
      onFinish({
        result: {
          mode: "camera",
          status,
          setsDone: windows.current.filter((w) => w.end > 0).length,
          repsFull: reps.filter((r) => r.full).length,
          repsPartial: reps.filter((r) => !r.full).length,
          holdsDone: holds.filter((h) => h.completed).length,
          best: best === null ? null : Math.round(best * 10) / 10,
          quality: qs.length ? Math.round(qs.reduce((a, b) => a + b, 0) / qs.length) : null,
          reps,
          holds,
          faultCounts,
          visibleRatio: vis.length ? Math.round((vis.reduce((a, b) => a + b, 0) / vis.length) * 100) / 100 : null,
          videoOnPhone: !!blob,
          durationSeconds: Math.round((Date.now() - startedAt.current) / 1000),
          track: track.current.encode(),
        },
        video: blob ? { blob, outline: recorder.current.outline, mirrored: facing === "user" } : null,
      });
    },
    [def, facing, onFinish, rounds],
  );

  // A set is done: rest, move to the next side, or finish.
  const endSet = useCallback(
    (now: number) => {
      const w = windows.current.at(-1);
      if (w) w.end = now;
      const { round: r, set: s } = live.current;
      const lastSet = s >= item.sets;
      const lastRound = r >= rounds.length - 1;
      if (lastSet && lastRound) {
        say(def.kind === "reps" ? W("Well done. Exercise complete.", "बहुत बढ़िया। व्यायाम पूरा।") : W("Hold complete. Well done.", "होल्ड पूरा। बहुत बढ़िया।"));
        void finish("done");
        return;
      }
      if (lastSet && tracker.current) {
        results.current.push({ r: tracker.current.finish(), side: rounds[r] ?? null });
        tracker.current = null;
      }
      const restS = item.restSeconds;
      setRestLeft(restS);
      setPhase("rest");
      say(
        lastSet
          ? W(`Good. Rest ${restS} seconds, then the ${SIDE_WORD[rounds[r + 1]!].en}.`, `ठीक है। ${restS} सेकंड आराम, फिर ${SIDE_WORD[rounds[r + 1]!].hi}।`)
          : W(`Set ${s} done. Rest ${restS} seconds.`, `सेट ${s} पूरा। ${restS} सेकंड आराम।`),
      );
    },
    [def.kind, finish, item.restSeconds, item.sets, rounds, say],
  );

  const startNextSet = useCallback(() => {
    const { round: r, set: s } = live.current;
    const lastSet = s >= item.sets;
    const nr = lastSet ? r + 1 : r;
    const ns = lastSet ? 1 : s + 1;
    if (lastSet) newTracker(rounds[nr]);
    else if (tracker.current) setStart.current = countOf(def, tracker.current.snapshot());
    windows.current.push({ set: globalSet(nr, ns), side: rounds[nr] ?? null, start: performance.now(), end: 0 });
    setRound(nr);
    setSet(ns);
    setPhase("live");
    say(lastSet ? W(`Now the ${SIDE_WORD[rounds[nr]!].en}. Begin.`, `अब ${SIDE_WORD[rounds[nr]!].hi}। शुरू कीजिए।`) : W(`Set ${ns}. Begin.`, `सेट ${ns}। शुरू कीजिए।`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def, item.sets, newTracker, rounds, say]);

  // Rest countdown.
  useEffect(() => {
    if (phase !== "rest") return;
    if (restLeft <= 0) return startNextSet();
    const id = setTimeout(() => {
      if (restLeft === 4) say(W("Get ready.", "तैयार हो जाइए।"));
      setRestLeft((v) => v - 1);
    }, 1000);
    return () => clearTimeout(id);
  }, [phase, restLeft, say, startNextSet]);

  const onFrame = useCallback(
    (frame: PoseFrame | null) => {
      const video = camera.videoRef.current;
      if (!video || finished.current) return;
      const now = performance.now();
      let state: "good" | "fault" | "idle" = "idle";
      if (frame) {
        lastSeen.current = now;
        track.current.add(frame);
        recorder.current.mark(frame.image);
        const tr = tracker.current;
        if (tr && live.current.phase === "live") {
          const events = tr.update(frame);
          const inSet = () => countOf(def, tr.snapshot()) - setStart.current;
          coach.current.hear(events, now, inSet);
          for (const e of events) {
            const text = e.type === "fault" ? e.fault.message[live.current.lang] : e.type === "partial" ? e.cue[live.current.lang] : null;
            if (text && now - (tipShownAt.current.get(text) ?? -Infinity) >= 10_000) {
              tipShownAt.current.set(text, now);
              setTip({ text, at: now });
            }
          }
          const s = tr.snapshot();
          state = s.activeFaults.length ? "fault" : s.status === "active" || s.status === "holding" ? "good" : "idle";
          if (inSet() >= perSet) {
            setSnap(s);
            endSet(now);
          } else if (now - lastUi.current > 100) {
            lastUi.current = now;
            setSnap(s);
            setSeen(true);
          }
        }
      } else if (now - lastSeen.current > 1500) {
        coach.current.offer("setup", W("I can't see you. Step into the camera view.", "आप नहीं दिख रहे। कैमरे के सामने आइए।"), now);
        setSeen(false);
      }
      const cue = coach.current.take(now, live.current.voiceOn && isSpeaking());
      if (cue && live.current.voiceOn) speak(cue.text, live.current.lang);
      if (canvas.current) drawPose(canvas.current, video, frame, { mirror: facing === "user", focus, state });
    },
    // `camera` is created just below; only its stable video ref is read here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [def, endSet, facing, perSet],
  );
  const camera = useCamera(onFrame);
  const focus = [...new Set(def.required("left").concat(def.required("right")))];

  // Start: camera on, recording, first set.
  useEffect(() => {
    newTracker(rounds[0]);
    windows.current = [{ set: 1, side: rounds[0] ?? null, start: performance.now(), end: 0 }];
    void camera.start(facing).then(() => {
      const stream = camera.videoRef.current?.srcObject;
      recorder.current.start(stream instanceof MediaStream ? stream : null);
    });
    say(rounds[0] ? W(`Start with the ${SIDE_WORD[rounds[0]].en}. Get into position.`, `${SIDE_WORD[rounds[0]].hi} से शुरू कीजिए। स्थिति में आइए।`) : W("Get into position.", "अपनी स्थिति में आइए।"));
    return () => {
      camera.stop();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the screen awake.
  useEffect(() => {
    if (camera.status !== "running" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request("screen").then((l) => (lock = l), () => {});
    return () => void lock?.release();
  }, [camera.status]);

  const s = snap;
  const count = s ? Math.max(0, countOf(def, s) - setStart.current) : 0;
  const showTip = tip && performance.now() - tip.at < 3000 ? tip.text : null;
  const totalSets = item.sets * rounds.length;
  const side = rounds[round];

  return (
    <main className="fixed inset-0 z-20 flex flex-col bg-black text-white">
      <div className="relative flex-1 overflow-hidden">
        <video ref={camera.videoRef} className={`absolute inset-0 size-full object-contain ${facing === "user" ? "-scale-x-100" : ""}`} playsInline muted aria-label="Camera preview" />
        <canvas ref={canvas} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent p-4">
          <div className="min-w-0">
            <p className="truncate text-sm text-white/80">
              {def.name[lang]}
              {side ? ` · ${SIDE_WORD[side][lang]}` : ""}
            </p>
            <p className="mt-1 inline-block rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">
              {lang === "en" ? `Set ${globalSet(round, set)} of ${totalSets}` : `सेट ${globalSet(round, set)} / ${totalSets}`}
            </p>
            {!seen && <p className="mt-1 text-sm text-accent-500">{lang === "en" ? "Step into view" : "कैमरे के सामने आइए"}</p>}
            {s?.status === "calibrating" && <p className="mt-1 text-sm">{lang === "en" ? "Hold still…" : "स्थिर रहिए…"}</p>}
          </div>
          <div className="text-right" aria-live="polite">
            {def.kind === "reps" ? (
              <p className="text-5xl font-bold tabular-nums leading-none">
                {count}
                <span className="text-2xl text-white/60"> / {perSet}</span>
              </p>
            ) : (
              <p className="text-4xl font-bold tabular-nums leading-none">
                {Math.floor(s?.holdSeconds ?? 0)}
                <span className="text-xl text-white/60"> / {holdSeconds} s</span>
              </p>
            )}
          </div>
        </div>
        {showTip && <p role="status" className="absolute inset-x-4 bottom-24 rounded-2xl bg-accent-500/95 px-4 py-3 text-center text-lg font-semibold">{showTip}</p>}
        {camera.status === "loading" && <p className="absolute inset-0 grid place-items-center text-white/80">{lang === "en" ? "Starting camera…" : "कैमरा शुरू हो रहा है…"}</p>}
        {camera.error && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <p className="font-medium">{camera.error}</p>
              <p className="mt-2 text-sm text-white/70">{lang === "en" ? "Stop and choose 'Count by tapping' instead." : "रोकिए और 'टैप करके गिनें' चुनिए।"}</p>
            </div>
          </div>
        )}
        {phase === "rest" && (
          <div className="absolute inset-0 grid place-items-center bg-brand-900/85 text-center">
            <div>
              <p className="text-lg">{lang === "en" ? "Rest" : "आराम"}</p>
              <p className="text-7xl font-bold tabular-nums">{restLeft}</p>
              <button type="button" onClick={() => setRestLeft(0)} className="mt-4 rounded-xl bg-white/15 px-4 py-2 font-medium">
                {lang === "en" ? "Skip rest" : "आराम छोड़ें"}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 bg-brand-900 p-4">
        <button type="button" onClick={() => setVoiceOn(!voiceOn)} className="rounded-xl bg-white/10 px-4 py-3 text-sm font-medium">
          {voiceOn ? (lang === "en" ? "Voice on" : "आवाज़ चालू") : lang === "en" ? "Voice off" : "आवाज़ बंद"}
        </button>
        <button type="button" onClick={() => void finish("stopped")} className="rounded-xl bg-bad px-6 py-3 font-semibold">
          {lang === "en" ? "Stop" : "रोकें"}
        </button>
      </div>
    </main>
  );
}

/* ================================================================ manual */

/** Counting by tapping (or a timer for holds), when the camera isn't used. */
function ManualRun({ def, item, lang, voiceOn, setVoiceOn, onFinish }: Props) {
  const rounds = roundsOf(def, item);
  const perSet = def.kind === "reps" ? (item.reps ?? def.dose.reps ?? 10) : 1;
  const holdSeconds = item.holdSeconds ?? def.dose.holdSeconds ?? 20;
  const totalSets = item.sets * rounds.length;
  const [setNo, setSetNo] = useState(1);
  const [count, setCount] = useState(0);
  const [reps, setReps] = useState(0);
  const [holds, setHolds] = useState(0);
  const [holdLeft, setHoldLeft] = useState<number | null>(null);
  const [restLeft, setRestLeft] = useState<number | null>(null);
  const started = useRef(Date.now());
  const say = (t: { en: string; hi: string } | string) => voiceOn && speak(t, lang);
  const side = rounds[Math.floor((setNo - 1) / item.sets)];

  const done = (status: "done" | "stopped", r = reps, h = holds, sets = setNo - (status === "done" ? 0 : 1)) =>
    onFinish({
      result: {
        mode: "manual",
        status,
        setsDone: Math.max(0, sets),
        repsFull: r,
        repsPartial: 0,
        holdsDone: h,
        best: null,
        quality: null,
        reps: [],
        holds: [],
        faultCounts: {},
        visibleRatio: null,
        videoOnPhone: false,
        durationSeconds: Math.round((Date.now() - started.current) / 1000),
        track: null,
      },
      video: null,
    });

  const setComplete = (r: number, h: number) => {
    if (setNo >= totalSets) {
      say(W("Well done. Exercise complete.", "बहुत बढ़िया। व्यायाम पूरा।"));
      done("done", r, h, totalSets);
      return;
    }
    say(W(`Set ${setNo} done. Rest.`, `सेट ${setNo} पूरा। आराम।`));
    setRestLeft(item.restSeconds);
  };

  useEffect(() => {
    if (restLeft === null) return;
    if (restLeft <= 0) {
      setRestLeft(null);
      setSetNo((n) => n + 1);
      setCount(0);
      say(W("Next set. Begin.", "अगला सेट। शुरू कीजिए।"));
      return;
    }
    const id = setTimeout(() => setRestLeft((v) => (v ?? 1) - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restLeft]);

  useEffect(() => {
    if (holdLeft === null) return;
    if (holdLeft <= 0) {
      setHoldLeft(null);
      setHolds((h) => h + 1);
      setComplete(reps, holds + 1);
      return;
    }
    if (holdLeft <= 3) say(String(holdLeft));
    const id = setTimeout(() => setHoldLeft((v) => (v ?? 1) - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdLeft]);

  return (
    <main className="fixed inset-0 z-20 flex flex-col bg-brand-900 text-white">
      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
        <p className="text-white/80">
          {def.name[lang]}
          {side ? ` · ${SIDE_WORD[side][lang]}` : ""}
        </p>
        <p className="rounded-full bg-white/15 px-3 py-1 text-sm font-semibold">{lang === "en" ? `Set ${setNo} of ${totalSets}` : `सेट ${setNo} / ${totalSets}`}</p>
        {restLeft !== null ? (
          <div>
            <p className="text-lg">{lang === "en" ? "Rest" : "आराम"}</p>
            <p className="text-7xl font-bold tabular-nums">{restLeft}</p>
            <button type="button" onClick={() => setRestLeft(0)} className="mt-4 rounded-xl bg-white/15 px-4 py-2 font-medium">
              {lang === "en" ? "Skip rest" : "आराम छोड़ें"}
            </button>
          </div>
        ) : def.kind === "reps" ? (
          <>
            <p className="text-7xl font-bold tabular-nums">
              {count}
              <span className="text-3xl text-white/60"> / {perSet}</span>
            </p>
            <button
              type="button"
              onClick={() => {
                const c = count + 1;
                setCount(c);
                setReps((r) => r + 1);
                say(String(c));
                if (c >= perSet) setComplete(reps + 1, holds);
              }}
              className="size-44 rounded-full bg-accent-500 text-3xl font-bold shadow-lg active:scale-95"
            >
              +1
            </button>
            <p className="text-sm text-white/70">{lang === "en" ? "Tap once after each rep." : "हर रेप के बाद एक बार टैप कीजिए।"}</p>
          </>
        ) : holdLeft !== null ? (
          <p className="text-8xl font-bold tabular-nums">{holdLeft}</p>
        ) : (
          <button
            type="button"
            onClick={() => {
              setHoldLeft(holdSeconds);
              say(W(`Hold for ${holdSeconds} seconds.`, `${holdSeconds} सेकंड रोकिए।`));
            }}
            className="size-44 rounded-full bg-accent-500 text-2xl font-bold shadow-lg"
          >
            {lang === "en" ? `Start ${holdSeconds} s hold` : `${holdSeconds} सेकंड शुरू`}
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 p-4">
        <button type="button" onClick={() => setVoiceOn(!voiceOn)} className="rounded-xl bg-white/10 px-4 py-3 text-sm font-medium">
          {voiceOn ? (lang === "en" ? "Voice on" : "आवाज़ चालू") : lang === "en" ? "Voice off" : "आवाज़ बंद"}
        </button>
        <button type="button" onClick={() => done("stopped")} className="rounded-xl bg-bad px-6 py-3 font-semibold">
          {lang === "en" ? "Stop" : "रोकें"}
        </button>
      </div>
    </main>
  );
}
