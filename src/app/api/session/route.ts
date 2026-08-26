/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { ErrorCode, apiError } from "@/lib/errors";
import { SESSION_COOKIE_NAME } from "@/lib/session";
import { adminAuth } from "@/lib/firebase/admin";
import { provisionUser } from "@/lib/auth/provision-user";

const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // Firebase caps session cookies at 14 days

const bodySchema = z.object({
  idToken: z.string().min(1),
  // Only ever used to call Graph, which rejects a forged token — never trusted directly.
  msAccessToken: z.string().min(1).optional(),
});

// Exchanges a client-side Firebase ID token (from signInWithPopup) for an httpOnly session cookie.
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      apiError(ErrorCode.ValidationError, "Invalid request body", parsed.error.flatten()),
      { status: 400 },
    );
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(parsed.data.idToken);
  } catch (err) {
    console.error("Failed to verify ID token:", err);
    return NextResponse.json(
      apiError(ErrorCode.AuthenticationRequired, "Invalid or expired ID token"),
      { status: 401 },
    );
  }

  // No record, no claim and no cookie for a UPN outside the allowed domains (US-3).
  let provisioned;
  try {
    provisioned = await provisionUser(decoded, parsed.data.msAccessToken);
  } catch (err) {
    // Typically a missing Firestore database or missing Application Default Credentials.
    console.error("Failed to provision the user record:", err);
    return NextResponse.json(
      apiError(
        ErrorCode.InternalError,
        "Anmeldung derzeit nicht möglich. Bitte später erneut versuchen.",
      ),
      { status: 500 },
    );
  }

  if (!provisioned.ok) {
    // The refusing rule supplies its own wording where it has better wording to give.
    const message = provisioned.message ?? "Dieses Konto ist für Sportsweek nicht freigeschaltet.";

    return NextResponse.json(apiError(ErrorCode.PermissionDenied, message), { status: 403 });
  }

  let sessionCookie: string;
  try {
    sessionCookie = await adminAuth.createSessionCookie(parsed.data.idToken, {
      expiresIn: SESSION_MAX_AGE_MS,
    });
  } catch (err) {
    console.error("Failed to create session cookie:", err);
    return NextResponse.json(
      apiError(ErrorCode.AuthenticationRequired, "Invalid or expired ID token"),
      { status: 401 },
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_MS / 1000,
    path: "/",
  });

  // Returning the role lets the client skip the /app landing hop, which would otherwise cost
  // another request and another session-cookie verification.
  return NextResponse.json({ status: "ok", role: provisioned.user.role });
}

// Signs the user out by clearing the session cookie.
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ status: "ok" });
}
