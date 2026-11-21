// Puts the body-tracking files where the web app serves them, so nothing loads from
// another website at run time and camera video never leaves the device:
//   public/mediapipe/wasm/  MediaPipe's runtime, copied from the installed package
//   public/models/          Google's pose model (Apache-2.0), downloaded once and
//                           checked against a fixed fingerprint (SHA-256)
// Runs before every build and before the dev server. Both folders are git-ignored.
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// 1. MediaPipe runtime.
// pnpm links each dependency into this package's own node_modules.
const pkgDir = join(webRoot, "node_modules", "@mediapipe", "tasks-vision");
if (!existsSync(join(pkgDir, "wasm"))) throw new Error("[pose-assets] @mediapipe/tasks-vision is not installed: run pnpm install.");
const wasmOut = join(webRoot, "public", "mediapipe", "wasm");
mkdirSync(wasmOut, { recursive: true });
cpSync(join(pkgDir, "wasm"), wasmOut, { recursive: true });

// 2. Pose model, pinned to version 1 and its fingerprint.
const MODEL = {
  file: "pose_landmarker_full.task",
  url: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
  sha256: "5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1",
};
const modelDir = join(webRoot, "public", "models");
const modelPath = join(modelDir, MODEL.file);
const fingerprint = (buf) => createHash("sha256").update(buf).digest("hex");

if (existsSync(modelPath) && fingerprint(readFileSync(modelPath)) === MODEL.sha256) {
  console.log("[pose-assets] ready");
} else {
  mkdirSync(modelDir, { recursive: true });
  console.log(`[pose-assets] downloading ${MODEL.file} (9 MB)...`);
  const res = await fetch(MODEL.url);
  if (!res.ok) throw new Error(`[pose-assets] download failed: HTTP ${res.status} from ${MODEL.url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (fingerprint(buf) !== MODEL.sha256) {
    throw new Error("[pose-assets] the downloaded pose model doesn't match its fingerprint; refusing to use it.");
  }
  writeFileSync(`${modelPath}.part`, buf);
  renameSync(`${modelPath}.part`, modelPath);
  console.log("[pose-assets] ready");
}
