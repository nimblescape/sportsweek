---
description: "Zod schema and error-response conventions for Next.js Route Handlers"
applyTo: "app/api/**/*.ts, src/app/api/**/*.ts"
---

<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

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

- Build it with `apiError` or the `errorResponse` helper — never write the object literal out.
- `code` comes from the `ErrorCode` const in `lib/errors.ts`, which owns the list. Do not copy
  the codes anywhere else, and add a member only when none of the existing ones fit.
- `details` is populated for validation failures only — it describes the caller's own input.
  Never attach internal error details or a stack trace to a 500.
- The message is German and written to be shown to the user unchanged: the client renders what
  the server said rather than inventing wording of its own.

## Use the shared helpers

`src/lib/api/handler.ts` owns the four steps every handler takes. A handler that hand-rolls one
of them is a handler whose envelope will eventually differ from the others':

| Step                                  | Helper                                                    |
| ------------------------------------- | --------------------------------------------------------- |
| Check what the caller may do          | `requirePermissionOrResponse`, `requireStudentOrResponse` |
| The same, plus who they are           | `requirePermissionIdentityOrResponse(permission)`         |
| Parse and validate a body             | `parseJsonBody(request, schema)`                          |
| Report a refusal                      | `errorResponse(code, message, details?)`                  |
| Turn a thrown failure into a response | `handleServiceFailure(error, context)`                    |

A handler names the one permission it needs. Being a teacher opens nothing on its own, and no
permission stands in for another — so the name passed here is the whole of the decision, and
getting it wrong is the failure a test for a teacher holding a _different_ permission catches.
Refusals carry `PERMISSION_DENIED_HINT`, one sentence for every permission, so a caller learns
nothing about which was missing.

Services throw `ServiceError` with an `ErrorCode`; `handleServiceFailure` maps it to the
documented status and sanitises anything else into a logged 500.

## Status Codes

| Status | Code                               | When                                                                               |
| ------ | ---------------------------------- | ---------------------------------------------------------------------------------- |
| 400    | `ErrorCode.ValidationError`        | Zod `safeParse` failed                                                             |
| 401    | `ErrorCode.AuthenticationRequired` | No/invalid session                                                                 |
| 403    | `ErrorCode.PermissionDenied`       | Authenticated, but does not hold the permission the handler names                  |
| 404    | `ErrorCode.NotFound`               | The referenced resource does not exist                                             |
| 409    | `ErrorCode.Conflict`               | Duplicate, concurrent update                                                       |
| 500    | `ErrorCode.InternalError`          | Unexpected error / Admin SDK failure — log server-side, return a sanitized message |

## Example

```ts
export async function POST(request: Request) {
  const denied = await requirePermissionOrResponse("editMasterData");
  if (denied) return denied;

  const body = await parseJsonBody(request, createEventSeriesSchema);
  if (!body.ok) return body.response;

  try {
    const eventSeries = await createEventSeries(body.data);
    return NextResponse.json({ eventSeries }, { status: 201 });
  } catch (error) {
    return handleServiceFailure(error, "Creating an event series");
  }
}
```

## Rules

- Never return raw Zod errors, exceptions, or stack traces directly to the client.
- Log the full error server-side before returning a sanitized 500 response.
- Re-verify the role here even when edge middleware already checked it: that check runs where
  the session cannot be fully verified, and is optimistic by design.
- An endpoint that acts on "my" record takes no id — whose record it is follows from the
  session.
