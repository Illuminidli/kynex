import { getDemo, type LocalisedText } from "@kynex/motion";
import { useEffect, useRef, useState } from "react";
import type { DemoController } from "./avatar.ts";

type Lang = "en" | "hi";

const VIEWS = [0, 40, -40] as const;
const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

/**
 * Looping 3D demonstration of an exercise, seen from where the phone camera should be.
 * A stand-in until the instructor videos (M7) and the final avatar are ready.
 * three.js and the 3D body (~0.9 MB) load only when a demo is on screen.
 */
export function ExerciseDemo({
  exerciseId,
  lang = "en",
  className,
  dark = false,
}: {
  exerciseId: string;
  lang?: Lang;
  className?: string;
  dark?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const ctl = useRef<DemoController | null>(null);
  const [cue, setCue] = useState<LocalisedText | undefined>();
  const [playing, setPlaying] = useState(true);
  const [slow, setSlow] = useState(false);
  const [viewIdx, setViewIdx] = useState(0);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const clip = getDemo(exerciseId);

  const playingRef = useRef(playing);
  const slowRef = useRef(slow);
  const viewRef = useRef(viewIdx);
  useEffect(() => {
    playingRef.current = playing;
    slowRef.current = slow;
    viewRef.current = viewIdx;
  });

  // Only run while on screen: browsers allow a limited number of 3D canvases at once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const io = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), { rootMargin: "120px" });
    io.observe(host);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !clip || !visible) return;
    let cancelled = false;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    import("./avatar.ts")
      .then(({ createDemo }) => createDemo(host, clip, { onCue: setCue, reducedMotion: reduced }))
      .then((c) => {
        if (cancelled) {
          c.dispose();
          return;
        }
        ctl.current = c;
        setReady(true);
        ctl.current.setPlaying(!reduced && playingRef.current);
        ctl.current.setSpeed(slowRef.current ? 0.5 : 1);
        ctl.current.setOrbit(VIEWS[viewRef.current]!);
        setFailed(false);
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      ctl.current?.dispose();
      ctl.current = null;
      setReady(false);
    };
  }, [clip, visible]);

  useEffect(() => ctl.current?.setPlaying(playing), [playing]);
  useEffect(() => ctl.current?.setSpeed(slow ? 0.5 : 1), [slow]);
  useEffect(() => ctl.current?.setOrbit(VIEWS[viewIdx]!), [viewIdx]);

  if (!clip) return null;
  const tx = (en: string, hi: string) => (lang === "hi" ? hi : en);
  const btn = cx(
    "inline-flex min-h-11 items-center justify-center gap-1 rounded-full px-3 text-sm font-semibold transition",
    dark ? "bg-white/10 text-white hover:bg-white/20" : "bg-brand-100 text-brand-800 hover:bg-brand-200",
  );

  return (
    <section aria-label={tx("How to do it", "कैसे करें")} className={cx("flex flex-col overflow-hidden rounded-3xl", dark ? "bg-brand-800/70" : "bg-white shadow-soft", className)}>
      <div className={cx("relative aspect-[4/3] w-full sm:aspect-video", dark ? "bg-gradient-to-b from-brand-700/60 to-brand-900/80" : "bg-gradient-to-b from-brand-50 via-white to-accent-50")}>
        <div ref={hostRef} className="absolute inset-0" aria-hidden="true" />
        {!ready && !failed && (
          <div className={cx("absolute inset-0 grid place-items-center text-sm", dark ? "text-white/70" : "text-ink-soft")}>{tx("Loading the demo…", "डेमो लोड हो रहा है…")}</div>
        )}
        {failed && (
          <div className={cx("absolute inset-0 grid place-items-center p-6 text-center text-sm", dark ? "text-white/80" : "text-ink-soft")}>
            {tx("The 3D demo could not start on this device. Follow the steps below.", "इस डिवाइस पर 3D डेमो नहीं चल सका। नीचे दिए चरण देखें।")}
          </div>
        )}
        <span className={cx("pointer-events-none absolute left-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold", dark ? "bg-black/40 text-white" : "bg-white/90 text-ink ring-1 ring-line")}>
          {viewIdx === 0
            ? clip.view === "front"
              ? tx("Phone's view · face the camera", "फ़ोन का दृश्य · कैमरे की ओर मुँह")
              : tx("Phone's view · side-on to the camera", "फ़ोन का दृश्य · कैमरे की ओर बगल")
            : tx("Turned view", "घुमाया हुआ दृश्य")}
        </span>
      </div>
      <div className={cx("flex flex-wrap items-center gap-2 border-t px-3 py-2", dark ? "border-white/10" : "border-line")}>
        <p role="status" aria-live="polite" className={cx("min-w-0 flex-1 text-base font-semibold", dark ? "text-white" : "text-brand-800")}>
          {cue?.[lang] ?? " "}
        </p>
        <div className="flex gap-1.5">
          <button type="button" className={btn} onClick={() => setPlaying((p) => !p)} aria-label={playing ? tx("Pause demo", "डेमो रोकें") : tx("Play demo", "डेमो चलाएँ")}>
            {playing ? "❚❚" : "▶"}
          </button>
          <button type="button" className={cx(btn, slow && "!bg-accent-500 !text-white")} onClick={() => setSlow((s) => !s)} aria-pressed={slow}>
            {tx("Slow", "धीमा")}
          </button>
          <button type="button" className={btn} onClick={() => setViewIdx((i) => (i + 1) % VIEWS.length)}>
            {tx("Turn", "घुमाएँ")}
          </button>
        </div>
      </div>
    </section>
  );
}
