import { NextResponse } from "next/server";
import { z } from "zod";
import { ErrorCode, apiError } from "@/lib/errors";
import { getSessionUser } from "@/lib/session";

const querySchema = z.object({
  verbose: z.enum(["true", "false"]).optional(),
});

// Example Route Handler demonstrating the conventions from
// .github/instructions/route-handlers.instructions.md — replace with real endpoints.
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      apiError(ErrorCode.AuthenticationRequired, "Sign-in required"),
      { status: 401 },
    );
  }

  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      apiError(ErrorCode.ValidationError, "Invalid query parameters", parsed.error.flatten()),
      { status: 400 },
    );
  }

  return NextResponse.json({ status: "ok", uid: user.uid });
}
