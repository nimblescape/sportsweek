<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Refactoring: Identity, Keys and Addresses

This document specifies one change to how a person is identified, keyed and admitted. It is
written as a companion to `spec/requirements.md`: the user stories below are numbered on from the
ones already there, and the section "Existing stories affected" says which of those this change
rewrites or narrows. Once the refactoring has landed the two documents are merged and this one is
deleted.

The user story numbers are stable, not positional. US-31 to US-35 are appended by number and
placed by topic when merged, exactly as US-17 and US-18 were.

## Why

Four things are wrong, and three of them have the same cause.

**A person's address is the primary key.** `users` and `registrations` are keyed by an e-mail
address. A key is a namespace, so the address travels wherever the key does: into URL path
segments, and from there into the Cloud Run request log, which records `httpRequest.requestUrl`
for every call and is readable by anyone holding `logging.viewer`. Deleting the document does not
remove those entries, so an erasure request cannot be satisfied by deleting the record.

**The key is mutable, so a rename forks a person.** When the directory changes an address,
`provisionUser` misses the existing document and writes a second one. The granted permissions
are lost, the earlier registrations are stranded under the old id, and nothing detects it. A
surname changes at a school every year.

**The code says UPN and means `email`.** Nothing reads `userPrincipalName`. Every read is the ID
token's `email` claim — `claims.email`, `user.email`, `request.auth.token.email` — and
`accountTypeFromUpn`, `isSchoolUpn` and `studentUpn` are all named after a field none of them
holds. In Entra the two are different attributes: the UPN is a sign-in identifier whose prefix
permits `' . - _ ! # ^ ~` and whose suffix need not be routable, while `mail` is the mailbox and
may be absent altogether.

The fix is to say `email`, not to start reading the UPN. Graph is consulted only when a sign-in
hands over an access token, and the fake login never does, so the UPN is not reliably there —
deriving the account type from it would give one security-relevant decision two sources and a
fallback between them. It stays the e-mail domain until the directory can be asked properly
(US-32). What the misnaming costs meanwhile is a reader who believes a guarantee the UPN would
give and the `email` claim does not: Microsoft documents that claim as mutable, non-unique and
unsuitable for authorization decisions, which is the case for the uid key below.

**Membership of the school is a string test standing in for a directory question.** `isSchoolUpn`
matches a domain because the tenant's convention makes that work. It is the correct stopgap while
the directory is not set up to answer properly, but it is shaped as a regex scattered through the
rules rather than as one question with one answer, so replacing it later means touching every rule.

## What changes, in one page

| Today                                                        | After                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `users/{email}`                                              | `users/{uid}` — the Firebase Auth uid, opaque and immutable                    |
| `eventSeries/{id}/registrations/{email}`                     | `eventSeries/{id}/registrations/{uid}`                                         |
| `registration.studentUpn`, holding a mail address            | `registration.studentUid`; the address stays as `email`, for reading           |
| A vocabulary that says UPN and holds an e-mail address       | It says `email`, which is what it has always held                              |
| The account type derives from a field named after the UPN    | From the e-mail domain, said plainly — until the directory can be asked        |
| `PATCH /api/users/{email}`                                   | `PATCH /api/users`, the subject named in the body                              |
| `DELETE /api/…/registrations/{email}`                        | `POST /api/…/registrations/delete`, the subject named in the body              |
| `upn()` derives identity **and** asserts membership          | `isSelf(uid)` derives identity; `isSchoolMember()` asserts membership          |
| Membership is a regex repeated through the rules             | The `accountType` claim provisioning already mints; the regex leaves the rules |
| The Entra tenant is optional and silently falls back         | Required; a build or sign-in without it fails rather than widening             |
| `users/{uid}` is writable by its owner, and nobody writes it | Closed, like every other path                                                  |
| The four data-reaching permissions are an undocumented reach | Named as a restricted circle the school's policy admits                        |

## The shape it moves to

```jsonc
// users/{uid} — the Firebase Auth uid. Opaque, immutable, and not a fact about the person.
{
  // The ID token's `email` claim, lower-cased. The account type derives from its domain and from
  // nothing else (US-3), so this one field is both what is shown and what decides — which is why
  // the directory question (US-32) is worth asking as soon as it can be.
  "email": "jane.doe@htldornbirn.at",
  "firstName": "Jane",
  "lastName": "Doe",
  "accountType": "teacher",
  "permissions": ["editRegistrations"],
  "photo": null,
}
```

