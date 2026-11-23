import { LM } from "@kynex/motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DecodedTrack } from "../lib/track.ts";

/** A stretch of the track to mark on the timeline: a rep or a hold. */
export interface Mark {
  startMs: number;
  endMs: number;
  /** good = full rep, partial = didn't reach the target, problem = a form problem. */
  tone: "good" | "partial" | "problem";
  label: string;
  /** Joints to show in red while this stretch plays (the body part with the problem). */
  joints: number[];
}

type P3 = [number, number, number];

/** Body parts drawn as rounded limbs: [from, to, thickness in metres]. */
const LIMBS: [number, number, number][] = [
  [LM.leftShoulder, LM.leftElbow, 0.085],
  [LM.leftElbow, LM.leftWrist, 0.07],
  [LM.rightShoulder, LM.rightElbow, 0.085],
  [LM.rightElbow, LM.rightWrist, 0.07],
  [LM.leftHip, LM.leftKnee, 0.13],
  [LM.leftKnee, LM.leftAnkle, 0.1],
  [LM.rightHip, LM.rightKnee, 0.13],
  [LM.rightKnee, LM.rightAnkle, 0.1],
  [LM.leftHeel, LM.leftFootIndex, 0.06],
  [LM.rightHeel, LM.rightFootIndex, 0.06],
];

const BODY = "#8ea4ba";
const BODY_NEAR = "#a9bccd";
const EDGE = "#5d7387";
const PROBLEM = "#cf4b45";

const mid = (a: P3, b: P3): P3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];

/**
 * Replays a movement track as a solid human figure. Drag (or use the slider) to turn the
 * figure; tap a rep on the timeline to jump to it. Joints with a form problem turn red.
 */
