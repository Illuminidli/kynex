import { getDb, schema, type UserRole } from "@kynex/db";
import { and, eq, gt } from "drizzle-orm";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import { config } from "../config.ts";

const { clinics, loginSessions, users } = schema;

/** How long a device stays signed in. */
const SESSION_DAYS = 14;

// "__Host-" makes the browser refuse the cookie unless it is https-only, for this exact site, on every path.
// Plain http on a laptop can't use that prefix, so development uses a plain name.
const COOKIE = config.isProduction ? "__Host-kynex_session" : "kynex_session";
const COOKIE_OPTIONS = {
  httpOnly: true, // page scripts can't read it, so injected code can't steal it
  secure: config.isProduction,
  sameSite: "lax" as const, // not sent with requests started by other sites
  path: "/",
};

export interface SignedInUser {
  id: string;
  clinicId: string;
  clinicName: string;
  email: string;
  displayName: string;
  role: UserRole;
  freshSince: Date;
  sessionId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by loadUser when the request carries a valid session cookie. */
      user?: SignedInUser;
    }
  }
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("base64url");

function readCookie(req: Request): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/** Starts a session for this device and sets the cookie. */
export async function startSession(res: Response, user: { id: string; clinicId: string }) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const { db } = await getDb();
  await db.insert(loginSessions).values({ clinicId: user.clinicId, userId: user.id, tokenHash: hashToken(token), expiresAt });
  res.cookie(COOKIE, token, { ...COOKIE_OPTIONS, expires: expiresAt });
}

/** Ends this device's session (if any) and clears the cookie. */
export async function endSession(req: Request, res: Response) {
  const token = readCookie(req);
  if (token) {
    const { db } = await getDb();
    await db.delete(loginSessions).where(eq(loginSessions.tokenHash, hashToken(token)));
  }
  res.clearCookie(COOKIE, COOKIE_OPTIONS);
}

/** Looks up the signed-in person from the cookie and puts them on req.user. Never rejects a request itself. */
export const loadUser: RequestHandler = async (req, _res, next) => {
  try {
    const token = readCookie(req);
    if (!token) return next();
    const { db } = await getDb();
    const [row] = await db
      .select({
        sessionId: loginSessions.id,
        lastSeenAt: loginSessions.lastSeenAt,
        id: users.id,
        clinicId: users.clinicId,
        clinicName: clinics.name,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        freshSince: users.freshSince,
      })
      .from(loginSessions)
      .innerJoin(users, eq(users.id, loginSessions.userId))
      .innerJoin(clinics, eq(clinics.id, users.clinicId))
      .where(and(eq(loginSessions.tokenHash, hashToken(token)), gt(loginSessions.expiresAt, new Date())))
      .limit(1);
    if (row) {
      const { lastSeenAt, ...user } = row;
      req.user = user;
      // Note activity at most every 10 minutes rather than on every request.
      if (Date.now() - lastSeenAt.getTime() > 10 * 60 * 1000) {
        await db.update(loginSessions).set({ lastSeenAt: new Date() }).where(eq(loginSessions.id, row.sessionId));
      }
    }
    next();
  } catch (err) {
    next(err);
  }
};

/** Only lets the request through if someone is signed in and (if roles are given) has one of them. */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return void res.status(401).json({ error: "Please sign in." });
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return void res.status(403).json({ error: "Your account can't open this." });
    }
    next();
  };
}
