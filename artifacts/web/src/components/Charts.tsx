import { useState, type ReactNode } from "react";
import { shortDay } from "../lib/format.ts";

/**
 * Small charts. Colours checked for colour-blind safety and contrast (blue #2a76b8 and orange
 * #d96a1c, in that fixed order); text always uses ink colours; every chart has a table view.
 */
export const SERIES = ["#2a76b8", "#d96a1c"] as const;
const GRID = "#e5eaf0";

export interface LineSeries {
  name: string;
  points: { x: string; y: number | null }[];
}

/** A line chart over days, with a hover read-out, legend (2+ series) and table view. */
export function LineChart({
  title,
  series,
  yMax,
  goal,
  unit = "",
  height = 180,
}: {
  title: string;
  series: LineSeries[];
  yMax?: number;
  goal?: { value: number; label: string };
  unit?: string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))];
  const values = series.flatMap((s) => s.points.map((p) => p.y)).filter((v): v is number => v !== null);
  if (!xs.length || !values.length) return <Empty title={title} text="No data yet." />;
  const top = niceMax(Math.max(yMax ?? 0, ...values, goal?.value ?? 0));
  const W = 600;
  const H = height;
  const pad = { l: 36, r: 16, t: 12, b: 24 };
  const x = (i: number) => pad.l + (xs.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (xs.length - 1));
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  const ticks = [0, top / 2, top];

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <figcaption className="text-sm font-semibold">{title}</figcaption>
        <button type="button" className="text-xs text-brand-700 underline" onClick={() => setTable((v) => !v)}>
          {table ? "Show chart" : "Show as table"}
        </button>
      </div>
      {series.length > 1 && (
        <div className="flex flex-wrap gap-3 text-xs text-ink-soft">
          {series.map((s, i) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: SERIES[i] }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      {table ? (
        <DataTable head={["Day", ...series.map((s) => s.name)]} rows={xs.map((d) => [shortDay(d), ...series.map((s) => fmtV(s.points.find((p) => p.x === d)?.y, unit))])} />
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
            {ticks.map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
                <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="fill-ink-faint text-[11px]">
                  {Math.round(v)}
                </text>
              </g>
            ))}
            {goal && (
              <g>
                <line x1={pad.l} x2={W - pad.r} y1={y(goal.value)} y2={y(goal.value)} stroke="#8a97a8" strokeWidth={1} />
                <text x={W - pad.r} y={y(goal.value) - 4} textAnchor="end" className="fill-ink-soft text-[11px]">
                  {goal.label}
                </text>
              </g>
            )}
            {series.map((s, si) => {
              const pts = xs.map((d, i) => ({ i, v: s.points.find((p) => p.x === d)?.y ?? null })).filter((p): p is { i: number; v: number } => p.v !== null);
              return (
                <g key={s.name}>
                  <path d={pts.map((p, k) => `${k ? "L" : "M"}${x(p.i)},${y(p.v)}`).join("")} fill="none" stroke={SERIES[si]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {pts.map((p) => (
                    <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={hover === p.i ? 5 : 4} fill={SERIES[si]} stroke="#fff" strokeWidth={2} />
                  ))}
                  {/* Value at the end of each line. */}
                  {pts.length > 0 && (
                    <text x={x(pts.at(-1)!.i) + 8} y={y(pts.at(-1)!.v) + 4} className="fill-ink text-[11px] font-semibold">
                      {fmtV(pts.at(-1)!.v, unit)}
                    </text>
                  )}
                </g>
              );
            })}
            {xs.map((d, i) => (
              <g key={d}>
                {(i === 0 || i === xs.length - 1 || xs.length <= 8) && (
                  <text x={x(i)} y={H - 6} textAnchor="middle" className="fill-ink-faint text-[11px]">
                    {shortDay(d)}
                  </text>
                )}
                <rect x={x(i) - 14} y={0} width={28} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
              </g>
            ))}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#8a97a8" strokeWidth={1} />}
          </svg>
          {hover !== null && (
            <div className="pointer-events-none absolute top-0 rounded-lg bg-ink px-2 py-1 text-xs text-white shadow-soft" style={{ left: `${(x(hover) / W) * 100}%`, transform: "translateX(-50%)" }}>
              <p className="font-semibold">{shortDay(xs[hover]!)}</p>
              {series.map((s) => (
                <p key={s.name}>
                  {s.name}: {fmtV(s.points.find((p) => p.x === xs[hover])?.y, unit)}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

/** Angle reached in each rep, against the target, with problem reps flagged. */
export function RepChart({
  reps,
  goal,
  unit,
  lowerIsBetter,
  onPick,
}: {
  reps: { label: string; value: number; tone: "good" | "partial" | "problem"; note: string }[];
  goal: number | null;
  unit: string;
  lowerIsBetter: boolean;
  onPick?: (index: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  if (!reps.length) return null;
  const W = 600;
  const H = 170;
  const pad = { l: 36, r: 10, t: 16, b: 22 };
  const top = niceMax(Math.max(...reps.map((r) => r.value), goal ?? 0));
  const band = (W - pad.l - pad.r) / reps.length;
  const bw = Math.min(24, band - 4);
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  return (
    <figure className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <figcaption className="text-sm font-semibold">
          Range reached in each rep{lowerIsBetter ? " (lower = deeper)" : ""}
        </figcaption>
        <button type="button" className="text-xs text-brand-700 underline" onClick={() => setTable((v) => !v)}>
          {table ? "Show chart" : "Show as table"}
        </button>
      </div>
      {table ? (
        <DataTable head={["Rep", "Range", "Result"]} rows={reps.map((r) => [r.label, fmtV(r.value, unit), r.note])} />
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Range reached in each rep" onMouseLeave={() => setHover(null)}>
            {[0, top / 2, top].map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth={1} />
                <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="fill-ink-faint text-[11px]">
                  {Math.round(v)}
                </text>
              </g>
            ))}
            {reps.map((r, i) => {
              const cx = pad.l + band * i + band / 2;
              const h = Math.max(2, y(0) - y(r.value));
              const fill = r.tone === "problem" ? "#cf4b45" : r.tone === "partial" ? SERIES[1] : SERIES[0];
              return (
                <g key={i} onMouseEnter={() => setHover(i)} onClick={() => onPick?.(i)} className={onPick ? "cursor-pointer" : ""}>
                  <rect x={cx - band / 2} y={0} width={band} height={H} fill="transparent" />
                  <path d={roundTop(cx - bw / 2, y(r.value), bw, h)} fill={fill} opacity={hover === null || hover === i ? 1 : 0.55} />
                  {r.tone === "problem" && (
                    <text x={cx} y={y(r.value) - 4} textAnchor="middle" className="fill-ink text-[11px]">
                      ⚠
                    </text>
                  )}
                  {(reps.length <= 12 || i % 2 === 0) && (
                    <text x={cx} y={H - 6} textAnchor="middle" className="fill-ink-faint text-[11px]">
                      {i + 1}
                    </text>
                  )}
                </g>
              );
            })}
            {goal !== null && (
              <g>
                <line x1={pad.l} x2={W - pad.r} y1={y(goal)} y2={y(goal)} stroke="#16222f" strokeWidth={1} />
                <text x={W - pad.r} y={y(goal) - 4} textAnchor="end" className="fill-ink-soft text-[11px]">
                  Target {fmtV(goal, unit)}
                </text>
              </g>
            )}
          </svg>
          {hover !== null && reps[hover] && (
            <div
              className="pointer-events-none absolute top-0 rounded-lg bg-ink px-2 py-1 text-xs text-white shadow-soft"
              style={{ left: `${((pad.l + band * hover + band / 2) / W) * 100}%`, transform: "translateX(-50%)" }}
            >
              <p className="font-semibold">{reps[hover]!.label}</p>
              <p>{fmtV(reps[hover]!.value, unit)}</p>
              <p>{reps[hover]!.note}</p>
            </div>
          )}
        </div>
      )}
      <p className="flex flex-wrap gap-3 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded" style={{ background: SERIES[0] }} />
          Full rep
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded" style={{ background: SERIES[1] }} />
          Partial
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded bg-bad" />⚠ Form problem
        </span>
      </p>
    </figure>
  );
}

/** Four weeks of planned vs done sessions, one square per day. */
export function AdherenceGrid({ days }: { days: { day: string; planned: number; done: number }[] }) {
  const today = days.at(-1)?.day;
  const state = (d: { day: string; planned: number; done: number }) =>
    d.planned === 0 ? (d.done ? "extra" : "rest") : d.done >= d.planned ? "done" : d.done > 0 ? "part" : d.day === today ? "today" : "missed";
  const STYLE: Record<string, string> = {
    done: "bg-good text-white",
    part: "bg-good-soft text-good",
    missed: "bg-bad-soft text-bad",
    today: "bg-white text-ink-soft ring-1 ring-line",
    rest: "bg-canvas text-ink-faint",
    extra: "bg-good-soft text-good",
  };
  const MARK: Record<string, string> = { done: "✓", part: "½", missed: "✕", today: "·", rest: "", extra: "+" };
  const WORD: Record<string, string> = { done: "done", part: "partly done", missed: "missed", today: "today", rest: "rest day", extra: "extra session" };
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => (
          <div
            key={d.day}
            title={`${shortDay(d.day)}: ${WORD[state(d)]} (${d.done} of ${d.planned})`}
            className={`grid aspect-square place-items-center rounded-lg text-xs font-semibold ${STYLE[state(d)]}`}
          >
            <span aria-hidden>{MARK[state(d)]}</span>
            <span className="sr-only">
              {shortDay(d.day)}: {WORD[state(d)]}
            </span>
          </div>
        ))}
      </div>
      <p className="flex flex-wrap gap-3 text-xs text-ink-soft">
        <span>✓ done</span>
        <span>½ partly</span>
        <span>✕ missed</span>
        <span>blank = rest day</span>
      </p>
    </div>
  );
}

/** A single number with a label. */
export function Stat({ label, value, note, tone }: { label: string; value: ReactNode; note?: string; tone?: "bad" | "good" }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-soft">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "bad" ? "text-bad" : tone === "good" ? "text-good" : ""}`}>{value}</p>
      {note && <p className="mt-0.5 text-xs text-ink-faint">{note}</p>}
    </div>
  );
}

function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-ink-soft">
          <tr>
            {head.map((h) => (
              <th key={h} className="border-b border-line py-1 pr-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className="border-b border-line py-1 pr-3 tabular-nums">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-ink-faint">{text}</p>
    </div>
  );
}

function niceMax(v: number) {
  if (v <= 10) return 10;
  const step = v <= 50 ? 10 : v <= 100 ? 20 : 30;
  return Math.ceil(v / step) * step;
}
const fmtV = (v: number | null | undefined, unit: string) =>
  v === null || v === undefined ? "–" : `${Math.round(v * 10) / 10}${unit === "deg" ? "°" : unit ? ` ${unit}` : ""}`;

/** A bar with a 4 px rounded top and a square base. */
function roundTop(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
