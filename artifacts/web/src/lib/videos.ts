/**
 * Exercise videos are kept ON THIS PHONE ONLY (the browser's own storage, IndexedDB).
 * They are never uploaded: Kynex's server only gets the measurements. Clearing the browser's
 * site data, or another phone, means the video isn't there.
 */
const DB = "kynex-videos";
const STORE = "videos";

export interface StoredVideo {
  /** The saved exercise result this video belongs to. */
  id: string;
  blob: Blob;
  /** The camera faced the patient (front camera), so the picture was mirrored on screen. */
  mirrored: boolean;
  /** Body outline for playback: [timeMs, x0, y0, x1, y1, ...] per sample, image coordinates 0..1. */
  outline: number[][];
  savedAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveVideo(v: StoredVideo): Promise<boolean> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(v);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    // Ask the browser not to clear these when space runs low (it may still say no).
    void navigator.storage?.persist?.();
    return true;
  } catch {
    return false;
  }
}

export async function getVideo(id: string): Promise<StoredVideo | null> {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE).objectStore(STORE).get(id);
      req.onsuccess = () => resolve((req.result as StoredVideo | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/** Records the camera while an exercise runs. */
export class CameraRecorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  outline: number[][] = [];
  private t0 = 0;

  start(stream: MediaStream | null) {
    if (!stream || this.rec || typeof MediaRecorder === "undefined") return;
    const type = ["video/webm;codecs=vp9", "video/webm", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    try {
      // A modest bitrate keeps a minute of video to a few MB on the phone.
      this.rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: 900_000 });
    } catch {
      this.rec = null;
      return;
    }
    this.chunks = [];
    this.outline = [];
    this.t0 = performance.now();
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(1000);
  }

  /** Keep the outline points (image coordinates) to draw over the video later. */
  mark(points: { x: number; y: number }[]) {
    if (!this.rec) return;
    const t = performance.now() - this.t0;
    const last = this.outline.at(-1);
    if (last && t - last[0]! < 100) return;
    this.outline.push([Math.round(t), ...points.flatMap((p) => [Math.round(p.x * 1000) / 1000, Math.round(p.y * 1000) / 1000])]);
  }

  get recording() {
    return this.rec !== null;
  }

  stop(): Promise<Blob | null> {
    const rec = this.rec;
    this.rec = null;
    if (!rec || rec.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      rec.onstop = () => resolve(this.chunks.length ? new Blob(this.chunks, { type: rec.mimeType || "video/webm" }) : null);
      rec.stop();
    });
  }
}
