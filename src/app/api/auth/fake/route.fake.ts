/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { ErrorCode, apiError } from "@/lib/errors";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { currentAuthMode } from "@/lib/auth/auth-mode";
import { resolveAccountType } from "@/lib/auth/guards";
import { buildEmail, isSchoolEmail } from "@/lib/auth/fake/email-builder";
import { SESSION_COOKIE_NAME } from "@/lib/session";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { accountTypeSchema, userSchema } from "@/lib/schemas/user";

/**
 * Stands in for Entra ID while developing, so the app can be tried out as several teachers
 * and students without tenant accounts. It only replaces the identity provider: the client
 * trades the custom token minted here for an ID token and then goes through `/api/session`
 * like any real login, so provisioning, the accountType claim and the session cookie stay on the
 * code path production uses.
 *
 * Reaching it takes a real Entra ID sign-in first — see `entraTeacherCookie`. The mode check
 * answers 404 rather than 403, because an endpoint that is off should not advertise that it
 * exists; once it is on, refusing an unauthorised caller is no longer a secret worth keeping.
 */
const notFound = () =>
  NextResponse.json(apiError(ErrorCode.NotFound, "Not found"), { status: 404 });

const forbidden = () =>
  NextResponse.json(apiError(ErrorCode.PermissionDenied, "Zuerst über Office 365 anmelden."), {
    status: 403,
  });

/** Kept beside `__session`, which impersonating replaces with a custom-token one. */
const ENTRA_COOKIE_NAME = "__entra_session";

/**
 * The credential that unlocks impersonation, and the reason it cannot be `__session` alone:
 * this endpoint mints sessions, so one forged identity would otherwise authorise minting the
 * next indefinitely. `sign_in_provider` is set by Firebase and survives into the session
 * cookie, which makes it the one thing here that a caller cannot influence.
 *
 * Returns the cookie value so the caller can stash it — a tester who has switched identity
 * still holds it and can switch again.
 */
async function entraTeacherCookie(): Promise<string | null> {
  const store = await cookies();

  for (const name of [ENTRA_COOKIE_NAME, SESSION_COOKIE_NAME]) {
    const value = store.get(name)?.value;
    if (!value) continue;

    try {
      const decoded = await adminAuth.verifySessionCookie(value, true);
      if (decoded.firebase?.sign_in_provider !== "microsoft.com") continue;

      // Impersonation is a staff capability: without this a student could sign in for real
      // and then become a teacher.
      const accountType = await resolveAccountType({
        uid: decoded.uid,
        email: decoded.email ?? null,
        accountType: accountTypeSchema.safeParse(decoded.accountType).data ?? null,
      });
      if (accountType === "teacher") return value;
    } catch {
      continue;
    }
  }

  return null;
}

const bodySchema = z.object({
  firstName: userSchema.shape.firstName,
  lastName: userSchema.shape.lastName,
  accountType: accountTypeSchema,
});

// Whom to sign in as, which is a name and the address the school issued. What that person may do
// once signed in is the record's business, not the picker's.
const listedUserSchema = userSchema.omit({
  id: true,
  photo: true,
  permissions: true,
});

/** The addresses already in Firestore, so a known user can be picked instead of retyped. */
export async function GET() {
  if (currentAuthMode() !== "fake") return notFound();
  if (!(await entraTeacherCookie())) return forbidden();

  try {
    const snapshot = await adminDb.collection(COLLECTIONS.users).get();
    // Named by the record's address rather than by its id, which is an opaque uid (US-31).
    const users = snapshot.docs
      .flatMap((doc) => {
        const parsed = listedUserSchema.safeParse(doc.data());
        return parsed.success ? [parsed.data] : [];
      })
      .sort((a, b) => a.email.localeCompare(b.email));

    return NextResponse.json({ users });
  } catch (err) {
    console.error("Failed to list the fake-login users:", err);
    return NextResponse.json(
      apiError(ErrorCode.InternalError, "Benutzer:innen konnten nicht geladen werden."),
      { status: 500 },
    );
  }
}

async function uidFor(upn: string, displayName: string): Promise<string> {
  try {
    return (await adminAuth.getUserByEmail(upn)).uid;
  } catch {
    return (await adminAuth.createUser({ email: upn, displayName, emailVerified: true })).uid;
  }
}

export async function POST(request: Request) {
  if (currentAuthMode() !== "fake") return notFound();

  const entraCookie = await entraTeacherCookie();
  if (!entraCookie) return forbidden();

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      apiError(ErrorCode.ValidationError, "Invalid request body", parsed.error.flatten()),
      { status: 400 },
    );
  }

  const { firstName, lastName, accountType } = parsed.data;
  const upn = buildEmail(firstName, lastName, accountType);
  // Holds the fake tenant to the shape the real one issues, so a UPN that could never exist
  // in Entra ID cannot exist here either — and the accountType still follows from the domain (US-3).
  if (!upn || !isSchoolEmail(upn)) {
    return NextResponse.json(
      apiError(
        ErrorCode.ValidationError,
        "Aus diesem Namen lässt sich keine gültige Schul-Adresse bilden.",
      ),
      { status: 400 },
    );
  }

  try {
    const uid = await uidFor(upn, `${firstName} ${lastName}`);
    // Carried into the ID token, so provisionUser stores the names as typed instead of
    // re-splitting a display name.
    const customToken = await adminAuth.createCustomToken(uid, {
      given_name: firstName,
      family_name: lastName,
    });

    // Signing in with that token is about to overwrite `__session`, taking the proof of the
    // real sign-in with it.
    (await cookies()).set(ENTRA_COOKIE_NAME, entraCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    return NextResponse.json({ customToken, upn });
  } catch (err) {
    console.error("Failed to mint a fake-login token:", err);
    return NextResponse.json(
      apiError(ErrorCode.InternalError, "Test-Anmeldung derzeit nicht möglich."),
      { status: 500 },
    );
  }
}
