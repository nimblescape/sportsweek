---
description: "Secure by default and least privilege — closed until a use case opens it, trust boundaries, credentials, and what an error response may say."
applyTo: "**/*"
---

<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Secure by Default, Least Privilege

## Closed until a use case opens it

- A new store, table or collection is unreadable and unwritable until something needs it, and
  then only as far as that thing needs.
- A permission nothing exercises is not harmless. It is surface with no test behind it and no
  reader who knows why it is there.
- A capability that must not exist in an environment is **built out of it**, not switched off
  in it. Code that is absent cannot be enabled by a configuration mistake, and a check against
  the built artefact proves it stayed absent.

## Trust boundaries

The client is not trusted — not for who the user is, and not for what they may do.

- **Re-verify authorization where the work happens.** A check in edge middleware or in the UI
  is a convenience; the handler that performs the operation decides again.
- **Identity comes from the session.** An endpoint acting on the caller's own data takes no
  identifier, so there is nothing for a caller to point at someone else's.
- **Server-owned fields are refused, not ignored.** Keep them off the input schema and make the
  schema strict, so a request naming one fails loudly. A caller attempting it should hear about
  it rather than have it quietly dropped.
- **Validate at the boundary**, once, with a schema, before anything reaches domain code — and
  with the non-throwing form, so a failure is handled rather than raised.

## Credentials and secrets

- **No long-lived credential files.** Use the ambient identity the platform provides; where
  that is unavailable locally, use a developer's own short-lived credentials.
- **The client holds no secret.** Anything shipped to the browser is published, whatever it is
  named — treat a key that reaches the bundle as public and restrict it at its own service
  instead of hiding it.
- **A third-party token stays where it was issued for**, is used server-side, and is not
  stored. Forward it only when the flow that produced it is the flow currently in progress; a
  token held in a closure outlives the session that earned it.

## What an error may say

- A server fault returns a sanitised message; the detail is logged, not sent. Stack traces,
  storage paths and internal messages never reach a client.
- Validation detail is the exception, because it describes the caller's own input.
- Never return a raw exception or validator error object.

## When adding anything

Ask, in this order: does the client need this at all? If so, what is the narrowest access that
serves it? What re-checks it on the server? And what test proves the denial — not only the
success?
