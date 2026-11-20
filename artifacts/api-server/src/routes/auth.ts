import { GetMeResponse, SignInBody, SignInResponse } from "@kynex/api-zod";
import { getDb, schema } from "@kynex/db";
import { eq, sql } from "drizzle-orm";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { DUMMY_HASH, verifyPassword } from "../auth/passwords.ts";
import { endSession, requireRole, startSession, type SignedInUser } from "../auth/sessions.ts";

const { clinics, users } = schema;

export const MAX_WRONG_PASSWORDS = 5;
export const LOCK_MINUTES = 15;
const WRONG = "Email or password is wrong.";

export const authRouter = Router();

// On top of the per-account lock: at most 20 sign-in attempts per 15 minutes from one network address.
const signInLimit = rateLimit({
  windowMs: 15 * 60_000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many sign-in attempts from this network. Please wait 15 minutes." },
});

authRouter.post("/auth/sign-in", signInLimit, async (req, res) => {
  const parsed = SignInBody.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "Enter your email and password." });
  const email = parsed.data.email.trim().toLowerCase();

  const { db } = await getDb();
  const [user] = await db
    .select({ user: users, clinicName: clinics.name })
    .from(users)
    .innerJoin(clinics, eq(clinics.id, users.clinicId))
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    await verifyPassword(parsed.data.password, DUMMY_HASH); // same delay as a real check
    return void res.status(401).json({ error: WRONG });
  }
  const account = user.user;
  if (account.lockedUntil && account.lockedUntil > new Date()) {
    return void res.status(423).json(lockedBody(account.lockedUntil));
  }

  if (!(await verifyPassword(parsed.data.password, account.passwordHash))) {
    // Count the miss in the database itself, so two attempts at once can't both slip through.
    const [after] = await db
      .update(users)
      .set({ failedSignIns: sql`${users.failedSignIns} + 1`, updatedAt: new Date() })
      .where(eq(users.id, account.id))
      .returning({ failedSignIns: users.failedSignIns });
    if ((after?.failedSignIns ?? 0) >= MAX_WRONG_PASSWORDS) {
      const lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
      await db.update(users).set({ failedSignIns: 0, lockedUntil, updatedAt: new Date() }).where(eq(users.id, account.id));
      return void res.status(423).json(lockedBody(lockedUntil));
    }
    return void res.status(401).json({ error: WRONG });
  }

  await db
    .update(users)
    .set({ failedSignIns: 0, lockedUntil: null, lastSignInAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, account.id));
  await startSession(res, account);
  res.json(
    SignInResponse.parse(
      toMe({ ...account, clinicName: user.clinicName, sessionId: "" }),
    ),
  );
});

authRouter.post("/auth/sign-out", async (req, res) => {
  await endSession(req, res);
  res.status(204).end();
});

authRouter.get("/auth/me", requireRole(), (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(GetMeResponse.parse(toMe(req.user!)));
});

function lockedBody(lockedUntil: Date) {
  return {
    error: `Too many wrong passwords. This account is locked for ${LOCK_MINUTES} minutes.`,
    lockedUntil: lockedUntil.toISOString(),
  };
}

function toMe(user: Omit<SignedInUser, "sessionId"> & { sessionId?: string }) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    clinic: { id: user.clinicId, name: user.clinicName },
    freshSince: user.freshSince.toISOString(),
  };
}
