import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, ErrorCode } from "@/lib/errors";
import { ServiceError, statusForCode } from "@/lib/service-error";
import { getUserWithRole } from "@/lib/auth/guards";

export function errorResponse(code: ErrorCode, message: string, details?: unknown) {
  return NextResponse.json(apiError(code, message, details), { status: statusForCode(code) });
}

/**
 * The proxy already gates teacher routes, but that check is optimistic by design — the Edge
 * runtime cannot verify the session cookie. Every write re-verifies here (US-2, US-3).
 */
export async function requireTeacherOrResponse(): Promise<NextResponse | null> {
  const user = await getUserWithRole();
  if (!user) {
    return errorResponse(ErrorCode.AuthenticationRequired, "Bitte melde dich an.");
  }
  if (user.role !== "teacher") {
    return errorResponse(ErrorCode.PermissionDenied, "Dafür fehlen dir die Rechte.");
  }
  return null;
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
