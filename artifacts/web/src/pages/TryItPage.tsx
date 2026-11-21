import {
  bodyPartNames,
  explainExercise,
  ExerciseTracker,
  getExercise,
  VoiceCoach,
  type ExerciseDefinition,
  type PoseFrame,
  type SessionResult,
  type Side,
  type TrackerSnapshot,
} from "@kynex/motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { LangSwitch } from "../components/LangSwitch.tsx";
import { useLang } from "../lib/lang.ts";
import { drawPose, useCamera } from "../lib/pose.ts";
import { canSpeak, isSpeaking, speak, stopSpeaking, type Lang } from "../lib/voice.ts";

type Phase = "setup" | "live" | "done";

/** Reps (or completed holds) so far. Alternating exercises count a rep when both sides have done one. */
function countOf(def: ExerciseDefinition, s: TrackerSnapshot): number {
  if (def.kind !== "reps") return s.holdsCompleted;
  return def.laterality === "alternating" ? Math.min(s.reps.left, s.reps.right) : s.reps.total;
}
const targetOf = (def: ExerciseDefinition) => (def.kind === "reps" ? (def.dose.reps ?? 10) : 1);
const unit = (def: ExerciseDefinition) => (def.metric.unit === "deg" ? "°" : ` ${def.metric.unit}`);
const fmt = (def: ExerciseDefinition, v: number) => `${def.metric.unit === "deg" ? Math.round(v) : Math.round(v * 10) / 10}${unit(def)}`;

const W = (en: string, hi: string) => ({ en, hi });

export function TryItPage({ slug }: { slug: string }) {
  const def = getExercise(slug);
  if (!def) {
    return (
      <main className="grid min-h-dvh place-items-center p-6 text-center">
        <div>
          <p className="font-medium">No exercise with that name.</p>
          <Link href="/library" className="mt-3 inline-block text-brand-700 underline">
            Back to the library
          </Link>
        </div>
      </main>
    );
  }
  return <TryIt def={def} />;
}

