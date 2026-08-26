---
description: "Single source of truth — constants instead of repeated literals, types derived rather than restated, and a module that owns any answer more than one place needs."
applyTo: "**/*"
---

<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Single Source of Truth

Every fact this app relies on is written down once. The second copy is not redundancy — it is
a copy that will disagree with the first, at a time nobody is looking.

## Constants, not literals

A string that names something — a collection, a route, an error code, a field — is declared
once and imported. Never typed out at the point of use.

```ts
// no
const snapshot = await adminDb.collection("studentMasterData").doc(id).get();

// yes
const snapshot = await adminDb.collection(COLLECTIONS.studentMasterData).doc(id).get();
```

The ones already in place, and what they own:

| Constant                 | Owns                                             | Lives in                        |
| ------------------------ | ------------------------------------------------ | ------------------------------- |
| `COLLECTIONS`            | every Firestore collection name                  | `lib/schemas/collections.ts`    |
| `ROUTES`                 | every path the app links to                      | `lib/routes.ts`                 |
| `ErrorCode`              | every code an error envelope may carry           | `lib/errors.ts`                 |
| `MASTER_DATA_CATEGORIES` | the six teacher-maintained lists and their shape | `lib/master-data/categories.ts` |
| `INJECTED_VARIABLES`     | every environment variable a build may read      | `lib/apphosting-env.ts`         |
| `MAX_EQUIPMENT_ITEMS`    | how long either equipment list may be            | `lib/schemas/master-data.ts`    |

A displayed string is a constant too when more than one place shows it — `IN_USE_HINT`,
`REGISTRATION_NOT_OPEN_HINT`. And a value is kept apart from its label, so display text can
never become a stored value: `FOOD_OPTION_OTHER` is `"other"`, `FOOD_OPTION_OTHER_LABEL` is
what the student reads.

## Derive, do not restate

Where one fact implies another, compute it:

- **Types come from schemas.** `type X = z.infer<typeof xSchema>` — never a hand-written type
  beside a schema describing the same shape.
- **Schemas come from schemas.** `studentMasterDataInputSchema` is the record's own fields
  minus `SERVER_OWNED`, so a field added to the record cannot be forgotten on the endpoint,
  and `studentMasterDataLockedFields` is built from that same list.
- **Lists come from lists.** `toRegistrationInput` walks the keys of `EMPTY_REGISTRATION`
  rather than naming nineteen fields a second time.
- **Limits come from one number.** A program's required equipment and a student's rentals are
  both bounded by `MAX_EQUIPMENT_ITEMS`, so the two cannot drift into contradiction.

When a copy genuinely cannot be avoided — Security Rules cannot import TypeScript — say so at
both ends, and say what the other end is. `SERVER_OWNED` and the rules that rely on it each
name the other.

## A module owns what more than one place needs

If two callers need the same answer, neither works it out. A module owns the question and both
ask it.

| Question                                   | Owned by                                  |
| ------------------------------------------ | ----------------------------------------- |
| what is still missing from a registration? | `lib/student-master-data/completeness.ts` |
| which season is the active one?            | `lib/seasons/season-state.ts`             |
| what id does this student's record have?   | `lib/student-master-data/registration.ts` |
| are these two names the same name?         | `lib/firebase/unique-name.ts`             |
| which role does this UPN get?              | `lib/auth/upn.ts`                         |
| which sign-in does this deployment use?    | `lib/auth/auth-mode.ts`                   |

The form marks missing answers and the server stores `isIncomplete` from the _same_
`missingAnswers`. Had each decided for itself, a registration could be complete on screen and
incomplete in the report, and both would be right.

This is also why the in-use guard resolves names on the server and hands the client ids: the
browser would otherwise re-implement "the same name", and drift the moment either side changed.

## Configuration too

`apphosting.yaml` holds only what every environment shares; each environment file holds its own
values, and nothing is written twice (see
[environments.instructions.md](environments.instructions.md)). There are no `.env` files —
a second place to configure the same thing is a second answer to the same question.
