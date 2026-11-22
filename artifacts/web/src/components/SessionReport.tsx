import { getGetMotionTrackQueryKey, useGetMotionTrack, type ReportExercise, type SessionReport } from "@kynex/api-client-react";
import { getExercise, SKELETON, type Side } from "@kynex/motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { ok } from "../lib/api.ts";
import { dateText, timeText, valueText } from "../lib/format.ts";
import { decodeTrack } from "../lib/track.ts";
import { getVideo, type StoredVideo } from "../lib/videos.ts";
import { RepChart } from "./Charts.tsx";
import { FigurePlayer, type Mark } from "./Figure.tsx";
import { Badge, Button, feelingWord } from "./ui.tsx";

type Lang = "en" | "hi";
const W = (en: string, hi: string) => ({ en, hi });
const T = {
  full: W("Full reps", "पूरे रेप"),
  partial: W("Partial", "आधे"),
  holds: W("Holds", "होल्ड"),
  score: W("Form score", "फ़ॉर्म स्कोर"),
  problems: W("Form problems", "फ़ॉर्म की गलतियाँ"),
  pain: W("Pain before → after", "दर्द पहले → बाद में"),
  best: W("Best range", "सबसे अच्छी रेंज"),
  last: W("last time", "पिछली बार"),
  feeling: W("How it felt", "कैसा लगा"),
  seen: W("Camera could see you", "कैमरे को दिखे"),
  problemReps: W("Reps with a form problem", "जिन रेप में फ़ॉर्म की गलती थी"),
  see: W("See it", "देखिए"),
  video: W("Watch my video", "मेरा वीडियो देखिए"),
  hide: W("Hide video", "वीडियो छिपाइए"),
  noVideo: W("The video is only on the phone used for this session.", "वीडियो केवल उसी फ़ोन पर है जिससे यह सेशन किया गया।"),
  manual: W("Counted by tapping (no camera)", "टैप करके गिना (कैमरा नहीं)"),
  skipped: W("Skipped", "छोड़ा गया"),
  stopped: W("Stopped part-way", "बीच में रोका"),
};

const SESSION_STATUS: Record<SessionReport["status"], { en: string; hi: string; tone: "good" | "warn" | "bad" | "brand" }> = {
  completed: { en: "Completed", hi: "पूरा हुआ", tone: "good" },
  stopped: { en: "Stopped early", hi: "बीच में रोका", tone: "warn" },
  "red-flag": { en: "Stopped at the check-in", hi: "जाँच पर रोका", tone: "bad" },
  "in-progress": { en: "In progress", hi: "चल रहा है", tone: "brand" },
};

/** The joints to show in red for a form problem. */
function faultJoints(slug: string, faultIds: string[], side: Side | null): number[] {
  const def = getExercise(slug);
  if (!def) return [];
  const s: Side = side ?? "left";
  return [
    ...new Set(
      faultIds.flatMap((id) => {
        const rule = def.faults.find((f) => f.id === id);
        return rule?.uses ? rule.uses(s) : def.required(s);
      }),
    ),
  ];
}

const faultText = (slug: string, ids: string[], lang: Lang) => ids.map((id) => getExercise(slug)?.faults.find((f) => f.id === id)?.message[lang] ?? id).join("; ");

/** Reps and holds as marks on the replay timeline. */
export function marksOf(e: ReportExercise, lang: Lang): Mark[] {
  const slug = e.exercise.slug;
  const reps = e.reps.map((r, i) => ({
    startMs: r.startMs,
    endMs: r.endMs,
    tone: r.faults.length ? ("problem" as const) : r.full ? ("good" as const) : ("partial" as const),
    label: `${lang === "en" ? "Rep" : "रेप"} ${i + 1}${r.side ? ` (${r.side})` : ""}${r.faults.length ? `: ${faultText(slug, r.faults, lang)}` : r.full ? "" : lang === "en" ? ": short of target" : ": लक्ष्य से कम"}`,
    joints: faultJoints(slug, r.faults, r.side),
  }));
  const holds = e.holds.map((h, i) => ({
    startMs: h.startMs,
    endMs: h.endMs,
    tone: h.faults.length ? ("problem" as const) : h.completed ? ("good" as const) : ("partial" as const),
    label: `${lang === "en" ? "Hold" : "होल्ड"} ${i + 1} (${h.seconds} s)${h.faults.length ? `: ${faultText(slug, h.faults, lang)}` : ""}`,
    joints: faultJoints(slug, h.faults, h.side),
  }));
  return [...reps, ...holds];
}

