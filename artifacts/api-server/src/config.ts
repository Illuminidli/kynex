import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  isProduction,
  /** The web app folder. Works from both src/ (dev) and dist/ (production), which sit at the same depth. */
  webRoot: path.resolve(here, "../../web"),
  version: process.env.npm_package_version ?? "0.1.0",
};
