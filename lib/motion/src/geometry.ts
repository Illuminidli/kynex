import { idx, LM, type Side, type SidedJoint } from "./landmarks.ts";
import type { Point3, PoseFrame } from "./types.ts";

export const RAD = 180 / Math.PI;

export interface V2 {
  x: number;
  y: number;
}

/** Image landmark, with x scaled by aspect ratio so 2D angles and distances are isotropic. */
export function img(f: PoseFrame, i: number): V2 {
  const p = f.image[i];
  if (!p) return { x: NaN, y: NaN };
  return { x: p.x * f.aspect, y: p.y };
}

export function wld(f: PoseFrame, i: number): Point3 {
  return f.world[i] ?? { x: NaN, y: NaN, z: NaN };
}

export const imgS = (f: PoseFrame, side: Side, j: SidedJoint) => img(f, idx(side, j));
export const wldS = (f: PoseFrame, side: Side, j: SidedJoint) => wld(f, idx(side, j));

export function mid2(a: V2, b: V2): V2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function mid3(a: Point3, b: Point3): Point3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

export function dist2(a: V2, b: V2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function dist3(a: Point3, b: Point3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Angle ABC at vertex B in 3D, degrees 0..180. */
export function angle3(a: Point3, b: Point3, c: Point3): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const v2 = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
  const n = Math.hypot(v1.x, v1.y, v1.z) * Math.hypot(v2.x, v2.y, v2.z);
  if (n === 0) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, dot / n))) * RAD;
}

/** Angle ABC at vertex B in the image plane, degrees 0..180. */
export function angle2(a: V2, b: V2, c: V2): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const n = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (n === 0) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / n))) * RAD;
}

/**
 * Unsigned angle between segment (from -> to) and straight up in the image, degrees 0..180.
 * Assumes the camera is upright (gravity points down the image).
 */
export function fromVertical(from: V2, to: V2): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const n = Math.hypot(dx, dy);
  if (n === 0) return NaN;
  return Math.acos(Math.max(-1, Math.min(1, -dy / n))) * RAD;
}

/**
 * Signed lean of segment (from -> to) away from vertical in the image, degrees.
 * Positive = top of the segment is to the image right.
 */
export function signedLean(from: V2, to: V2): number {
  return Math.atan2(to.x - from.x, -(to.y - from.y)) * RAD;
}

/** Tilt of the line a->b relative to horizontal, degrees (-90..90). Positive = b is higher than a. */
export function tilt(a: V2, b: V2): number {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (dx < 0) {
    dx = -dx;
    dy = -dy;
  }
  return Math.atan2(-dy, dx) * RAD;
}

/** Yaw of a left->right body segment in the world x-z plane, degrees. 0 = parallel to camera. */
export function yaw(left: Point3, right: Point3): number {
  return Math.atan2(left.z - right.z, left.x - right.x) * RAD;
}

/** Wrap an angle difference into -180..180. */
export function wrap(deg: number): number {
  let d = deg;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/** Torso length in the image (shoulder-mid to hip-mid). Used to normalise 2D distances. */
export function torso2(f: PoseFrame): number {
  const s = mid2(img(f, LM.leftShoulder), img(f, LM.rightShoulder));
  const h = mid2(img(f, LM.leftHip), img(f, LM.rightHip));
  return dist2(s, h);
}

/** Torso length in metres from world landmarks (falls back to an adult average). */
export function torso3(f: PoseFrame): number {
  const s = mid3(wld(f, LM.leftShoulder), wld(f, LM.rightShoulder));
  const h = mid3(wld(f, LM.leftHip), wld(f, LM.rightHip));
  const d = dist3(s, h);
  return Number.isFinite(d) && d > 0.2 && d < 0.9 ? d : 0.5;
}

/** Convert an image-space distance to centimetres using the torso as a ruler. */
export function imgToCm(f: PoseFrame, d: number): number {
  const t = torso2(f);
  if (!(t > 0)) return NaN;
  return (d / t) * torso3(f) * 100;
}

/**
 * Which way the person faces in a side view: +1 = facing image right, -1 = facing image left.
 * Uses nose position relative to the ear midpoint.
 */
export function facing(f: PoseFrame): 1 | -1 {
  const nose = img(f, LM.nose);
  const ears = mid2(img(f, LM.leftEar), img(f, LM.rightEar));
  return nose.x >= ears.x ? 1 : -1;
}

/** Mean visibility of a set of landmarks (0..1). */
export function visibility(f: PoseFrame, ids: number[]): number {
  if (ids.length === 0) return 1;
  let sum = 0;
  for (const i of ids) {
    const p = f.image[i];
    const inFrame = p && p.x > -0.02 && p.x < 1.02 && p.y > -0.02 && p.y < 1.02;
    sum += inFrame ? (p.visibility ?? 1) : 0;
  }
  return sum / ids.length;
}

/**
 * How far the body is turned away from facing the camera, 0..90 degrees
 * (0 = facing or back to the camera, 90 = side-on). Uses the hips when visible
 * (they stay put during trunk and neck movements), otherwise the shoulders.
 * Returns null when neither pair is visible enough.
 */
export function bodyTurn(f: PoseFrame): number | null {
  const pair = (a: number, b: number) => {
    const pa = f.world[a];
    const pb = f.world[b];
    if (!pa || !pb || visibility(f, [a, b]) < 0.5) return null;
    return Math.atan2(Math.abs(pa.z - pb.z), Math.abs(pa.x - pb.x)) * RAD;
  };
  return pair(LM.leftHip, LM.rightHip) ?? pair(LM.leftShoulder, LM.rightShoulder);
}

/** Landmarks that are off-screen or barely detected. */
export function hiddenLandmarks(f: PoseFrame, ids: number[], min = 0.2): number[] {
  return ids.filter((i) => {
    const p = f.image[i];
    const inFrame = p && p.x > -0.02 && p.x < 1.02 && p.y > -0.02 && p.y < 1.02;
    return !inFrame || (p.visibility ?? 1) < min;
  });
}

/** Side whose landmarks are more visible (closest to camera in a side view). */
export function nearSide(f: PoseFrame): Side {
  const l = visibility(f, [LM.leftShoulder, LM.leftHip, LM.leftKnee, LM.leftAnkle, LM.leftElbow]);
  const r = visibility(f, [LM.rightShoulder, LM.rightHip, LM.rightKnee, LM.rightAnkle, LM.rightElbow]);
  return l >= r ? "left" : "right";
}

export const finite = (n: number): number | null => (Number.isFinite(n) ? n : null);
