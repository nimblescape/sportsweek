/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { ErrorCode, apiError } from "@/lib/errors";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { currentAuthMode } from "@/lib/auth/auth-mode";
import { buildUpn, isSchoolUpn } from "@/lib/auth/upn";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { userRoleSchema, userSchema } from "@/lib/schemas/user";

/**
 * Stands in for Entra ID while developing, so the app can be tried out as several teachers
 * and students without tenant accounts. It only replaces the identity provider: the client
 * trades the custom token minted here for an ID token and then goes through `/api/session`
 * like any real login, so provisioning, the role claim and the session cookie stay on the
 * code path production uses.
 *
 * Anyone who can reach it can become anyone, which is why every entry point re-checks the
 * mode and otherwise answers 404 — an endpoint that is off should not advertise that it exists.
 */
const notFound = () =>
  NextResponse.json(apiError(ErrorCode.NotFound, "Not found"), { status: 404 });

const bodySchema = z.object({
  firstName: userSchema.shape.firstName,
  lastName: userSchema.shape.lastName,
  role: userRoleSchema,
});

const listedUserSchema = userSchema.omit({ id: true, email: true });

/** The UPNs already in Firestore, so a known user can be picked instead of retyped. */
export async function GET() {
  if (currentAuthMode() !== "fake") return notFound();

  try {
    const snapshot = await adminDb.collection(COLLECTIONS.users).get();
    const users = snapshot.docs
      .flatMap((doc) => {
        const parsed = listedUserSchema.safeParse(doc.data());
        return parsed.success ? [{ upn: doc.id, ...parsed.data }] : [];
      })
      .sort((a, b) => a.upn.localeCompare(b.upn));

    return NextResponse.json({ users });
  } catch (err) {
    console.error("Failed to list the fake-login users:", err);
    return NextResponse.json(
      apiError(ErrorCode.InternalError, "Benutzer konnten nicht geladen werden."),
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

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      apiError(ErrorCode.ValidationError, "Invalid request body", parsed.error.flatten()),
      { status: 400 },
    );
  }

  const { firstName, lastName, role } = parsed.data;
  const upn = buildUpn(firstName, lastName, role);
  // Holds the fake tenant to the shape the real one issues, so a UPN that could never exist
  // in Entra ID cannot exist here either — and the role still follows from the domain (US-3).
  if (!upn || !isSchoolUpn(upn)) {
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

    return NextResponse.json({ customToken, upn });
  } catch (err) {
    console.error("Failed to mint a fake-login token:", err);
    return NextResponse.json(
      apiError(ErrorCode.InternalError, "Test-Anmeldung derzeit nicht möglich."),
      { status: 500 },
    );
  }
}
