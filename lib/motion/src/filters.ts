import type { Point3, PoseFrame } from "./types.ts";

/**
 * One Euro filter (Casiez, Roussel & Vogel, CHI 2012): low jitter when still,
 * low lag when moving. Public-domain algorithm, implemented from the paper.
 */
class OneEuro {
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev = 0;
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;

  constructor(minCutoff: number, beta: number, dCutoff = 1) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x: number, tMs: number): number {
    if (!Number.isFinite(x)) return x;
    if (this.xPrev === null) {
      this.xPrev = x;
      this.tPrev = tMs;
      return x;
    }
    const dt = Math.max((tMs - this.tPrev) / 1000, 1e-3);
    const dx = (x - this.xPrev) / dt;
    const aD = OneEuro.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = OneEuro.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = tMs;
    return xHat;
  }
}

export interface SmootherOptions {
  minCutoff?: number;
  beta?: number;
}

/** Smooths every coordinate of every landmark of a pose stream. */
export class PoseSmoother {
  private filters = new Map<string, OneEuro>();
  private readonly minCutoff: number;
  private readonly beta: number;

  constructor(opts: SmootherOptions = {}) {
    this.minCutoff = opts.minCutoff ?? 1.2;
    this.beta = opts.beta ?? 0.05;
  }

  private f(key: string): OneEuro {
    let v = this.filters.get(key);
    if (!v) {
      v = new OneEuro(this.minCutoff, this.beta);
      this.filters.set(key, v);
    }
    return v;
  }

  private smoothSet(prefix: string, pts: Point3[], t: number): Point3[] {
    return pts.map((p, i) => ({
      x: this.f(`${prefix}${i}x`).filter(p.x, t),
      y: this.f(`${prefix}${i}y`).filter(p.y, t),
      z: this.f(`${prefix}${i}z`).filter(p.z, t),
      visibility: p.visibility,
    }));
  }

  apply(frame: PoseFrame): PoseFrame {
    return {
      t: frame.t,
      aspect: frame.aspect,
      image: this.smoothSet("i", frame.image, frame.t),
      world: this.smoothSet("w", frame.world, frame.t),
    };
  }

  reset(): void {
    this.filters.clear();
  }
}