export function FigurePlayer({
  track,
  marks,
  startMs = 0,
  endMs,
  autoPlay = true,
  compact = false,
  title,
}: {
  track: DecodedTrack;
  marks: Mark[];
  /** Play only this stretch (e.g. one rep), looping. */
  startMs?: number;
  endMs?: number;
  autoPlay?: boolean;
  compact?: boolean;
  title?: string;
}) {
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const total = (track.frames / track.fps) * 1000;
  const from = Math.max(0, startMs);
  const to = Math.min(total, endMs ?? total);
  const [t, setT] = useState(from);
  const [playing, setPlaying] = useState(autoPlay);
  const [speed, setSpeed] = useState(1);
  const [yaw, setYaw] = useState(0);
  const drag = useRef<{ x: number; yaw: number } | null>(null);

  useEffect(() => setT(from), [from, to]);

  // Play: advance time with the screen's refresh, looping over the chosen stretch.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) * speed;
      last = now;
      setT((v) => (v + dt > to ? from : v + dt));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, from, to]);

  // One fixed scale for the whole clip (so the figure doesn't jump in size), from every 5th frame.
  const bounds = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (let f = 0; f < track.frames; f += 5) {
      for (const [x, y, z] of track.at(f).values()) {
        const rx = x * c - z * s;
        minX = Math.min(minX, rx);
        maxX = Math.max(maxX, rx);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    return { minX, maxX, minY: minY - 0.15, maxY: maxY + 0.05 };
  }, [track, yaw]);

  const active = marks.find((m) => t >= m.startMs && t <= m.endMs);
  const red = new Set(active?.tone === "problem" ? active.joints : []);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const w = el.clientWidth;
    const h = el.clientHeight;
    el.width = w * dpr;
    el.height = h * dpr;
    const g = el.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const pts = track.at((t / 1000) * track.fps);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    const scale = Math.min((w * 0.85) / Math.max(spanX, 0.5), (h * 0.85) / Math.max(spanY, 0.5));
    const ox = w / 2 - ((bounds.minX + bounds.maxX) / 2) * scale;
    const oy = h / 2 - ((bounds.minY + bounds.maxY) / 2) * scale;
    const proj = (p: P3) => ({ x: ox + (p[0] * c - p[2] * s) * scale, y: oy + p[1] * scale, z: p[0] * s + p[2] * c });
    const at = (j: number) => pts.get(j);

    // Floor shadow under the lowest point.
    const feet = [...pts.values()].map(proj);
    const floorY = Math.max(...feet.map((p) => p.y));
    const minFx = Math.min(...feet.map((p) => p.x));
    const maxFx = Math.max(...feet.map((p) => p.x));
    g.fillStyle = "rgba(16,34,51,0.08)";
    g.beginPath();
    g.ellipse((minFx + maxFx) / 2, floorY + 6, Math.max(30, (maxFx - minFx) / 2 + 20), 8, 0, 0, Math.PI * 2);
    g.fill();

    // Parts, far ones first.
    type Part = { z: number; draw: () => void };
    const parts: Part[] = [];
    const limb = (a: number, b: number, thick: number) => {
      const pa = at(a);
      const pb = at(b);
      if (!pa || !pb) return;
      const A = proj(pa);
      const B = proj(pb);
      const hot = red.has(a) || red.has(b);
      const near = (A.z + B.z) / 2 < 0;
      parts.push({
        z: (A.z + B.z) / 2,
        draw: () => {
          g.lineCap = "round";
          g.strokeStyle = hot ? "#8f2f2b" : EDGE;
          g.lineWidth = thick * scale + 3;
          g.beginPath();
          g.moveTo(A.x, A.y);
          g.lineTo(B.x, B.y);
          g.stroke();
          g.strokeStyle = hot ? PROBLEM : near ? BODY_NEAR : BODY;
          g.lineWidth = thick * scale;
          g.stroke();
        },
      });
    };
    for (const [a, b, th] of LIMBS) limb(a, b, th);

    const ls = at(LM.leftShoulder);
    const rs = at(LM.rightShoulder);
    const lh = at(LM.leftHip);
    const rh = at(LM.rightHip);
    if (ls && rs && lh && rh) {
      const quad = [ls, rs, rh, lh].map(proj);
      const hot = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip].some((j) => red.has(j));
      parts.push({
        z: quad.reduce((a, p) => a + p.z, 0) / 4,
        draw: () => {
          g.lineJoin = "round";
          g.beginPath();
          quad.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
          g.closePath();
          g.fillStyle = hot ? PROBLEM : BODY_NEAR;
          g.strokeStyle = hot ? "#8f2f2b" : EDGE;
          g.lineWidth = 0.1 * scale;
          g.stroke();
          g.fill();
        },
      });
      // Neck and head.
      const le = at(LM.leftEar);
      const re = at(LM.rightEar);
      const nose = at(LM.nose);
      const head = le && re ? mid(le, re) : nose;
      if (head) {
        const H = proj(head);
        const N = proj(mid(ls, rs));
        const hot2 = [LM.nose, LM.leftEar, LM.rightEar].some((j) => red.has(j));
        parts.push({
          z: H.z - 0.01,
          draw: () => {
            g.lineCap = "round";
            g.strokeStyle = EDGE;
            g.lineWidth = 0.07 * scale + 3;
            g.beginPath();
            g.moveTo(N.x, N.y);
            g.lineTo(H.x, H.y);
            g.stroke();
            g.strokeStyle = BODY;
            g.lineWidth = 0.07 * scale;
            g.stroke();
            g.beginPath();
            g.arc(H.x, H.y, 0.11 * scale, 0, Math.PI * 2);
            g.fillStyle = hot2 ? PROBLEM : BODY_NEAR;
            g.strokeStyle = hot2 ? "#8f2f2b" : EDGE;
            g.lineWidth = 2;
            g.fill();
            g.stroke();
            // Which way the face points.
            if (nose) {
              const F = proj(nose);
              g.beginPath();
              g.arc(F.x, F.y, Math.max(2.5, 0.025 * scale), 0, Math.PI * 2);
              g.fillStyle = EDGE;
              g.fill();
            }
          },
        });
      }
    }
    parts.sort((a, b) => b.z - a.z).forEach((p) => p.draw());

    // Rings around the joints with the problem.
    for (const j of red) {
      const p = at(j);
      if (!p) continue;
      const P = proj(p);
      g.beginPath();
      g.arc(P.x, P.y, 0.09 * scale + 6, 0, Math.PI * 2);
      g.strokeStyle = PROBLEM;
      g.lineWidth = 2.5;
      g.stroke();
    }
  }, [t, yaw, track, bounds, red]);

  const pct = (ms: number) => `${((ms - from) / Math.max(1, to - from)) * 100}%`;
  const shown = marks.filter((m) => m.endMs >= from && m.startMs <= to);

  return (
    <div className="flex flex-col gap-2">
      {title && <p className="text-sm font-semibold">{title}</p>}
      <div className="relative">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`Animated figure replaying the movement${active ? `: ${active.label}` : ""}`}
          className={`w-full touch-none rounded-2xl bg-gradient-to-b from-brand-50 to-white ${compact ? "h-56" : "h-80"} cursor-grab`}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, yaw };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (drag.current) setYaw(drag.current.yaw + (e.clientX - drag.current.x) / 80);
          }}
          onPointerUp={() => (drag.current = null)}
        />
        {active && (
          <p
            className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${active.tone === "problem" ? "bg-bad text-white" : active.tone === "partial" ? "bg-accent-50 text-accent-600" : "bg-good-soft text-good"}`}
          >
            {active.tone === "problem" ? "⚠ " : ""}
            {active.label}
          </p>
        )}
        <p className="absolute right-3 top-3 rounded-full bg-white/80 px-2 py-0.5 text-xs text-ink-soft">Drag to turn</p>
      </div>

      {/* Timeline: each rep or hold as a block; red = form problem. */}
      <div className="relative h-7">
        <div className="absolute inset-x-0 top-3 h-1 rounded-full bg-line" />
        {shown.map((m, i) => (
          <button
            key={i}
            type="button"
            title={m.label}
            aria-label={`Jump to ${m.label}`}
            onClick={() => {
              setT(m.startMs);
              setPlaying(true);
            }}
            style={{ left: pct(Math.max(m.startMs, from)), width: `max(6px, calc(${pct(Math.min(m.endMs, to))} - ${pct(Math.max(m.startMs, from))}))` }}
            className={`absolute top-1 h-5 rounded ${m.tone === "problem" ? "bg-bad" : m.tone === "partial" ? "bg-accent-500" : "bg-good"} ring-2 ring-white`}
          />
        ))}
        <div className="pointer-events-none absolute top-0 h-7 w-0.5 bg-ink" style={{ left: pct(t) }} />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={() => setPlaying((p) => !p)} className="rounded-xl bg-brand-700 px-3 py-1.5 font-medium text-white">
          {playing ? "Pause" : "Play"}
        </button>
        <input
          type="range"
          min={from}
          max={to}
          step={50}
          value={t}
          onChange={(e) => {
            setPlaying(false);
            setT(Number(e.target.value));
          }}
          aria-label="Position in the recording"
          className="min-w-24 flex-1 accent-brand-700"
        />
        <span className="tabular-nums text-ink-soft">{(t / 1000).toFixed(1)} s</span>
        <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Speed" className="rounded-lg border border-line px-2 py-1">
          <option value={0.25}>¼×</option>
          <option value={0.5}>½×</option>
          <option value={1}>1×</option>
        </select>
        <button type="button" onClick={() => setYaw(0)} className="rounded-lg border border-line px-2 py-1">
          Camera view
        </button>
        <button type="button" onClick={() => setYaw(Math.PI / 2)} className="rounded-lg border border-line px-2 py-1">
          Side
        </button>
      </div>
      {!compact && (
        <p className="flex flex-wrap gap-3 text-xs text-ink-soft">
          <Key cls="bg-good" text="Full rep" />
          <Key cls="bg-accent-500" text="Partial (short of target)" />
          <Key cls="bg-bad" text="⚠ Form problem (body part shown in red)" />
        </p>
      )}
    </div>
  );
}

function Key({ cls, text }: { cls: string; text: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block size-3 rounded ${cls}`} />
      {text}
    </span>
  );
}