```jsonc
// eventSeries/{eventSeriesId}/registrations/{uid}
{
  // The one reference the record keeps, and now the same value as its own id, so ownership is
  // still the document's own name and a read still needs no query (US-26).
  "studentUid": "kP3nQ…",
  // Copied from the record at every save and every login, for a reader that needs no join.
  "firstName": "Anna",
  "lastName": "Müller",
  "email": "anna.mueller@student.htldornbirn.at",
  // …the answers, unchanged
}
```

## New user stories

### US-31: A record is keyed by the account, not by the address

A user record and a registration are keyed by the Firebase Auth uid. The address is a field on
the record, never its name.

- The uid is stable across a directory rename, so changing a surname updates one record rather
  than creating a second.
- No personal data appears in a Firestore document path, and therefore none in an audit log's
  `resourceName`, in an export, or in an index entry.
- The address remains stored, shown and searched. This story moves the key, not the data.

### US-32: Membership of the school is one question, asked in one place

Whether a caller belongs to the school is decided by a single predicate, in the Security Rules
and in the application, and nothing else asks it.

- Today its body reads the `accountType` claim, which trusted server code mints only for an
  address it has already found to be the school's. The domain test itself lives in one place,
  `provisionUser`, and not in the rules at all.
- Replacing it with a directory answer — an Entra group, `employeeType`, or `/me/memberOf` —
  changes how `provisionUser` derives that claim, and nothing else. The account type (US-3) is
  decided by the same answer, so the two move together by construction.
- The Entra tenant is required. A configuration without one fails, because the provider's
  fallback admits every Microsoft tenant and every personal account.
- A guest of the directory is not a member, and reaches nothing — including the event series and
  the lists it carries.

### US-33: A person is never named in a URL

No request identifies a person in a path segment or a query parameter.

- A subject that is not the caller is named in the request body.
- A subject that is the caller is not named at all: it comes from the session.
- This holds for URLs the browser navigates to and for those it merely fetches, because both are
  recorded by the platform's request log.

### US-34: The permissions that reach personal data form a restricted circle

`editRegistrations`, `editAssignments`, `viewReports` and `editReports` each grant read of whole
registration documents, which carry health notes, a medication flag, an emergency contact,
a date of birth and body measurements.

- This is a property of Security Rules, which grant a document or none of it. It is not a
  consequence of any one screen, and the interface hiding a field does not narrow it.
- The interface's own reason for the split stands unchanged and is not an access control: the
  permissions exist so that a teacher is not offered controls that would let them change a
  registration or an assignment by accident.
- Therefore the school's policy decides the circle: everyone granted any of these four is a
  person the school permits to handle student personal data, including data in the special
  categories. Granting one of them is that decision being made.
- It is written down here so that it reads as a decision rather than as an accident of
  granularity, and so that whoever grants a permission knows what they are granting.

### US-35: Every write goes through the API

No client writes to Firestore. Every mutation is made by a Route Handler through the Admin SDK,
and every declarative write path is closed.

- The Security Rules deny `create`, `update` and `delete` on every collection, without exception.
- A path nothing writes is closed rather than left open, because an unused permission is surface
  with no test behind it.
- The reason is not caution but capability: the invariants these writes carry cannot be expressed
  declaratively. Rules can `get` a known path but cannot query, so "is this name taken", "is this
  item still in use" and "recompute `hasRegistrations` from what is left" are out of reach. A
  second, unchecked way in would make the transactional guarantees worthless.

## Existing stories affected

**US-1 (Login with Microsoft Entra ID)** keeps every source it reads: `givenName` and `surname`
from Graph, and the address from the ID token's `email` claim. What changes is the sentence
naming the record's id, which becomes the uid (US-31).

**US-3 (Account type assigned by Entra ID domain)** keeps its rule exactly — the domain of the
address decides, and nothing else does. What changes is that it stops calling that address a UPN,
and that the test is the current body of the membership predicate rather than a rule of its own
(US-32).

