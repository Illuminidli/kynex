import express, { type ErrorRequestHandler, type Express } from "express";
import { loadUser } from "./auth/sessions.ts";
import { adminRouter } from "./routes/admin.ts";
import { authRouter } from "./routes/auth.ts";
import { healthRouter } from "./routes/health.ts";
import { libraryRouter } from "./routes/library.ts";
import { applySecurity, sameSiteOnly } from "./security.ts";

/** Builds the server without starting it, so tests can call it directly. */
export function createApp(): Express {
  const app = express();
  applySecurity(app);
  app.use(express.json({ limit: "100kb" }));

  const api = express.Router();
  api.use(sameSiteOnly);
  api.use(loadUser);
  api.use(healthRouter);
  api.use(authRouter);
  api.use(adminRouter);
  api.use(libraryRouter);
  api.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use("/api", api);

  return app;
}

/** Last stop for errors: log the detail on the server, never send it to the browser. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Something went wrong." });
};
