import express, { type ErrorRequestHandler, type Express } from "express";
import { loadUser } from "./auth/sessions.ts";
import { adminRouter } from "./routes/admin.ts";
import { authRouter } from "./routes/auth.ts";
import { bookingsRouter } from "./routes/bookings.ts";
import { careRouter } from "./routes/care.ts";
import { healthRouter } from "./routes/health.ts";
import { libraryRouter } from "./routes/library.ts";
import { overviewRouter } from "./routes/overview.ts";
import { sessionsRouter } from "./routes/sessions.ts";
import { applySecurity, sameSiteOnly } from "./security.ts";

/** Builds the server without starting it, so tests can call it directly. */
export function createApp(): Express {
  const app = express();
  applySecurity(app);
  // A finished exercise carries its movement track (joint positions, a few hundred KB at most).
  app.use("/api/sessions", express.json({ limit: "4mb" }));
  app.use(express.json({ limit: "100kb" }));

  const api = express.Router();
  api.use(sameSiteOnly);
  api.use(loadUser);
  api.use(healthRouter);
  api.use(authRouter);
  api.use(adminRouter);
  api.use(libraryRouter);
  api.use(careRouter);
  api.use(sessionsRouter);
  api.use(bookingsRouter);
  api.use(overviewRouter);
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
