import type { Express } from "express";
import type { Server } from "node:http";

/**
 * Starts listening and resolves once the port is really open. Express 5 hands
 * start-up errors to the callback instead of throwing, so without this check a
 * busy port would look like a successful start and the process would quietly exit.
 */
export function listen(app: Express, port: number, host = "0.0.0.0"): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, (err?: Error) => {
      if (!err) return resolve(server);
      if ((err as NodeJS.ErrnoException).code === "EADDRINUSE") {
        return reject(
          new Error(
            `Port ${port} is already in use: another copy of Kynex (or another program) is still running. ` +
              `Stop it first (on Replit: the red stop square in Console, or run "pkill -f dist/index.mjs" in Shell), then start again.`,
          ),
        );
      }
      reject(err);
    });
  });
}
