import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  isProduction,
  /**
   * Running inside the Replit editor (not a published deployment). Replit shows the
   * app in a frame on replit.com, so framing is allowed for Replit's own sites only.
   */
  inReplitEditor: !!process.env.REPL_ID && process.env.REPLIT_DEPLOYMENT !== "1",
  /** The web app folder. Works from both src/ (dev) and dist/ (production), which sit at the same depth. */
  webRoot: path.resolve(here, "../../web"),
  /** SQL files that create and change the tables, applied in order at start-up. */
  migrationsFolder: path.resolve(here, "../../../lib/db/migrations"),
  version: process.env.npm_package_version ?? "0.1.0",
};
