---
description: "Secure by default and least privilege — where trust boundaries are, what the browser may never hold, and what the server always re-checks."
applyTo: "**/*"
---

<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Secure by Default, Least Privilege

This app holds a school's data about minors: dates of birth, phone numbers, emergency contacts,
health notes. Every default is therefore closed, and every permission is asked for by name.

## Closed until a use case opens it

- A new Firestore collection is unreadable and unwritable until a view needs it, and then only
  as far as that view needs (see
  [firestore-security-rules.instructions.md](firestore-security-rules.instructions.md)).
- A capability nothing exercises is not "harmless" — it is surface with no test behind it.
  Teacher reads of student master data are not granted, because US-11 does not need them.
- A feature that must not exist in an environment is compiled out of it, not switched off in
  it. The fake login's modules are absent from a build that has not opted in, so a
  configuration mistake cannot turn it on afterwards; `npm run check:production-build` proves
  it against the artifact.

## Trust boundaries

The browser is not trusted, ever — not for who the user is, not for what they may do.

- **The role is re-verified server-side on every write.** The Proxy check ahead of it is
  optimistic by design: the Edge runtime cannot verify the session cookie, so
  `requireTeacherOrResponse` / `requireStudentOrResponse` decide again in the handler.
- **The session decides whose data is touched.** Endpoints that act on "my" record take no id:
  `/api/my-master-data` reads the UPN from the session, so there is nothing for a caller to
  point somewhere else.
- **Server-owned fields are refused, not ignored.** Input schemas are strict and omit
  `SERVER_OWNED`, so a body naming `seasonId` or `isIncomplete` is a 400 rather than a silent
  drop — a caller trying it should hear about it.
- **Every input is parsed at the boundary** with Zod (`safeParse`, never `parse`) before it
  reaches a service.

## Credentials and secrets

- **No service account keys, ever.** The Admin SDK uses Application Default Credentials: the
  metadata server when deployed, `gcloud auth application-default login` locally.
- **The browser holds no secret.** Anything prefixed `NEXT_PUBLIC_` is public by definition and
  ends up in the bundle; treat it as published. The Firebase Web API key is one of these and is
  restricted at the console rather than hidden.
- **A third-party token stays where it was issued for.** The Microsoft Graph access token is
  used server-side to read a name and never stored; it is only forwarded when the sign-in
  provider actually was `microsoft.com`, so an impersonated session cannot carry the real
  teacher's token with it.

## Error responses

- A 500 carries a sanitised message; the real error is logged server-side. Stack traces,
  Firestore paths and internal messages never reach a client.
- `details` is populated for validation failures only — it describes the caller's own input.

## When adding anything

Ask, in this order: does the browser need this at all? If yes, what is the narrowest read that
serves it? What re-checks it on the server? What test proves the denial, not just the success?

Audit new Security Rules with the `firebase-security-rules-auditor` skill before deploying, and
keep changes free of the OWASP Top 10 by construction rather than by review.
