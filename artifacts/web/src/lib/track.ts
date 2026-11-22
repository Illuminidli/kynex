import { LM, type PoseFrame } from "@kynex/motion";

/**
 * The movement track: joint positions only (no picture, no face detail), sampled 10 times a
 * second, enough to replay the movement as an animated figure for the doctor.
 * Stored as little-endian int16 millimetres: x, y, z per joint, frame after frame.
 */
export const TRACK_FPS = 10;
export const TRACK_JOINTS = [
  LM.nose,
  LM.leftEar,
  LM.rightEar,
  LM.leftShoulder,
  LM.rightShoulder,
  LM.leftElbow,
  LM.rightElbow,
  LM.leftWrist,
  LM.rightWrist,
  LM.leftHip,
  LM.rightHip,
  LM.leftKnee,
  LM.rightKnee,
  LM.leftAnkle,
  LM.rightAnkle,
  LM.leftHeel,
  LM.rightHeel,
  LM.leftFootIndex,
  LM.rightFootIndex,
];

/** Collects frames while an exercise runs. Times are ms from the first frame. */
export class TrackRecorder {
  private values: number[] = [];
  private frames = 0;
  t0: number | null = null;
  private nextT = 0;

  /** Call with every pose frame; keeps one every 100 ms. Returns the frame's time from the start. */
  add(f: PoseFrame): number {
    if (this.t0 === null) this.t0 = f.t;
    const rel = f.t - this.t0;
    if (rel + 1 >= this.nextT) {
      // Fill any gap (e.g. a rest between sets) by repeating this frame, so frame n is always at n/10 s.
      while (this.frames * (1000 / TRACK_FPS) <= rel) {
        for (const j of TRACK_JOINTS) {
          const p = f.world[j];
          this.values.push(clamp(p?.x), clamp(p?.y), clamp(p?.z));
        }
        this.frames++;
      }
      this.nextT = this.frames * (1000 / TRACK_FPS);
    }
    return rel;
  }

  /** Time from the start for a tracker timestamp. */
  rel(t: number): number {
    return this.t0 === null ? 0 : t - this.t0;
  }

  get length() {
    return this.frames;
  }

  encode(): { fps: number; joints: number[]; frames: number; data: string } | null {
    if (!this.frames) return null;
    const buf = new DataView(new ArrayBuffer(this.values.length * 2));
    this.values.forEach((v, i) => buf.setInt16(i * 2, v, true));
    let bin = "";
    const bytes = new Uint8Array(buf.buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { fps: TRACK_FPS, joints: TRACK_JOINTS, frames: this.frames, data: btoa(bin) };
  }
}

const clamp = (m: number | undefined) => Math.max(-32000, Math.min(32000, Math.round((m ?? 0) * 1000)));

export interface DecodedTrack {
  fps: number;
  frames: number;
  /** frame -> landmark index -> [x, y, z] metres */
  at: (frame: number) => Map<number, [number, number, number]>;
}

export function decodeTrack(t: { fps: number; joints: number[]; frames: number; data: string }): DecodedTrack {
  const bin = atob(t.data);
  const view = new DataView(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) view.setUint8(i, bin.charCodeAt(i));
  const per = t.joints.length * 3;
  return {
    fps: t.fps,
    frames: t.frames,
    at(frame) {
      const f = Math.max(0, Math.min(t.frames - 1, Math.round(frame)));
      const out = new Map<number, [number, number, number]>();
      t.joints.forEach((j, k) => {
        const o = (f * per + k * 3) * 2;
        out.set(j, [view.getInt16(o, true) / 1000, view.getInt16(o + 2, true) / 1000, view.getInt16(o + 4, true) / 1000]);
      });
      return out;
    },
  };
}
