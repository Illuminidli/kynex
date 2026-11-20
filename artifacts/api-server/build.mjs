// Bundles the server and the packages it uses into one file, dist/index.mjs,
// for Replit deployments. A few packages that ship native or WebAssembly files
// stay outside the bundle and load from node_modules (they are listed as
// dependencies of this package so they can be found there).
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  external: ["pg", "pg-native", "@electric-sql/pglite", "vite"],
  // Some bundled packages use require(); give the ES module bundle a working one.
  banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);" },
});
console.log("Built dist/index.mjs");
