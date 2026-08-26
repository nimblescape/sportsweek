---
description: "How Firestore Security Rules are used in this app — reads gated per collection, every client write closed, and why the invariants live in Route Handlers instead."
applyTo: "firestore.rules, **/firestore.rules"
---

<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Firestore Security Rules

What the roles _mean_ is a requirement, not a convention: US-2 and US-3 in
[spec/requirements.md](../../spec/requirements.md) own that, and this file does not repeat it.
What follows is the shape the rules take, and why.

## The decision: rules gate reads, handlers own writes

Every collection denies client writes. That is the design, not unfinished work.

Rules can `get()` a document at a path they can name, but they cannot run a query — and every
invariant this app has needs one:

- is this name already taken? (seasons, events, each master data list)
- is at most one season active?
- is this master data item still selected by a record of a non-archived season?
- does deleting this season take its events and student records with it?
- does this registration belong to _the_ active season, and does that season's
  `hasStudentData` mirror still agree?

None of those are expressible here, so they are enforced in transactions in Route Handlers,
which use the Admin SDK and bypass rules entirely. A second, unchecked way in would make every
one of those guarantees worthless, so `allow write: if false` **is** the guarantee.

Permitting a client write is therefore a design change, not a tweak. If a new collection really
does carry no invariant beyond ownership, say so in the rule's own comment.

## Identity is the UPN, never the uid

`/users` is keyed by the Entra UPN (see `provisionUser`), so an ownership check reads the
token's e-mail, lowercased to match the stored id. `request.auth.uid` identifies the Firebase
account — a different key, and not a lookup key here.

```
function upn() {
  return isSignedIn() && request.auth.token.email != null
    ? request.auth.token.email.lower()
    : '';
}
```

The role claim is checked before the record, so the common case costs no document read; the
fallback covers the first login, where the session cookie predates the claim.

## Least privilege: grant a read when a view needs it, not before

A read no view performs is surface for nothing. Teacher reads of `studentMasterData` are not
granted, for instance, because US-11 does not need them — the tickets that do (the assignment
dialog, the report) decide then whether to read live from the client or through a
teacher-guarded handler.

Bookkeeping collections stay invisible to every client at every role: `reservedNames` would let
one free a claimed name, `seedState` would let one resurrect a default a teacher deleted.

## Server-owned fields live in the schema, not in the rule

Fields a client must never set — `userId`, `seasonId`, `eventId`, `isIncomplete` — are kept off
the endpoint's input schema (`SERVER_OWNED` in `lib/schemas/student-master-data.ts`), which is
strict, so a request naming one is refused outright. There is no field-level rule condition,
because no client write reaches the rules at all.

## The trap: `resource` is null for a document that does not exist

An ownership rule such as `resource.data.userId == upn()` denies a `get` of a document that was
never created — there is no `resource` to test. Since "not registered yet" is where every
student starts, read such a record with a **query** instead: rules are evaluated per returned
document, so an empty result comes back as empty rather than as a refusal.

## Testing

Every change to allow/deny logic needs a case in `firestore-tests/*.rules.test.ts` proving both
an allowed and a denied path, run with `npm run test:rules` against the emulator. Cover the
missing-document case above whenever a rule reads `resource`.

Audit new rules with the `firebase-security-rules-auditor` skill before deploying.
