import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { PoseSmoother, SKELETON, type PlacementBox, type PoseFrame } from "@kynex/motion";
import { useCallback, useEffect, useRef, useState } from "react";

/* ------------------------------ Pose model ------------------------------ */

let landmarker: Promise<PoseLandmarker> | null = null;

/**
 * Loads Google's MediaPipe pose model once. Everything is served by Kynex itself
 * (/mediapipe/wasm, /models), and camera video is analysed on the device: it is never uploaded.
 */
function loadLandmarker(): Promise<PoseLandmarker> {
  landmarker ??= (async () => {
    const { FilesetResolver, PoseLandmarker } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const make = (delegate: "GPU" | "CPU") =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: "/models/pose_landmarker_full.task", delegate },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try {
      return await make("GPU");
    } catch {
      return await make("CPU"); // older phones without usable graphics acceleration
    }
  })();
  landmarker.catch(() => (landmarker = null));
  return landmarker;
}

let lastTs = 0;

function detect(model: PoseLandmarker, video: HTMLVideoElement, t: number): PoseFrame | null {
  const ts = Math.max(performance.now(), lastTs + 1); // MediaPipe needs strictly increasing times
  lastTs = ts;
  let frame: PoseFrame | null = null;
  const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
  model.detectForVideo(video, ts, (res) => {
    const image = res.landmarks[0];
    const world = res.worldLandmarks[0];
    if (!image || !world) return;
    // Copy: the result is only valid inside this callback.
    frame = {
      t,
      aspect,
      image: image.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility })),
      world: world.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility })),
    };
  });
  return frame;
}

/* ------------------------------ Camera loop ----------------------------- */

export type CameraStatus = "idle" | "loading" | "running" | "error";

/** Camera -> pose model -> smoothing -> onFrame, about 30 times a second. */
export function useCamera(onFrame: (frame: PoseFrame | null) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const onFrameRef = useRef(onFrame);
  const stream = useRef<MediaStream | null>(null);
  const raf = useRef<number | null>(null);
  const smoother = useRef(new PoseSmoother());
  /** Each start gets a number; a start that has been overtaken (stopped, or started again) quietly gives up. */
  const run = useRef(0);

  useEffect(() => {
    onFrameRef.current = onFrame;
  }, [onFrame]);

  const stop = useCallback(() => {
    run.current++;
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(
    async (facingMode: "user" | "environment") => {
      stop();
      const id = run.current;
      setError(null);
      setStatus("loading");
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("This browser can't use the camera. Open Kynex in Chrome, Edge or Safari.");
        }
        const [model, media] = await Promise.all([
          loadLandmarker(),
          navigator.mediaDevices.getUserMedia({
            video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: false,
          }),
        ]);
        if (id !== run.current || !videoRef.current) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        const video = videoRef.current;
        video.srcObject = media;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        if (id !== run.current) return;
        smoother.current.reset();
        setStatus("running");
        let lastVideoTime = -1;
        const tick = () => {
          if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
            lastVideoTime = video.currentTime;
            const raw = detect(model, video, performance.now());
            onFrameRef.current(raw ? smoother.current.apply(raw) : null);
          }
          raf.current = requestAnimationFrame(tick);
        };
        raf.current = requestAnimationFrame(tick);
      } catch (e) {
        if (id !== run.current) return; // overtaken by a newer start or a stop: not an error
        stop();
        setError(
          e instanceof DOMException && e.name === "NotAllowedError"
            ? "Camera permission was refused. Allow the camera for this site in the browser settings, then try again."
            : e instanceof Error
              ? e.message
              : "Couldn't start the camera.",
        );
        setStatus("error");
      }
    },
    [stop],
  );

  return { videoRef, status, error, start, stop };
}

/* ------------------------------- Drawing -------------------------------- */

const COLOURS = {
  good: "rgba(47,158,115,0.95)",
  fault: "rgba(242,129,46,0.95)",
  idle: "rgba(255,255,255,0.85)",
};

/**
 * Draws the body outline over the video. `focus` = the joints this exercise measures,
 * drawn thicker. The canvas covers the video box; the video uses object-contain.
 */
export function drawPose(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  frame: PoseFrame | null,
  o: { mirror: boolean; focus: number[]; state: keyof typeof COLOURS; box?: { rect: PlacementBox; state: "wait" | "in" | "out" } },
) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(rect.width * dpr);
  const h = Math.round(rect.height * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, w, h);
  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const scale = Math.min(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const ox = (w - dw) / 2;
  const oy = (h - dh) / 2;
  // The box the whole body must be inside: dashed white while waiting, green when in place, red when out.
  if (o.box) {
    const b = o.box.rect;
    const x0 = ox + (o.mirror ? 1 - b.x1 : b.x0) * dw;
    const y0 = oy + b.y0 * dh;
    const bw = (b.x1 - b.x0) * dw;
    const bh = (b.y1 - b.y0) * dh;
    ctx.save();
    ctx.lineWidth = Math.max(4, dw / 110);
    ctx.strokeStyle = o.box.state === "in" ? "rgba(61,220,132,0.95)" : o.box.state === "out" ? "rgba(255,90,78,0.95)" : "rgba(255,255,255,0.8)";
    if (o.box.state === "wait") ctx.setLineDash([ctx.lineWidth * 3, ctx.lineWidth * 2]);
    ctx.beginPath();
    ctx.roundRect(x0, y0, bw, bh, Math.max(12, dw / 30));
    ctx.stroke();
    ctx.restore();
  }
  if (!frame) return;
  const at = (i: number) => {
    const p = frame.image[i];
    if (!p || (p.visibility ?? 1) < 0.3) return null;
    return { x: ox + (o.mirror ? 1 - p.x : p.x) * dw, y: oy + p.y * dh };
  };
  const focus = new Set(o.focus);
  ctx.lineCap = "round";
  for (const [a, b] of SKELETON) {
    const pa = at(a);
    const pb = at(b);
    if (!pa || !pb) continue;
    const strong = focus.has(a) && focus.has(b);
    ctx.strokeStyle = strong ? COLOURS[o.state] : "rgba(255,255,255,0.5)";
    ctx.lineWidth = strong ? Math.max(4, dw / 160) : Math.max(2, dw / 320);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
  for (let i = 11; i < frame.image.length; i++) {
    const p = at(i);
    if (!p) continue;
    const strong = focus.has(i);
    ctx.fillStyle = strong ? COLOURS[o.state] : "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, strong ? Math.max(5, dw / 130) : Math.max(3, dw / 260), 0, Math.PI * 2);
    ctx.fill();
  }
}
