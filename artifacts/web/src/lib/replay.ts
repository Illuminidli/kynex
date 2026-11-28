import type { PoseFrame } from "@kynex/motion";

/** How long before a mistake the replay starts, in ms. */
export const REPLAY_WINDOW_MS = 2000;
/** A picture of the camera is kept about every this many ms (keeps memory small). */
export const PICTURE_EVERY_MS = 100;
/** Width of a kept picture in pixels. Height follows the camera's aspect ratio. */
export const PICTURE_WIDTH = 320;

/** One moment of the camera: the body points, and (when kept) a small picture of the camera at that moment. */
export interface ReplayFrame {
  pose: PoseFrame;
  /** The picture arrives a moment after the pose; null until then, or between pictures. */
  pic: ImageBitmap | null;
}

/** Keeps the last REPLAY_WINDOW_MS of frames. */
export function pushRecent(buffer: ReplayFrame[], entry: ReplayFrame): void {
  buffer.push(entry);
  const cutoff = entry.pose.t - REPLAY_WINDOW_MS;
  while (buffer.length && buffer[0]!.pose.t < cutoff) buffer.shift();
}

/**
 * Draws one moment of a replay: the camera picture (when kept) and the chain of the joints a rule
 * watches, zoomed so those joints fill the picture. `upTo` is how many frames have been played so far.
 * Positions are in "picture height" units (x scaled by the aspect ratio), so the body is not squashed.
 */
export function drawReplay(canvas: HTMLCanvasElement, frames: ReplayFrame[], joints: number[], upTo: number, mirror: boolean, colour: string) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (!frames.length || !joints.length) return;

  const last = Math.min(upTo, frames.length) - 1;
  const cur = frames[Math.max(0, last)]!.pose;

  // Picture height units: x is multiplied by the frame's aspect ratio (width / height).
  const pt = (f: PoseFrame, j: number) => {
    const p = f.image[j];
    if (!p) return null;
    return { x: (mirror ? 1 - p.x : p.x) * f.aspect, y: p.y };
  };

  // Zoom box: every position of the watched joints across the window, plus padding.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const { pose: f } of frames) {
    for (const j of joints) {
      const p = pt(f, j);
      if (!p) continue;
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  if (!Number.isFinite(x0)) return;
  const pad = 0.12;
  const bw = Math.max(x1 - x0, 0.08) + pad * 2;
  const bh = Math.max(y1 - y0, 0.08) + pad * 2;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const scale = Math.min(w / bw, h / bh);
  const map = (p: { x: number; y: number }) => ({ x: w / 2 + (p.x - cx) * scale, y: h / 2 + (p.y - cy) * scale });

  // The camera picture at this moment (the latest one kept up to here), zoomed the same way.
  let pic: ImageBitmap | null = null;
  let picAspect = cur.aspect || 1;
  for (let i = Math.max(0, last); i >= 0; i--) {
    const f = frames[i]!;
    if (f.pic) {
      pic = f.pic;
      picAspect = f.pose.aspect || picAspect;
      break;
    }
  }
  if (pic) {
    const aw = picAspect;
    // Picture spans x 0..aw and y 0..1 in picture height units; mirror it when the camera faced the patient.
    ctx.setTransform(mirror ? -scale : scale, 0, 0, scale, mirror ? w / 2 + (aw - cx) * scale : w / 2 - cx * scale, h / 2 - cy * scale);
    ctx.globalAlpha = 1;
    ctx.drawImage(pic, 0, 0, aw, 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Earlier positions fade out; the current position is solid.
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i <= last; i++) {
    const a = (i + 1) / (last + 1);
    ctx.strokeStyle = colour;
    ctx.globalAlpha = 0.15 + 0.5 * a;
    ctx.lineWidth = 3;
    ctx.beginPath();
    joints.forEach((j, k) => {
      const p = pt(frames[i]!.pose, j);
      if (!p) return;
      const q = map(p);
      if (k === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Current pose: the chain in white, joints as dots, and the pivot joint (the middle one) ringed.
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 6;
  ctx.beginPath();
  let started = false;
  for (const j of joints) {
    const p = pt(cur, j);
    if (!p) continue;
    const q = map(p);
    if (!started) {
      ctx.moveTo(q.x, q.y);
      started = true;
    } else ctx.lineTo(q.x, q.y);
  }
  ctx.stroke();
  for (const j of joints) {
    const p = pt(cur, j);
    if (!p) continue;
    const q = map(p);
    ctx.fillStyle = "#56c3f0";
    ctx.beginPath();
    ctx.arc(q.x, q.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  const pivot = joints[Math.floor(joints.length / 2)];
  const pp = pivot !== undefined ? pt(cur, pivot) : null;
  if (pp) {
    const q = map(pp);
    ctx.strokeStyle = colour;
    ctx.lineWidth = 4;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.arc(q.x, q.y, 26, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
