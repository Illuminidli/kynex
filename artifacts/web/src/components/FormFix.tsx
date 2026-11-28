import { useEffect, useRef, useState } from "react";
import { drawReplay, type ReplayFrame } from "../lib/replay.ts";
import { ExerciseDemo } from "./demo/ExerciseDemo.tsx";

type Lang = "en" | "hi";

/**
 * Shown when a rep goes wrong. The set is paused: the last two seconds replay on the top half,
 * slowed down and zoomed on the joints the rule watches; the cue sits in the middle; the
 * reference demo runs below. The first time in a set it plays slowly and waits for "carry on";
 * repeats play once at normal speed and carry on by themselves.
 */
export function FormFix({
  frames,
  joints,
  cue,
  repLabel,
  mirror,
  full,
  exerciseId,
  lang,
  onDone,
}: {
  frames: ReplayFrame[];
  joints: number[];
  cue: string;
  repLabel: string;
  mirror: boolean;
  full: boolean;
  exerciseId: string;
  lang: Lang;
  onDone: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [playing, setPlaying] = useState(true);
  const doneRef = useRef(false);
  const span = frames.length ? frames[frames.length - 1]!.pose.t - frames[0]!.pose.t : 0;
  // Slow replay is half speed; a repeat plays at normal speed and is capped at 1.5 s.
  const playMs = full ? span * 2 : Math.min(span, 1500);

  // Play the clip once.
  useEffect(() => {
    const c = canvas.current;
    if (!c || !frames.length) return;
    const start = performance.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - start) / Math.max(1, playMs));
      const upTo = Math.max(1, Math.ceil(k * frames.length));
      drawReplay(c, frames, joints, upTo, mirror, "#ff5a52");
      if (k < 1) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [frames, joints, mirror, playMs]);

  // After a repeat: carry on by itself. After the first one: a 3-second countdown, or "carry on" now.
  useEffect(() => {
    if (playing) return;
    if (!full) {
      const t = window.setTimeout(() => finish(), 400);
      return () => window.clearTimeout(t);
    }
    setCount(3);
  }, [playing, full]);

  useEffect(() => {
    if (count === null) return;
    if (count === 0) {
      finish();
      return;
    }
    const t = window.setTimeout(() => setCount((n) => (n === null ? null : n - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [count]);

  function finish() {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }

  const L = lang;
  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-black text-white" role="alert">
      <div className="relative min-h-0 flex-[1.15] overflow-hidden bg-[#1b2026]">
        <canvas ref={canvas} className="absolute inset-0 size-full" aria-label={L === "en" ? "Replay of your movement" : "आपकी हरकत का रीप्ले"} />
        <div className="absolute left-4 top-4 rounded-full bg-[#cf4b45] px-3 py-1.5 text-sm font-bold">
          {L === "en" ? `${repLabel} · replay` : `${repLabel} · रीप्ले`}
        </div>
        {full && playing && <div className="absolute bottom-3 left-4 rounded-full bg-black/50 px-3 py-1 text-xs font-bold">0.5×</div>}
      </div>
      <div className="flex-none bg-accent-500 px-4 py-3 text-center text-lg font-bold">{cue}</div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#f0f6fa] text-ink">
        <ExerciseDemo exerciseId={exerciseId} lang={lang} />
        {full && !playing && (
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <span className="rounded-xl bg-white px-3 py-2 text-sm font-bold text-brand-900 shadow">
              {L === "en" ? `Carry on in ${count ?? 0}` : `${count ?? 0} में आगे`}
            </span>
            <button type="button" onClick={finish} className="rounded-xl bg-brand-900 px-4 py-2 text-sm font-semibold text-white">
              {L === "en" ? "Carry on" : "आगे चलिए"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
