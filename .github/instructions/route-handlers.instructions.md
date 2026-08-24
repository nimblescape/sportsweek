---
description: "Zod schema and error-response conventions for Next.js Route Handlers"
applyTo: "app/api/**/*.ts, src/app/api/**/*.ts"
---

# Route Handler Conventions

## Zod Schemas

- Define request body/query/param schemas with Zod — colocate handler-specific schemas in the route file, put schemas shared across routes in `lib/schemas/`.
- Parse input with `schema.safeParse(...)`, never `.parse()`, so validation failures are handled explicitly instead of throwing.
- Infer TypeScript types from schemas with `z.infer<typeof schema>` instead of writing parallel types.
- Validate `params` and `searchParams` through a Zod schema too — never trust them as pre-typed.

## Error Response Envelope

```ts
{ error: { code: string; message: string; details?: unknown } }
```

- Return errors via `NextResponse.json({ error: { code, message } }, { status })`.
- `details` is only populated for 400 validation errors (e.g. `parsed.error.flatten()`) — never attach internal error details or stack traces to a 500 response.
- `code` comes from the shared `ErrorCode` const in `lib/errors.ts` — never inline a raw string literal for a code.

## Canonical Error Codes

Define codes once as an `as const` object plus a derived union type and Zod schema — this keeps the value usable as plain JS, a TS type, and a validated schema without duplicating the list:

```ts
// lib/errors.ts
import { z } from "zod";

export const ErrorCode = {
  ValidationError: "VALIDATION_ERROR",
  AuthenticationRequired: "AUTHENTICATION_REQUIRED",
  PermissionDenied: "PERMISSION_DENIED",
  NotFound: "NOT_FOUND",
  Conflict: "CONFLICT",
  InternalError: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ErrorCodeSchema = z.enum(ErrorCode);
```

## Status Codes

| Status | Code                               | When                                                                               |
| ------ | ---------------------------------- | ---------------------------------------------------------------------------------- |
| 400    | `ErrorCode.ValidationError`        | Zod `safeParse` failed                                                             |
| 401    | `ErrorCode.AuthenticationRequired` | No/invalid session                                                                 |
| 403    | `ErrorCode.PermissionDenied`       | Authenticated but missing required role/permission                                 |
| 404    | `ErrorCode.NotFound`               | Referenced Firestore document / resource doesn't exist                             |
| 409    | `ErrorCode.Conflict`               | Duplicate, concurrent update                                                       |
| 500    | `ErrorCode.InternalError`          | Unexpected error / Admin SDK failure — log server-side, return a sanitized message |

Only add a new member to `ErrorCode` when none of the above fit.

## Example

```ts
import { ErrorCode } from "@/lib/errors";

const bodySchema = z.object({ name: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: ErrorCode.ValidationError,
          message: "Invalid request body",
          details: parsed.error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  // ... use parsed.data
}
```

## Rules

- Never return raw Zod errors, exceptions, or stack traces directly to the client — always map to the standard envelope above.
- Log the full error server-side before returning a sanitized 500 response.