export function SessionReportView({ report, lang, viewer }: { report: SessionReport; lang: Lang; viewer: "patient" | "doctor" }) {
  const st = SESSION_STATUS[report.status];
  const t = report.totals;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-ink-soft">
          {dateText(report.startedAt, lang)}, {timeText(report.startedAt, lang)}
        </p>
        <Badge tone={st.tone}>{st[lang]}</Badge>
        {report.review && <Badge tone="good">{lang === "en" ? `Reviewed by ${report.review.byName ?? "the doctor"}` : "डॉक्टर ने देखा"}</Badge>}
      </div>
      {report.checkIn?.redFlags.length ? (
        <p className="rounded-xl bg-bad-soft p-3 text-sm text-bad">
          {lang === "en"
            ? "The session was stopped at the check-in because of a warning sign. The clinic has been told."
            : "चेतावनी के संकेत के कारण सेशन जाँच पर ही रोक दिया गया। क्लिनिक को बता दिया गया है।"}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Tile label={T.full[lang]} value={t.repsFull} />
        <Tile label={T.partial[lang]} value={t.repsPartial} />
        <Tile label={T.holds[lang]} value={t.holds} />
        <Tile label={T.score[lang]} value={t.quality ?? "–"} />
        <Tile label={T.pain[lang]} value={`${report.checkIn?.pain ?? "–"} → ${report.painAfter ?? "–"}`} />
      </div>
      {report.review?.note && (
        <p className="rounded-xl bg-good-soft p-3 text-sm">
          <b>{lang === "en" ? "Doctor's note:" : "डॉक्टर का नोट:"}</b> {report.review.note}
        </p>
      )}
      {report.exercises.map((e) => (
        <ExerciseResult key={e.id} e={e} lang={lang} viewer={viewer} />
      ))}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-soft">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ExerciseResult({ e, lang, viewer }: { e: ReportExercise; lang: Lang; viewer: "patient" | "doctor" }) {
  const [open, setOpen] = useState<number | null>(null);
  const [showVideo, setShowVideo] = useState(false);
  const trackQ = useGetMotionTrack(e.id, { query: { queryKey: getGetMotionTrackQueryKey(e.id), enabled: e.hasTrack, staleTime: Infinity } });
  const raw = ok(trackQ);
  const track = useMemo(() => (raw ? decodeTrack(raw) : null), [raw]);
  const marks = useMemo(() => marksOf(e, lang), [e, lang]);
  const problems = marks.map((m, i) => ({ m, i })).filter(({ m }) => m.tone === "problem");
  const def = getExercise(e.exercise.slug);
  const lowerIsBetter = e.target.goal !== null && e.target.rest !== null && e.target.goal < e.target.rest;
  const improved = e.best !== null && e.previousBest !== null ? (lowerIsBetter ? e.best < e.previousBest : e.best > e.previousBest) : null;
  const doseDone =
    e.target.reps !== null
      ? `${e.repsFull + e.repsPartial} / ${e.target.sets * e.target.reps} ${lang === "en" ? "reps" : "रेप"}`
      : `${e.holdsDone} / ${e.target.sets} ${lang === "en" ? "holds" : "होल्ड"}`;

  return (
    <section className="flex flex-col gap-3 rounded-3xl bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{e.exercise.name[lang]}</h3>
          <p className="text-sm text-ink-soft">
            {doseDone} · {e.setsDone}/{e.target.sets} {lang === "en" ? "sets" : "सेट"}
            {e.mode === "manual" ? ` · ${T.manual[lang]}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {e.status !== "done" && <Badge tone="warn">{e.status === "skipped" ? T.skipped[lang] : T.stopped[lang]}</Badge>}
          {e.feeling && (
            <Badge tone={e.feeling === "painful" ? "bad" : e.feeling === "hard" ? "warn" : "good"}>
              {T.feeling[lang]}: {feelingWord(e.feeling, lang)}
            </Badge>
          )}
        </div>
      </div>

      {e.mode === "camera" && (
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Def label={T.best[lang]}>
            {valueText(e.best, e.target.unit)}
            {e.previousBest !== null && (
              <span className={`ml-1 text-xs ${improved ? "text-good" : "text-ink-faint"}`}>
                ({improved ? "▲" : "▼"} {T.last[lang]} {valueText(e.previousBest, e.target.unit)})
              </span>
            )}
          </Def>
          <Def label={T.score[lang]}>{e.quality ?? "–"}/100</Def>
          <Def label={T.problems[lang]}>{problems.length}</Def>
          <Def label={T.seen[lang]}>{e.visibleRatio !== null ? `${Math.round(e.visibleRatio * 100)}%` : "–"}</Def>
        </dl>
      )}
      {e.faults.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {e.faults.map((f) => (
            <li key={f.id}>
              <Badge tone={f.severity === "major" ? "bad" : "warn"}>
                ⚠ {f.message[lang]} ×{f.count}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {viewer === "doctor" && track && (
        <>
          <FigurePlayer track={track} marks={marks} autoPlay={false} title={lang === "en" ? "Movement replay (joint positions only, no video)" : "गति का रीप्ले"} />
          {e.reps.length > 0 && (
            <RepChart
              reps={e.reps.map((r, i) => ({
                label: `Rep ${i + 1}${r.side ? ` (${r.side})` : ""}, set ${r.set}`,
                value: r.peak,
                tone: r.faults.length ? "problem" : r.full ? "good" : "partial",
                note: r.faults.length ? faultText(e.exercise.slug, r.faults, "en") : r.full ? "Full rep" : "Short of target",
              }))}
              goal={e.target.goal}
              unit={e.target.unit}
              lowerIsBetter={lowerIsBetter}
              onPick={(i) => setOpen(i)}
            />
          )}
          {open !== null && marks[open] && (
            <div className="rounded-2xl border border-line p-3">
              <FigurePlayer track={track} marks={marks} startMs={Math.max(0, marks[open].startMs - 500)} endMs={marks[open].endMs + 500} compact title={marks[open].label} />
            </div>
          )}
        </>
      )}
      {viewer === "doctor" && e.mode === "camera" && !e.hasTrack && <p className="text-sm text-ink-faint">No movement track was saved for this exercise.</p>}

      {viewer === "patient" && problems.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold">{T.problemReps[lang]}</p>
          <ul className="flex flex-col gap-2">
            {problems.map(({ m, i }) => (
              <li key={i} className="rounded-2xl border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">⚠ {m.label}</span>
                  {track && (
                    <Button tone="plain" className="px-3 py-1.5" onClick={() => setOpen(open === i ? null : i)}>
                      {T.see[lang]}
                    </Button>
                  )}
                </div>
                {open === i && track && (
                  <div className="mt-2">
                    <FigurePlayer track={track} marks={marks} startMs={Math.max(0, m.startMs - 500)} endMs={m.endMs + 500} compact />
                  </div>
                )}
              </li>
            ))}
          </ul>
          {def && (
            <p className="text-sm text-ink-soft">
              {lang === "en" ? "Tip: " : "सुझाव: "}
              {def.faults.find((f) => e.faults.some((x) => x.id === f.id))?.cue[lang]}
            </p>
          )}
        </div>
      )}

      {viewer === "patient" && e.videoOnPhone && (
        <div className="flex flex-col gap-2">
          <Button tone="plain" onClick={() => setShowVideo((v) => !v)}>
            {showVideo ? T.hide[lang] : T.video[lang]}
          </Button>
          {showVideo && <PhoneVideo id={e.id} lang={lang} />}
        </div>
      )}
    </section>
  );
}

function Def({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-canvas p-2">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

/** Plays the exercise video kept on this phone, with the body outline drawn on top. */
function PhoneVideo({ id, lang }: { id: string; lang: Lang }) {
  const [v, setV] = useState<StoredVideo | null | undefined>(undefined);
  const [url, setUrl] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let u: string | null = null;
    void getVideo(id).then((found) => {
      setV(found);
      if (found) {
        u = URL.createObjectURL(found.blob);
        setUrl(u);
      }
    });
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [id]);

  // Draw the outline for the current playback time.
  useEffect(() => {
    if (!v || !url) return;
    let raf = 0;
    const draw = () => {
      const el = video.current;
      const c = canvas.current;
      if (el && c) {
        const w = c.clientWidth;
        const h = c.clientHeight;
        c.width = w;
        c.height = h;
        const g = c.getContext("2d")!;
        g.clearRect(0, 0, w, h);
        const ms = el.currentTime * 1000;
        let sample = v.outline[0];
        for (const s of v.outline) {
          if (s[0]! > ms) break;
          sample = s;
        }
        if (sample && el.videoWidth) {
          // Fit like object-contain.
          const k = Math.min(w / el.videoWidth, h / el.videoHeight);
          const vw = el.videoWidth * k;
          const vh = el.videoHeight * k;
          const ox = (w - vw) / 2;
          const oy = (h - vh) / 2;
          const pt = (j: number) => ({ x: ox + sample![1 + j * 2]! * vw, y: oy + sample![2 + j * 2]! * vh });
          g.strokeStyle = "rgba(255,255,255,0.9)";
          g.lineWidth = 3;
          g.lineCap = "round";
          for (const [a, b] of SKELETON) {
            if (sample.length <= 2 + Math.max(a, b) * 2) continue;
            const A = pt(a);
            const B = pt(b);
            g.beginPath();
            g.moveTo(A.x, A.y);
            g.lineTo(B.x, B.y);
            g.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [v, url]);

  if (v === undefined) return <p className="text-sm text-ink-faint">…</p>;
  if (!v || !url) return <p className="text-sm text-ink-soft">{T.noVideo[lang]}</p>;
  return (
    <div className="flex flex-col gap-1">
      <div className="relative overflow-hidden rounded-2xl bg-black">
        <video ref={video} src={url} playsInline className={`aspect-[3/4] w-full object-contain sm:aspect-video ${v.mirrored ? "-scale-x-100" : ""}`} />
        <canvas ref={canvas} className={`pointer-events-none absolute inset-0 size-full ${v.mirrored ? "-scale-x-100" : ""}`} aria-hidden />
      </div>
      <div className="flex gap-2">
        <Button tone="plain" onClick={() => void video.current?.play()}>
          ▶
        </Button>
        <Button tone="plain" onClick={() => video.current?.pause()}>
          ❚❚
        </Button>
        <Button tone="plain" onClick={() => video.current && (video.current.currentTime = 0)}>
          ⟲
        </Button>
      </div>
    </div>
  );
}
