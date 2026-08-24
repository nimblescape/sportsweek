import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { ErrorCode, apiError } from "@/lib/errors";
import { SESSION_COOKIE_NAME } from "@/lib/session";
import { adminAuth } from "@/lib/firebase/admin";

const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000; // Firebase caps session cookies at 14 days

const bodySchema = z.object({
  idToken: z.string().min(1),
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

  let sessionCookie: string;
  try {
    await adminAuth.verifyIdToken(parsed.data.idToken);
    sessionCookie = await adminAuth.createSessionCookie(parsed.data.idToken, {
      expiresIn: SESSION_MAX_AGE_MS,
    });
  } catch (err) {
    console.error("Failed to verify ID token / create session cookie:", err);
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

  return NextResponse.json({ status: "ok" });
}

// Signs the user out by clearing the session cookie.
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ status: "ok" });
}
