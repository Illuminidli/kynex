/**
 * Synthetic skeleton generator for unit tests. Builds a front-facing person in world
 * metres (x = image right = person's left, y down, z toward camera negative) and projects
 * to normalised image coordinates with a simple orthographic camera.
 */
import { LM } from "../src/landmarks.ts";
import type { Point3, PoseFrame } from "../src/types.ts";

const RAD = Math.PI / 180;

export interface PoseParams {
  /** Shoulder abduction angle per side, degrees (0 = arm down). */
  abdL?: number;
  abdR?: number;
  /** Knee flexion (0 = straight) for both legs. */
  kneeFlex?: number;
  /** Lift of each ankle above floor, metres. */
  liftL?: number;
  liftR?: number;
  /** Head yaw, degrees. */
  headYaw?: number;
  /** Whole-body turn about the vertical axis, degrees (90 = side-on to the camera). */
  turn?: number;
}

function p(x: number, y: number, z = 0): Point3 {
  return { x, y, z, visibility: 0.99 };
}

export function makeFrame(t: number, o: PoseParams = {}): PoseFrame {
  const w: Point3[] = Array.from({ length: 33 }, () => p(0, 0));
  const shY = -0.5;
  const hipY = 0;
  const shX = 0.2;
  const hipX = 0.1;
  const upper = 0.3;
  const fore = 0.27;
  const thigh = 0.45;
  const shin = 0.45;

  w[LM.leftShoulder] = p(shX, shY);
  w[LM.rightShoulder] = p(-shX, shY);
  w[LM.leftHip] = p(hipX, hipY);
  w[LM.rightHip] = p(-hipX, hipY);

  // Arms in the frontal plane.
  for (const [side, sign, abd] of [
    ["left", 1, o.abdL ?? 0],
    ["right", -1, o.abdR ?? 0],
  ] as const) {
    const sh = w[LM[`${side}Shoulder`]]!;
    const a = abd * RAD;
    const el = p(sh.x + sign * upper * Math.sin(a), sh.y + upper * Math.cos(a));
    const wr = p(el.x + sign * fore * Math.sin(a), el.y + fore * Math.cos(a));
    w[LM[`${side}Elbow`]] = el;
    w[LM[`${side}Wrist`]] = wr;
    w[LM[`${side}Index`]] = p(wr.x, wr.y + 0.08 * Math.cos(a));
  }

  // Legs: knee flexion bends the knee toward the camera (-z), hips drop.
  const kf = (o.kneeFlex ?? 0) * RAD;
  const half = kf / 2;
  for (const [side, sign, lift] of [
    ["left", 1, o.liftL ?? 0],
    ["right", -1, o.liftR ?? 0],
  ] as const) {
    const hp = w[LM[`${side}Hip`]]!;
    const kn = p(hp.x, hp.y + thigh * Math.cos(half), -thigh * Math.sin(half));
    const an = p(hp.x, kn.y + shin * Math.cos(half) - lift, 0);
    w[LM[`${side}Knee`]] = kn;
    w[LM[`${side}Ankle`]] = an;
    w[LM[`${side}Heel`]] = p(an.x, an.y + 0.05, 0.05);
    w[LM[`${side}FootIndex`]] = p(an.x + sign * 0.02, an.y + 0.05, -0.15);
  }

  // Head.
  const yaw = (o.headYaw ?? 0) * RAD;
  const headY = shY - 0.25;
  w[LM.nose] = p(0.09 * Math.sin(yaw), headY, -0.09 * Math.cos(yaw));
  w[LM.leftEar] = p(0.08 * Math.cos(yaw), headY - 0.02, 0.08 * Math.sin(yaw));
  w[LM.rightEar] = p(-0.08 * Math.cos(yaw), headY - 0.02, -0.08 * Math.sin(yaw));
  w[LM.leftEye] = p(0.03, headY - 0.03, -0.08);
  w[LM.rightEye] = p(-0.03, headY - 0.03, -0.08);

  // Whole-body turn about the vertical axis.
  if (o.turn) {
    const c = Math.cos(o.turn * RAD);
    const sn = Math.sin(o.turn * RAD);
    for (let i = 0; i < w.length; i++) {
      const q = w[i]!;
      w[i] = { ...q, x: q.x * c - q.z * sn, z: q.x * sn + q.z * c };
    }
  }

  // Orthographic projection: 2.4 m field of view, centred.
  const image = w.map((q) => ({ x: 0.5 + q.x / 2.4, y: 0.55 + q.y / 2.4, z: q.z, visibility: q.visibility }));
  return { t, image, world: w, aspect: 1 };
}

/** Sample a smooth oscillation between a and b over `periodMs`, starting at a. */
export function wave(tMs: number, a: number, b: number, periodMs: number): number {
  const ph = (tMs % periodMs) / periodMs;
  return a + (b - a) * (0.5 - 0.5 * Math.cos(ph * 2 * Math.PI));
}

export function run(
  durationMs: number,
  params: (t: number) => PoseParams,
  fps = 30,
): PoseFrame[] {
  const frames: PoseFrame[] = [];
  for (let t = 0; t <= durationMs; t += 1000 / fps) frames.push(makeFrame(t, params(t)));
  return frames;
}
