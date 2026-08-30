/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ErrorCode } from "@/lib/errors";
import { ServiceError, statusForCode } from "@/lib/service-error";
import { getAuthenticatedUser } from "@/lib/auth/guards";
import { may, type Permission } from "@/lib/auth/permissions";

/** One refusal for every permission, so a caller learns nothing about which one was missing. */
export const PERMISSION_DENIED_HINT = "Dafür fehlen dir die Rechte.";

export function errorResponse(code: ErrorCode, message: string, details?: unknown) {
  return NextResponse.json(apiError(code, message, details), { status: statusForCode(code) });
}

/**
 * Only that somebody is signed in, for a handler whose required permission depends on what its
 * body asks for. Read the body after this, so a stranger is refused rather than shown which
 * fields a valid one would name.
 */
export async function requireSignInOrResponse(): Promise<NextResponse | null> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return errorResponse(ErrorCode.AuthenticationRequired, "Bitte melde dich an.");
  }
  return null;
}

/**
 * The proxy already gates teacher routes, but that check is optimistic by design — the Edge
 * runtime cannot verify the session cookie, and it knows nothing of permissions. Every write
 * re-verifies here, against the record rather than the token (US-2, US-3).
 */
export async function requirePermissionOrResponse(
  permission: Permission,
): Promise<NextResponse | null> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return errorResponse(ErrorCode.AuthenticationRequired, "Bitte melde dich an.");
  }
  if (!may(user, permission)) {
    return errorResponse(ErrorCode.PermissionDenied, PERMISSION_DENIED_HINT);
  }
  return null;
}

type IdentifiedOutcome = { ok: true; userId: string } | { ok: false; response: NextResponse };

/**
 * The same check as above, plus who the caller is — for a write that records its author rather
 * than merely permitting it (US-13). The uid, because that is what records are keyed by and it
 * is the one identifier no client can move (US-31).
 */
export async function requirePermissionIdentityOrResponse(
  permission: Permission,
): Promise<IdentifiedOutcome> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return {
      ok: false,
      response: errorResponse(ErrorCode.AuthenticationRequired, "Bitte melde dich an."),
    };
  }
  if (!may(user, permission)) {
    return {
      ok: false,
      response: errorResponse(ErrorCode.PermissionDenied, PERMISSION_DENIED_HINT),
    };
  }
  return { ok: true, userId: user.uid };
}

/**
 * A student is admitted by what they are rather than by what they hold: they carry no
 * permissions, and a teacher keeps no master data of their own (US-15), so admitting one would
 * create a record for an event series they are not registered in.
 */
export async function requireStudentOrResponse(): Promise<IdentifiedOutcome> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return {
      ok: false,
      response: errorResponse(ErrorCode.AuthenticationRequired, "Bitte melde dich an."),
    };
  }
  if (user.accountType !== "student") {
    return {
      ok: false,
      response: errorResponse(ErrorCode.PermissionDenied, PERMISSION_DENIED_HINT),
    };
  }
  return { ok: true, userId: user.uid };
}

type ParseOutcome<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<ParseOutcome<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: errorResponse(
        ErrorCode.ValidationError,
        "Der Anfrageinhalt ist kein gültiges JSON.",
      ),
    };
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: errorResponse(
        ErrorCode.ValidationError,
        "Die Eingabe ist ungültig.",
        z.flattenError(parsed.error),
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

/** Maps a ServiceError onto its documented status; anything else becomes a sanitized 500. */
export function handleServiceFailure(error: unknown, context: string): NextResponse {
  if (error instanceof ServiceError) {
    return errorResponse(error.code, error.message, error.details);
  }

  console.error(`${context} failed:`, error);
  return errorResponse(ErrorCode.InternalError, "Das hat leider nicht geklappt.");
}