function TryIt({ def }: { def: ExerciseDefinition }) {
  const [lang] = useLang();
  const [phase, setPhase] = useState<Phase>("setup");
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [voiceOn, setVoiceOn] = useState(canSpeak());
  const [side, setSide] = useState<Side | "auto">("auto");
  const [snap, setSnap] = useState<TrackerSnapshot | null>(null);
  const [tip, setTip] = useState<{ text: string; at: number } | null>(null);
  const [noPersonSince, setNoPersonSince] = useState<number | null>(null);
  const [result, setResult] = useState<SessionResult | null>(null);

  const tracker = useRef<ExerciseTracker | null>(null);
  const coach = useRef(new VoiceCoach());
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const live = useRef({ lang, voiceOn, facing });
  const lastUi = useRef(0);
  const lastSeen = useRef(0);
  const finished = useRef(false);
  live.current = { lang, voiceOn, facing };

  const target = targetOf(def);
  const focus = [...new Set(def.required("left").concat(def.required("right")))];

  const say = useCallback((text: { en: string; hi: string }) => {
    if (live.current.voiceOn) speak(text, live.current.lang);
  }, []);

  const onFrame = useCallback(
    (frame: PoseFrame | null) => {
      const tr = tracker.current;
      const video = camera.videoRef.current;
      if (!tr || !video || finished.current) return;
      const now = performance.now();
      let state: "good" | "fault" | "idle" = "idle";

      if (frame) {
        lastSeen.current = now;
        const events = tr.update(frame);
        coach.current.hear(events, now, () => countOf(def, tr.snapshot()));
        for (const e of events) {
          if (e.type === "fault") setTip({ text: e.fault.message[live.current.lang], at: now });
          if (e.type === "partial") setTip({ text: e.cue[live.current.lang], at: now });
        }
        const s = tr.snapshot();
        state = s.activeFaults.length ? "fault" : s.status === "active" || s.status === "holding" ? "good" : "idle";
        if (countOf(def, s) >= target) {
          finished.current = true;
          const n = countOf(def, s);
          setResult(tr.finish());
          setSnap(s);
          setPhase("done");
          coach.current.clear();
          say(def.kind === "reps" ? W(`That's ${n}. Well done.`, `${n} हो गए। बहुत बढ़िया।`) : W("Hold complete. Well done.", "होल्ड पूरा। बहुत बढ़िया।"));
          return;
        }
        if (now - lastUi.current > 100) {
          lastUi.current = now;
          setSnap(s);
          setNoPersonSince(null);
        }
      } else if (now - lastSeen.current > 1500) {
        coach.current.offer("setup", W("I can't see you. Step into the camera view.", "आप नहीं दिख रहे। कैमरे के सामने आइए।"), now);
        setNoPersonSince((v) => v ?? now);
      }

      const cue = coach.current.take(now, live.current.voiceOn && isSpeaking());
      if (cue && live.current.voiceOn) speak(cue.text, live.current.lang);
      if (canvas.current) drawPose(canvas.current, video, frame, { mirror: live.current.facing === "user", focus, state });
    },
    // `camera` is created just below; only its stable video ref is read here.
    [def, target, say],
  );

  const camera = useCamera(onFrame);

  // Keep the screen awake while the camera runs.
  useEffect(() => {
    if (camera.status !== "running" || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock.request("screen").then((l) => (lock = l), () => {});
    return () => void lock?.release();
  }, [camera.status]);

  useEffect(() => () => stopSpeaking(), []);
  const stopCamera = camera.stop;
  useEffect(() => {
    if (phase === "done") stopCamera();
  }, [phase, stopCamera]);

  function begin() {
    tracker.current = new ExerciseTracker(def, side === "auto" ? {} : { side });
    coach.current = new VoiceCoach();
    finished.current = false;
    lastSeen.current = performance.now();
    setSnap(null);
    setTip(null);
    setResult(null);
    setNoPersonSince(null);
    setPhase("live");
    // Speaking inside the tap unlocks the voice on iPhones.
    stopSpeaking();
    say(W("Get into position.", "अपनी स्थिति में आइए।"));
    void camera.start(facing);
  }

  function stop() {
    camera.stop();
    stopSpeaking();
    if (tracker.current) setResult(tracker.current.finish());
    finished.current = true;
    setPhase("done");
  }

  const x = explainExercise(def, lang);

  /* ------------------------------- Setup -------------------------------- */
  if (phase === "setup") {
    return (
      <main className="min-h-dvh bg-brand-900 text-white">
        <div className="mx-auto flex max-w-xl flex-col gap-5 px-5 py-6">
          <div className="flex items-center justify-between gap-3">
            <Link href={`/library/${def.id}`} className="text-sm font-medium text-brand-100">
              ← {def.name[lang]}
            </Link>
            <LangSwitch dark />
          </div>
          <h1 className="text-2xl font-semibold">{lang === "en" ? "Try it with camera" : "कैमरे के साथ आज़माइए"}</h1>
          <ol className="list-decimal space-y-2 pl-5 text-brand-50">
            <li>{x.camera}</li>
            <li>{x.inView}</li>
            <li>{def.setup[lang]}</li>
            {x.baseline && <li>{x.baseline}</li>}
            <li>
              {def.kind === "reps"
                ? lang === "en"
                  ? `Do ${target} reps. The phone counts out loud and gives a tip if your form slips.`
                  : `${target} बार कीजिए। फ़ोन गिनती बोलेगा और फ़ॉर्म बिगड़ने पर सुझाव देगा।`
                : lang === "en"
                  ? `Hold the position for ${def.hold?.targetSeconds ?? def.dose.holdSeconds ?? 0} seconds. The timer runs only while you're in position.`
                  : `${def.hold?.targetSeconds ?? def.dose.holdSeconds ?? 0} सेकंड तक स्थिति में रहिए। टाइमर तभी चलता है जब आप सही स्थिति में हों।`}
            </li>
          </ol>

          <div className="grid gap-3 rounded-3xl bg-white/10 p-4">
            <Option label={lang === "en" ? "Camera" : "कैमरा"}>
              <Toggle value={facing} onChange={setFacing} options={[["user", lang === "en" ? "Front (selfie)" : "सामने वाला"], ["environment", lang === "en" ? "Back" : "पीछे वाला"]]} />
            </Option>
            {def.laterality === "unilateral" && (
              <Option label={lang === "en" ? "Side" : "तरफ़"}>
                <Toggle
                  value={side}
                  onChange={setSide}
                  options={[["auto", lang === "en" ? "Nearest" : "पास वाली"], ["left", lang === "en" ? "Left" : "बायाँ"], ["right", lang === "en" ? "Right" : "दायाँ"]]}
                />
              </Option>
            )}
            <Option label={lang === "en" ? "Voice" : "आवाज़"}>
              <Toggle value={voiceOn ? "on" : "off"} onChange={(v) => setVoiceOn(v === "on")} options={[["on", lang === "en" ? "On" : "चालू"], ["off", lang === "en" ? "Off" : "बंद"]]} />
            </Option>
          </div>
          {!canSpeak() && <p className="text-sm text-accent-500">This browser can't speak; counts will show on screen only.</p>}

          <button type="button" onClick={begin} className="rounded-2xl bg-accent-500 px-5 py-4 text-lg font-semibold text-white hover:bg-accent-600">
            {lang === "en" ? "Start camera" : "कैमरा शुरू करें"}
          </button>
          <p className="text-center text-xs text-brand-100">
            {lang === "en"
              ? "Practice only: nothing is saved. Video stays on this device."
              : "सिर्फ़ अभ्यास: कुछ भी सेव नहीं होता। वीडियो इसी डिवाइस पर रहता है।"}
          </p>
        </div>
      </main>
    );
  }

  /* -------------------------------- Done -------------------------------- */
  if (phase === "done") {
    const s = snap;
    const best = result ? Object.values(result.best)[0] : undefined;
    const faults = result ? Object.entries(result.faultCounts).filter(([, n]) => n > 0) : [];
    return (
      <main className="min-h-dvh bg-brand-900 text-white">
        <div className="mx-auto flex max-w-xl flex-col gap-5 px-5 py-6">
          <h1 className="text-2xl font-semibold">{def.name[lang]}</h1>
          <div className="grid grid-cols-2 gap-3">
            {def.kind === "reps" ? (
              <>
                <Stat label={lang === "en" ? "Full reps" : "पूरे रेप"} value={String(result?.reps.filter((r) => r.full).length ?? 0)} />
                <Stat label={lang === "en" ? "Partial reps" : "आधे रेप"} value={String(result?.reps.filter((r) => !r.full).length ?? 0)} />
              </>
            ) : (
              <>
                <Stat label={lang === "en" ? "Holds completed" : "पूरे होल्ड"} value={String(s?.holdsCompleted ?? 0)} />
                <Stat label={lang === "en" ? "Longest hold" : "सबसे लंबा होल्ड"} value={`${Math.max(0, ...(result?.holds.map((h) => h.seconds) ?? [0]))} s`} />
              </>
            )}
            <Stat label={`${lang === "en" ? "Best" : "सबसे अच्छा"}: ${def.metric.label}`} value={best !== undefined ? fmt(def, best) : "–"} />
            <Stat label={lang === "en" ? "Camera could see you" : "कैमरे को दिखे"} value={`${Math.round((result?.visibleRatio ?? 0) * 100)}%`} />
          </div>
          <div className="rounded-3xl bg-white/10 p-4">
            <h2 className="font-semibold">{lang === "en" ? "Form tips during this try" : "इस बार के फ़ॉर्म सुझाव"}</h2>
            {faults.length === 0 ? (
              <p className="mt-1 text-brand-100">{lang === "en" ? "None." : "कोई नहीं।"}</p>
            ) : (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-brand-50">
                {faults.map(([id, n]) => (
                  <li key={id}>
                    {def.faults.find((f) => f.id === id)?.message[lang] ?? id} × {n}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs text-brand-100">
            {lang === "en"
              ? "Practice only: nothing was saved. The camera counts and gives tips; it doesn't confirm technique is correct."
              : "सिर्फ़ अभ्यास: कुछ सेव नहीं हुआ। कैमरा गिनती करता है और सुझाव देता है; यह तकनीक सही होने की पुष्टि नहीं करता।"}
          </p>
          <button type="button" onClick={begin} className="rounded-2xl bg-accent-500 px-5 py-4 text-lg font-semibold hover:bg-accent-600">
            {lang === "en" ? "Try again" : "फिर से कीजिए"}
          </button>
          <Link href={`/library/${def.id}`} className="text-center font-medium text-brand-100 underline">
            {lang === "en" ? "Back to the exercise" : "व्यायाम पर वापस"}
          </Link>
        </div>
      </main>
    );
  }

  /* -------------------------------- Live -------------------------------- */
  const s = snap;
  const count = s ? countOf(def, s) : 0;
  const value = s ? Object.values(s.values).find((v) => v !== null && v !== undefined) : undefined;
  const showTip = tip && performance.now() - tip.at < 3500 ? tip.text : null;
  const status = statusLine(def, s, noPersonSince !== null, camera.status, lang);

  return (
    <main className="fixed inset-0 flex flex-col bg-black text-white">
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={camera.videoRef}
          className={`absolute inset-0 size-full object-contain ${facing === "user" ? "-scale-x-100" : ""}`}
          playsInline
          muted
          aria-label="Camera preview"
        />
        <canvas ref={canvas} className="pointer-events-none absolute inset-0 size-full" aria-hidden />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent p-4">
          <div className="min-w-0">
            <p className="truncate text-sm text-white/80">{def.name[lang]}</p>
            <p aria-live="polite" className={`mt-1 inline-block rounded-full px-3 py-1 text-sm font-semibold ${status.tone}`}>
              {status.text}
            </p>
          </div>
          <div className="text-right" aria-live="polite">
            {def.kind === "reps" ? (
              <p className="text-5xl font-bold tabular-nums leading-none">
                {count}
                <span className="text-2xl text-white/60"> / {target}</span>
              </p>
            ) : (
              <p className="text-4xl font-bold tabular-nums leading-none">
                {Math.floor(s?.holdSeconds ?? 0)}
                <span className="text-xl text-white/60"> / {s?.holdTarget ?? def.hold?.targetSeconds ?? 0} s</span>
              </p>
            )}
            {value !== undefined && value !== null && (
              <p className="mt-1 text-sm text-white/80">
                {def.metric.label}: {fmt(def, value)}
              </p>
            )}
          </div>
        </div>

        {showTip && (
          <p role="status" className="absolute inset-x-4 bottom-24 rounded-2xl bg-accent-500/95 px-4 py-3 text-center text-lg font-semibold">
            {showTip}
          </p>
        )}
        {camera.status === "loading" && <p className="absolute inset-0 grid place-items-center text-white/80">{lang === "en" ? "Starting camera…" : "कैमरा शुरू हो रहा है…"}</p>}
        {camera.error && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <p className="font-medium">{camera.error}</p>
              <button type="button" onClick={() => setPhase("setup")} className="mt-4 rounded-xl bg-white px-4 py-2 font-medium text-brand-900">
                {lang === "en" ? "Back" : "वापस"}
              </button>
            </div>
          </div>
        )}

        <div className="absolute inset-x-4 bottom-6 h-2 overflow-hidden rounded-full bg-white/20" aria-hidden>
          <div className="h-full rounded-full bg-good transition-[width] duration-100" style={{ width: `${Math.round((s?.progress ?? 0) * 100)}%` }} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 bg-brand-900 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          aria-pressed={voiceOn}
          onClick={() => {
            if (voiceOn) stopSpeaking();
            setVoiceOn(!voiceOn);
          }}
          className="rounded-xl border border-white/30 px-4 py-2.5 font-medium"
        >
          {voiceOn ? (lang === "en" ? "Voice on" : "आवाज़ चालू") : lang === "en" ? "Voice off" : "आवाज़ बंद"}
        </button>
        <button type="button" onClick={stop} className="rounded-xl bg-bad px-6 py-2.5 font-semibold">
          {lang === "en" ? "Stop" : "रोकें"}
        </button>
      </div>
    </main>
  );
}

function statusLine(
  def: ExerciseDefinition,
  s: TrackerSnapshot | null,
  noPerson: boolean,
  camera: string,
  lang: Lang,
): { text: string; tone: string } {
  const warn = "bg-accent-500";
  const ok = "bg-good";
  const neutral = "bg-white/20";
  if (camera !== "running") return { text: lang === "en" ? "Getting ready" : "तैयारी", tone: neutral };
  if (noPerson || !s) return { text: lang === "en" ? "Step into view" : "कैमरे के सामने आइए", tone: warn };
  switch (s.status) {
    case "not-visible": {
      const parts = bodyPartNames(s.missing, lang);
      return {
        text: parts ? (lang === "en" ? `Can't see your ${parts}: step back` : `${parts} नहीं दिख रहे: पीछे जाइए`) : lang === "en" ? "Step back a little" : "थोड़ा पीछे जाइए",
        tone: warn,
      };
    }
    case "wrong-view":
      return {
        text: def.view === "side" ? (lang === "en" ? "Turn side-on" : "बगल से होइए") : lang === "en" ? "Face the camera" : "कैमरे की ओर मुँह कीजिए",
        tone: warn,
      };
    case "calibrating":
      return { text: `${lang === "en" ? "Hold still" : "स्थिर रहिए"} ${Math.round(s.calibrationProgress * 100)}%`, tone: neutral };
    case "holding":
      return { text: lang === "en" ? "Holding" : "रोके रखिए", tone: ok };
    case "active":
      return { text: lang === "en" ? "Good" : "अच्छा", tone: ok };
    default:
      return { text: lang === "en" ? "Ready: begin" : "तैयार: शुरू कीजिए", tone: ok };
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/10 p-4">
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-brand-100">{label}</p>
    </div>
  );
}

function Option({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="font-medium">{label}</span>
      {children}
    </div>
  );
}

function Toggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div role="group" className="inline-flex overflow-hidden rounded-xl border border-white/30 text-sm">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={`px-3 py-1.5 font-medium ${value === v ? "bg-white text-brand-900" : "text-white"}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
