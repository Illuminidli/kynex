import type { Express, RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { config } from "./config.ts";

/** Sites allowed to show the app in a frame while it runs inside the Replit editor (never in a published deployment). */
const REPLIT_EDITOR_ORIGINS = ["https://replit.com", "https://*.replit.com", "https://*.replit.dev", "https://*.repl.co"];

/** Security headers and request limits applied to every response. */
export function applySecurity(app: Express) {
  // Replit (and any future host) sits behind one proxy; needed for correct client IPs in rate limiting.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  app.use(
    helmet({
      // The dev server injects inline scripts for live reload, so the strict policy is production-only.
      contentSecurityPolicy: config.isProduction
        ? {
            useDefaults: false,
            directives: {
              defaultSrc: ["'self'"],
              // 'wasm-unsafe-eval' lets the on-device body-tracking model (WebAssembly) run; it does not allow eval().
              scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "blob:"],
              mediaSrc: ["'self'", "blob:"],
              connectSrc: ["'self'"],
              workerSrc: ["'self'", "blob:"],
              manifestSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              frameAncestors: config.inReplitEditor ? REPLIT_EDITOR_ORIGINS : ["'none'"],
              upgradeInsecureRequests: [],
            },
          }
        : false,
      // X-Frame-Options can't list allowed sites, so in the Replit editor framing is controlled by frame-ancestors above.
      frameguard: config.inReplitEditor ? false : { action: "deny" },
      crossOriginEmbedderPolicy: false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      strictTransportSecurity: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );

  // Camera and microphone only for our own pages; everything else off.
  app.use((_req, res, next) => {
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(), payment=(), usb=()");
    next();
  });

  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: "Too many requests. Please wait a minute and try again." },
    }),
  );
}

/**
 * Blocks changes (sign-in, reset, later: saving results) that another website tries to
 * trigger in a signed-in person's browser. Browsers label where a request came from;
 * anything not from our own page is refused. Reading (GET) is unaffected.
 */
export const sameSiteOnly: RequestHandler = (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const site = req.get("sec-fetch-site");
  const origin = req.get("origin");
  const host = req.get("x-forwarded-host") ?? req.get("host");
  const crossSite = site !== undefined && site !== "same-origin" && site !== "none";
  let otherOrigin = false;
  if (origin) {
    try {
      otherOrigin = new URL(origin).host !== host;
    } catch {
      otherOrigin = true;
    }
  }
  if (crossSite || otherOrigin) return void res.status(403).json({ error: "Request blocked: it didn't come from the Kynex app." });
  next();
};