**US-2 and US-30 (permissions)** gain the restricted-circle statement (US-34). No permission
changes meaning and none is added or removed.

**US-16 (Fake login in the test environment)** keeps working unchanged in behaviour. It already
mints tokens for real Auth uids, so the key move costs it nothing. Its absence from a production
build stays proven by `npm run check:production-build`.

**US-26 (A registration carries the student's name)** keeps the denormalised name and address;
only `studentUpn` becomes `studentUid`.

## The audit this plan rests on

Recorded here because the slices below are shaped by it.

**Every Route Handler is guarded.** Eleven handlers; each calls `requirePermissionOrResponse`,
`requirePermissionIdentityOrResponse` or `requireStudentOrResponse` before doing work. The two
exceptions are `POST /api/session`, which is the sign-in itself and verifies the ID token, and
`DELETE /api/session`, which only clears a cookie. The fake-login route is closed twice over, by
`currentAuthMode()` and by an Entra teacher cookie.

**Why that is sound**, in the order the checks matter:

- The session is an httpOnly cookie the server minted from a verified ID token. The client cannot
  compose or edit one.
- Identity comes from the session, never from the request. A handler acting on the caller's own
  data takes no identifier, so there is nothing to point at somebody else.
- The edge proxy is optimistic by design — the Edge runtime cannot verify the cookie and knows
  nothing of permissions — so every handler checks again where the work happens.
- The permission is read from the record, not from the token, so a withdrawal takes effect on the
  next request rather than on the next token refresh.
- Which permission is needed is derived from the request rather than assumed: a body touching
  both an opening and a rename needs both permissions.
- Input is validated at the boundary by a strict schema in its non-throwing form; server-owned
  fields are absent from input schemas, so naming one is a refusal rather than a silent drop.
- A failure answers with a fixed sentence. Only validation detail, which describes the caller's
  own input, is returned.

**No client-side Firestore write exists.** There is no `setDoc`, `updateDoc`, `addDoc`,
`deleteDoc` or client `runTransaction` in `src/`. Every mutation is `adminDb` in a `server-only`
service.

**One rule contradicts that**, and is why US-35 is written down. `users/{uid}` lets its owner
update anything except two named fields:

```
allow update: if isSelf(uid)
  && !request.resource.data.diff(resource.data).affectedKeys()
       .hasAny(['accountType', 'permissions']);
```

That is a denylist of two names, so `firstName`, `lastName`, `email`, `photo` and any key the
schema has never heard of are all writable. Nothing in the application performs such a write —
there is no profile editor — but a rules test asserts the capability ("allows a user to update
their own remaining fields"), so closing it reverses a decision rather than correcting an
oversight.

**No reason was ever given for the grant**, and that is the point. The rule's comment argues only
the carve-out — that neither the account type nor the permissions are a person's to write — and
says nothing about why an update is allowed at all. The shape is the cause: `isSelf(uid) && !…`
states an exception, and hands over everything the exception does not name. Nobody decided that a
student may rewrite their own surname; it fell out of the sentence.

Nor is there a use case waiting for it. Every field on the record is written by `provisionUser`
from the directory at every login, so none of it is the person's to contribute. The grant is not
merely unused but incoherent: whatever is written through it is overwritten at the writer's next
sign-in, and its only durable effect is on somebody else's reading of it.

What it reaches is the teacher's copy of the roster. A registration does not carry the student's
name because they typed it: `identityOf` reads it off the user record on every save, and
`refreshRegistrations` copies it into every registration at every login (US-26). A student who
edits their own record and then saves their registration therefore puts the name and the address
of their choosing onto the master line of the report, the tags on the assignment board, and both
exports — including, if they choose, somebody else's.

A sign-in repairs it, because `provisionUser` rewrites the record from the directory before it
refreshes the registrations. But the student chooses when to sign in next, so the corrupted copy
stands until they do, and nothing anywhere notices meanwhile.

`photo` is the smaller half, and worth stating precisely rather than dramatically. `PHOTO_TYPES`
and `MAX_PHOTO_BYTES` are enforced in `graph.ts`, on the fetch — not by the schema, which is
`photo: z.string().nullish()`, and not by the rules. A client could store any string, up to
whatever a Firestore document holds. It is rendered only to its owner, so what it costs is a
bloated document rather than anything shown to a reader.

**Query parameters carry nothing sensitive.** Two exist. `next` on the sign-in route is a path,
and `safeDestination` already rejects a scheme, an authority and both `//` and `/\`. `equipment`
on the programs page carries a program name, which is master data. Neither needs to move.

**One ordering nit**: `PATCH /api/event-series/[eventSeriesId]` parses the body before
authenticating, because which permission it needs depends on what the body changes. An
unauthenticated caller therefore receives field-naming validation errors. Authenticating first,
then parsing, then checking the derived permission keeps the design and closes it.

## Sequencing

Each slice below leaves the application working, tested and deployable, and each is
red-green-refactor as usual. The gate is the one already written down — the unit tests, the lint,
the type check, the formatter, the licence check and the rules suite against the emulator, plus
the problems the editor reports on the files that changed.

Nothing is live, and every environment can be purged and reseeded, so the slicing is for
reviewability rather than continuity. Slice 4 is the only one that moves stored data; it ends with
`npm run seed:<environment>`.

Two ordering constraints are not negotiable. **Slice 1 is first** because it is the only finding
that is an active leak, and it is independent of everything else. **Slice 3 precedes slice 4** so
that the key change never has to move the membership question at the same time.

Slice 0 is documentation only and touches no code, so it can land on its own at any point.

### 0. The corrections nothing else owns

`spec/requirements.md` has drifted from the implementation in three different ways, and only one
of them is this slice's business. Separating them is what stops the same paragraph being rewritten
twice.

**Owned by `spec/refactoring-event-series.md`, and left alone.** Every sentence about a season,
an active season, activation and deactivation, master data as collections of its own, or
`studentMasterData` — US-4 nearly in full, the in-use preamble to US-5 through US-10, and the
scoping sentences of US-11, US-12 and US-13. That document already states what replaces each of
them, and its "Existing stories affected" section is the pointer. Rewriting them here would
duplicate the replacement text and make that section wrong.

**Owned by this document, and left alone.** US-1's "the user record's ID is the Entra ID user
principal name (UPN)" and the ERD's `PK id : string ' Entra ID UPN (US-1)`. Both are wrong twice
over — the value is the token's `email` claim rather than the UPN, and the key becomes the uid in
slice 4 — so both are corrected once, when slice 4 lands, and not before.

**Owned by nobody, and corrected in this slice.** Statements that no pending document mentions,
about features that shipped and then changed shape. Nothing will fix these on its own:

- The Drag and Drop section named "the assignment dialog's transfer lists (US-12)". There are no
  transfer lists. A student is dragged straight from any card to any other, and the two-step move
  and its buttons were dropped before US-12 shipped.
- US-12 and US-13 called the assignment board a "dialog", and US-12 called the page one while
  describing the page being put out of reach during a save. All of them are pages.
- Neither US-12 nor US-13 said which permission opens the page it describes, although US-2 has
  named the six since the permissions were split from the account type. `PAGE_PERMISSIONS` is
  where that lives, and the report's two are the pair that exclude each other.
- The nav item reads "Registrierungen" while the page it opens was headed "Übersicht". The page is
  named once: the heading says what the navigation item says. "Übersicht" is gone, and US-29 in
  `spec/refactoring-event-series.md` — which specified it and would have reintroduced it at
  consolidation — is corrected to match what shipped.

Two things that looked like divergences and are not, recorded so they are not "fixed" later:

- US-12's "the figures describe everything the card holds, so narrowing the list does not by
  itself change what the card says about itself" is **correct**. The filter alone does not
  recount; the "Gefiltert" toggle in the next bullet is what does, which is what "by itself"
  says. Both bullets describe the implementation.
- The per-class cards moving off the assignment page is not unowned. `US-29` introduces the page
  they moved to, so it belongs to `spec/refactoring-event-series.md` — whose "Existing stories
  affected" row for US-12 said "otherwise unchanged" and has been corrected to say so.

The standalone statistics page is not on either list: it is named nowhere in
`spec/requirements.md`, so its removal left nothing to correct.

### 1. No person in a URL

`PATCH /api/users/{upn}` becomes `PATCH /api/users` with the subject in a strict body.
`DELETE /api/…/registrations/{studentUpn}` becomes `POST /api/…/registrations/delete`, likewise.
The two call sites lose their `encodeURIComponent`. `handleServiceFailure` stops interpolating the
subject into its log context. `deleteRegistration`'s caller lower-cases, as the users route
already does. The event-series PATCH authenticates before it parses.

No stored data moves and no rule changes. US-33.

### 2. Say e-mail where it means e-mail

A rename, and nothing else: `accountTypeFromUpn` becomes `accountTypeFromEmail`, `isSchoolUpn`
becomes `isSchoolEmail`, `buildUpn` becomes `buildEmail`, and the comments and story text that
speak of a UPN say what the field holds. No source changes and no decision moves — the account
type still derives from the address's domain, which is all the tenant can be asked for today.

`registration.studentUpn` is left alone here, because slice 4 renames it to `studentUid` and
renaming it twice would be worse than late.

No stored data moves. US-32 in part.

### 3. Membership behind one function

`upn()` splits into an identity and `isSchoolMember()`, whose body is today's domain test and
whose comment names what will replace it. Every rule that reads `upn() != ''` reads the predicate
instead. `NEXT_PUBLIC_ENTRA_ID_TENANT_ID` becomes required, failing loudly.

The address `provisionUser` trusts becomes the one the identity provider asserted rather than the
mutable record field (Q4). `isSchoolMember()` reads the `accountType` claim that provisioning
already mints, so the rules stop testing the address and `isSchoolUpn` is deleted from them (Q6).
Identity still compares against the e-mail-keyed document id here; the address leaves the rules
altogether in slice 4.

The `users/{uid}` update rule is closed. Its test inverts from "allows a user to update their own
remaining fields" to a denial — a decision reversed rather than an oversight corrected, so it
lands visibly rather than folded into the rest.

Rules, their tests, `provisionUser` and the client provider factory. No stored data moves.
US-32, US-35.

### 4. uid as the key

`users/{uid}`, `eventSeries/{id}/registrations/{uid}`, `registration.studentUid`. The field
survives the move because `refreshRegistrations` needs something queryable across series (Q5);
its `fieldOverrides` entry in `firestore.indexes.json` is renamed with it and **deployed before
the code**, because the emulator does not enforce index requirements and a stale override fails
only in production. `requirePermission*` returns the uid, and every consumer of `userId` moves in
the same commit — the self-demotion guard in `grantPermissions` compares two of them, and both are
strings, so nothing would type-check a half-move. The seeding script creates the Auth accounts it
keys records by (Q3); the purge already removes them.

Purge and reseed. US-31.

### 5. One consolidation, for both refactorings

Two refactoring documents are outstanding against `spec/requirements.md`: this one, and
`spec/refactoring-event-series.md`, whose own last slice is the same merge. They are folded in
together, once, and both documents are deleted.

Once rather than twice, because merging the event series work first would produce a
`requirements.md` that this refactoring immediately contradicts — US-1 still saying the record's
id is the UPN, US-26 still naming `studentUpn` — so every affected story would be written and
reviewed twice.

What this pass folds in is the first two categories from slice 0: the event series document's
replacements for every season sentence, and this document's for US-1 and the ERD's primary key.
The third category is already done by then, which is the point of doing it separately — those
corrections have no landing date of their own and would otherwise wait on two refactorings that
have nothing to do with them.

`spec/database-erd.puml` is redrawn in the same pass rather than amended: the entities it shows
for master data, emergency contacts and equipment rental no longer exist, and one that has lost
its collections is not the same diagram with a few boxes deleted.

Until then the three documents disagree on purpose, and each refactoring's "Existing stories
affected" section is what says how.

## Questions, and what was decided

**Q1. A school account arriving without a usable address — answered.** If Entra supplies no
address, or one whose domain is neither `htldornbirn.at` nor `student.htldornbirn.at`, the login
is denied and no record is written. That is the specified behaviour rather than a gap, and US-3
already says so. Nothing to change; recorded so it is not later mistaken for a bug.

**Q2. `/join/{token}` keeps its token in the path — answered.** The token is a path segment, so
it reaches the request log. It stays there, because the alternative breaks the feature: a link is
a GET navigation, and a POST cannot be clicked out of a message or scanned from a QR code (US-23).

The exposure is bounded and mostly elsewhere. Following the link enrols the follower, who must
already be an authenticated school student, into one series and one class, and nothing more.
Redemption goes through `joinEventSeries`, which requires `isOpenToStudents`, so closing the
series invalidates every link and regenerating a class's link invalidates its predecessor. And
the link is deliberately broadcast to a whole class over channels the school does not control,
which is a far wider distribution than a log readable by the people who run the project.

The one shape that would keep it both a link and out of the log is the URL fragment, which is
never sent to the server. It was rejected: it makes `/join` a client page requiring JavaScript,
and the token would have to survive the Entra round trip in `sessionStorage` — added moving parts
in the one flow a student runs once, unattended, on a phone, with nobody to help when it fails.

**Q3. Bootstrap administrators — answered.** The seeding script creates the Auth accounts, so it
knows the uids it keys the records by. Purging already removes them: `purgeAuth` deletes every
Auth account alongside `purgeFirestore`, in every seedable environment. No `invitedTeachers`
collection is introduced.

**Q4. The address comes from the identity provider — answered.** `provisionUser` reads what the
provider asserted at sign-in rather than the mutable record field, so a client-side `updateEmail`
cannot move it. The exact source is `providerData`'s `microsoft.com` entry, to be confirmed
against a real token during slice 3 rather than assumed.

This does not reach the Security Rules on its own, and that is what Q6 answers: rules cannot read
`providerData`, only the token.

**Q5. `refreshRegistrations` keeps its queryable field — answered.** It finds a student's
registrations across event series whose ids it does not know, which needs a collection group
query, which needs the `fieldOverrides` index. Keying off the document id instead would not work:
a collection group query comparing on `documentId()` requires a full document path, and not
knowing the path is the reason for the query. So the field survives slice 4 as `studentUid`, its
index override is renamed with it, and the index is deployed before the code.

**Q6. The membership answer becomes a custom claim — answered, and Q4 is why.** A custom claim is
a value written only by the Admin SDK, carried in the ID token, and readable in rules as
`request.auth.token.<name>`; the account type already travels this way. Since rules cannot reach
`providerData` and see only the token, minting the verified answer as a claim in `provisionUser`
is the only way to honour Q4 on the declarative side — otherwise the rules go on trusting the very
field Q4 says not to trust.

`request.auth.token.email` is **not** such a claim, which is the point. It is a standard Firebase
claim, populated from the Auth user record's `email` field, and that field is writable by the
Admin SDK _and_ reachable from a client through `verifyBeforeUpdateEmail` — gated by a console
setting rather than by anything in this repository. A custom claim has no client write path at
all. The new claim therefore carries its own name rather than shadowing `email`, which Firebase
lists among the names a custom claims object must not use.

Two consequences to design around:

- **A claim reaches the rules only in a new token** — on sign-in, on refresh after expiry, or on a
  forced `getIdToken(true)`. The token a client holds when `provisionUser` sets the claim predates
  it, so the sign-in flow has to force a refresh once `/api/session` answers, and the rules need
  the first-login fallback `accountType` already has.
- **A custom token's claims outrank `setCustomUserClaims`.** The fake login mints one
  (`createCustomToken(uid, { given_name, family_name })`), so whatever it puts there wins for that
  session. It must either mint the membership claim itself or leave the name alone entirely; a
  half-set claim would make the test environment disagree with production about who is a member.

It also settles what happens to `isTrustedProvider()`. Its whole job is limiting who may assert an
address; once the rules read a claim our own server wrote, it is belt and braces rather than load
bearing. It is kept, and this sentence is the reason it is kept.

**Q7. Entra app registrations — answered.** Splitting production off from the non-production
environments is managed by the school's IT, outside this repository. Recorded here because the
consequence is ours to know: one registration today means the same client secret in all three
Firebase consoles, a scope added anywhere consented everywhere, and a rotation that is a
simultaneous three-environment outage. Staging cannot be dropped from the redirect URIs either
way, because impersonation requires a real Entra sign-in first (US-16).
