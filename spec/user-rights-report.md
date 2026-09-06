<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# The Rights Page Says When Somebody Was Last Here, and Reports Itself

The application has recorded every sign-in since it had users to record: one document per arrival,
under the person it is about. Nothing has ever read them. An operator runs a script against the
database, and the page whose whole subject is who these people are and what they may do says
nothing about whether any of them has ever been here.

This document opens that record to exactly one reader — whoever hands out the permissions — and
gives the rights page the two things the master data pages already have: **the last few sign-ins
against each name**, and **a report of what is on screen**, built the same way the
Stammdatenbericht is built.

Companion to `spec/requirements.md` and `spec/class-teachers.md`. The user story numbers are
stable, not positional: US-47 onwards are appended by number here and placed by topic when the
documents are merged. US-30 (permissions) and US-41 are amended rather than replaced.

No data migrates and nothing is reseeded. The logins are already stored in the shape this needs.

## Why

**A permission nobody has ever used is not the same as a permission somebody uses daily**, and the
rights page cannot tell the two apart. Half the staff of a school is granted something in August
and a third of them never sign in; the page shows those two groups identically, so the question
"who did we set up and never hear from" is asked of a script, by whoever has database access, on a
laptop — instead of on the page that exists to answer questions about users.

**The record already exists and is already correct.** `users/{uid}/logins` is written by
`provisionUser` on every sign-in, in the school's own wall clock with the offset it was recorded
in. This is not new data collection. It is a read.

**The rights page is the only master data page with no report.** Every other collection a teacher
maintains can be expanded onto the screen as a tree and read as a whole — programmes with their
equipment, classes with their teachers. The staff list, which is the one an administrator most
often has to show somebody else, cannot.

## What changes, in one page

| Today                                                             | After                                                                                  |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `users/{uid}/logins` is closed to every client, in both direction | `editUsers` reads it; it stays closed to writes and to every other permission          |
| Nothing in the application reads a login                          | The rights page reads the last three against each name                                 |
| The rights page filters by name and by permission                 | It also filters by whether somebody has ever been here                                 |
| A filter tag is one alternative among the row's                   | The two login tags are one question with two sides, so pressing one releases the other |
| The rights page has no report                                     | It has one, built like the Stammdatenbericht and reached the same way                  |
| A report shows everything the page holds                          | The rights report shows what the filter is showing, and says so                        |
| Only a script formats a login for a human                         | One formatter, beside the one that writes them, used by the script and the page        |

## Where the logins already are

`users/{uid}/logins/{loginId}`, one document per sign-in, holding a single field named by
`LOGIN_TIME_FIELD` in [`src/lib/auth/login-time.ts`](../src/lib/auth/login-time.ts):

```text
users/AbC123.../logins/x7Kq...   { at: "2026-09-06T14:30:45+02:00" }
```

The value is an ISO 8601 string carrying the offset it was recorded in, not a Firestore
`Timestamp` — deliberately, so that the school's wall clock is part of the value rather than
something a reader has to reconstruct. `provisionUser` appends one only once the sign-in is a
sign-in: a refusal returns before the write.

Ordering is `orderBy(LOGIN_TIME_FIELD, "desc")` on a string. It sorts correctly because the
value is fixed-width and starts with the date, and the offset it ends with can only disagree
within the hour a daylight-saving change moves. The script has ordered them this way since they
were introduced; nothing here changes it. See Q7.

## What opens them

One rule, and one only:

```firestore
match /users/{uid}/logins/{loginId} {
  allow read: if may('editUsers');
  allow write: if false;
}
```

Three things are being said, and each earns a test that proves the denial rather than the success:

- **`editUsers` and nothing else.** Not `editMasterData`, not `viewReports`, not the four
  permissions that form the restricted circle of US-34 (identity) — when somebody was last here is
  not personal data a report is about, it is an administrator's question about an account.
- **Not even the person it is about.** `isSelf(uid)` opens the user record above and does not open
  this. A student has no reason to audit their own arrivals, and a teacher without `editUsers` has
  none either.
- **Written by nobody.** It is the Admin SDK's, through `provisionUser`, as it already is. A
  client that could append one could forge an arrival.

This is a path match, so it does not answer a collection group query. Reading the logins of every
teacher at once would need `match /{path=**}/logins/{loginId}`, which is a different and wider
grant — and is not made. Every read here names one teacher's subcollection.

`firestore.rules` is touched by this document. The debt recorded under "Two layers, two rules" in
`spec/class-teachers.md` is not paid off by it; this is one rule, tested on its own.

## The view gains a line

Under the permission tags and the class assignments, a third line: the last three sign-ins,
newest first, formatted as the school reads a date.

- **Three, not ten.** The script's ten is for looking for a pattern; three answers "recently, or
  never" at a glance and does not push the next teacher off the screen. The two numbers are
  different because the two readers are.
- **Read once, not live.** The rights page subscribes to `users` because a permission changes
  while somebody is looking at it. A sign-in does not — it happens in another browser, and a
  page that redrew for it would be showing motion nobody asked about. One query per teacher on
  mount, `limit(3)`.
- **Formatted in one place.** `login-time.ts` already owns the shape a login is written in; it
  gains the function that renders one for a person to read, and `scripts/show-logins.mts` stops
  carrying its own copy of that decision.
- **A teacher with none says so**, in the same muted line, rather than the line vanishing — an
  absent line reads as "not loaded yet", and this is a fact.

## The report

The Stammdatenbericht's shape exactly: a `ReportSection` tree of headings and bullets, rendered
read-only on the page, reached by a toggle in the breadcrumb's actions. Not a download — it
answers "what does this look like as a whole", which is a question asked while working rather
than one taken away. See Q5.

One section per teacher, in the order the list is already sorted in:

```text
Maria Muster
  maria.muster@…
  Rechte
    Registrierungen
    Zuteilungen
  Klassen
    Wintersportwoche 2026: 2aWI
  Letzte Anmeldungen
    Fr., 06.09.2026, 14:30:45
    Do., 05.09.2026, 07:52:10
```

- A teacher is named first name first, as US-46 names one, and the address is the section's own
  first bullet rather than a heading of its own.
- An empty child section is its heading with no bullets, exactly as a class nobody looks after is
  reported under US-46 — not a "Keine Einträge." line. One rule, already established.
- The tree is a pure function handed what is on screen. It fetches nothing, so it is testable
  without a database and cannot disagree with the page above it.

### The report is what the filter is showing

The report is built from the filtered list, not from every teacher. It is the same page seen
whole, so a report of everybody while the page shows four would be a second answer to a question
already asked — and the reason to open the report is usually to show somebody the four.

Where the filter is narrowing, the report says what it is narrowing by, above the first section,
in the way the student report states its provenance. A report handed to somebody else is otherwise
a list with no statement of what it is a list of.

## The filter gains a question

A second row, under the permission tags, with two tags: has signed in, and never has. They are
one question with two sides, so **pressing one releases the other** rather than both being held.

The two rows narrow together — a category nobody selected in restricts nothing, and the ones
selected in are met at once — which is the rule the student filter already states for its
categories (US-12). Within the new row, mutual exclusion is not a rule the code enforces after the
fact but the shape of the field itself: one value, or none.

```ts
export const LOGIN_FILTER_VALUES = { some: "some", none: "none" } as const;
// on TeacherFilter:
logins: LoginFilterValue | null;
```

Holding both would mean "everybody", which is what holding neither already means — so a state that
says nothing twice is simply not representable. "Alle" clears this row with the other.

## User stories

### US-47: The rights page says when somebody was last here

As an administrator handing out permissions, I see the last few sign-ins beside each name, so that
I can tell an account somebody uses from one that was set up and never touched.

**Acceptance criteria:**

- The three most recent sign-ins are shown against each teacher, newest first, in the school's own
  wall clock and in the format the school reads a date in.
- A teacher with no recorded sign-in is said to have none, in that same place; the line is never
  simply absent.
- The sign-ins are read once when the page opens. A sign-in elsewhere does not redraw the page.
- Only somebody holding `editUsers` can read them, and the security rules refuse every other
  reader — including the person the record is about, and including every other permission.
- Nothing may write one from a client. They are `provisionUser`'s, through the Admin SDK.
- A teacher whose logins cannot be read is shown with their permissions as before; the page does
  not fail over a line that is an aside.

### US-48: I can narrow the rights page to who has been here and who has not

As an administrator, I can ask the rights page for everybody who has signed in, or for everybody
who never has, so that finding the accounts nobody ever claimed does not mean reading the list.

**Acceptance criteria:**

- Two tags in a row of their own: one for teachers with at least one recorded sign-in, one for
  teachers with none.
- The two are mutually exclusive. Pressing one releases the other, and neither can be held with
  the other.
- The row narrows together with the permission row: a name is shown when it answers both, and a
  row nothing is pressed in restricts nothing.
- "Alle" releases this row along with the permission tags, and leaves the name field alone, as it
  already does.
- The empty result reads with the hint the page already shows when a filter matches nobody.

### US-49: The rights page has a report of its own

As an administrator, I can expand the rights page into a report and read the staff, their
permissions, their classes and their last sign-ins as one document, so that what I have to show
somebody else is on one screen instead of spread across a list of cards.

**Acceptance criteria:**

- The report is reached by a toggle in the breadcrumb, and takes the place of what is beneath it,
  exactly as the Stammdatenbericht does.
- One section per teacher, in the order the list is sorted in, naming them first name first, with
  the address as the section's first bullet.
- Three child sections: the permissions held, the classes looked after, and the last sign-ins.
- A child section with nothing in it is its heading and no bullets, never a "Keine Einträge." line.
- The report covers exactly the teachers the filter is showing, and states what it was narrowed by
  where it was narrowed at all.
- The report tree is a pure function of what is on screen, and fetches nothing.
- It is shown on the page only. There is no PDF and no spreadsheet.

## Questions and inconsistencies, all settled

### Q1 — Why not keep the last three on the user record? — ANSWERED

Because the record is already read live by the rights page, a `lastLogins` array on it would cost
no query at all. It is refused anyway: the logins are the fact, and an array beside them is a
second copy of it that will disagree the first time a write fails halfway. The subcollection is
also what an operator's script reads, and there would then be two answers to "when was this person
last here", differing by whichever writes the school did not notice failing.

The cost is one query per teacher shown. Accepted: the page is `editUsers`-only, a staff list is a
school's rather than a country's, and three documents is the smallest read Firestore does.

### Q2 — Does the report get PDF and Excel exports, as the student report does? — ANSWERED

No. It is modelled on the Stammdatenbericht, which is on the page and read while working, not on
the student report, which is carried to a bus company. The two export builders in
`src/lib/report/` are shaped around a student's answers and would have to be generalised to produce
this; nothing asks for that yet, and doing it before something does would be scaffolding with no
reader.

### Q3 — Can "never signed in" ever match anybody? — ANSWERED, and it is a finding

Barely, today. A user record is created by `provisionUser` on a first sign-in, and the login is
appended in the same call — so every record the rights page can show has at least one login. The
tag matches only records written before the login recording existed, and an invited teacher who
has never arrived has no record at all, so they are not on the page to be found.

It is still worth having, for two reasons. The first is that it is the half of the question that
makes the other half mean something: "has signed in" reads as a real restriction only once its
opposite is expressible. The second is that the set is not empty in a database that has been
running longer than the feature, which is the database the school actually has.

What it does **not** do is answer "who have we invited and never heard from". That question is
about `invitedTeachers`, which the rights page does not show at all, and it is not asked here.

### Q4 — Why is this pair mutually exclusive when the student filter's two-sided questions are not? — ANSWERED

The student filter lets both sides of a two-sided question be held because its tags are stored as a
list per category and holding both is the same as holding neither — harmless, and cheaper to allow
than to forbid.

Here the field holds one value or null, so holding both is not expressible. That is the stricter
choice and it is taken deliberately: this row has exactly two tags, so a state that means the same
as the empty state is not a harmless redundancy but a second way to say one thing, sitting next to
an "Alle" tag that already says it.

No consistency is broken by this, because the student filter is a different module with a different
shape. Neither reads the other.

### Q5 — Where does the report's provenance line come from? — ANSWERED

From the filter, described in the words the tags themselves use — the permission labels from
`PERMISSION_LABELS`, and the two login tags' own labels. Not re-worded for the report: a tag and
the report's account of it are one sentence, and two spellings of it would drift.

Where nothing is pressed and the name field is empty, there is no line. A report of everybody has
nothing to say about itself.

### Q6 — Does the rights page still work for somebody whose logins cannot be read? — ANSWERED

Yes, and this is stated as an acceptance criterion because it is the failure mode that matters. The
logins are an aside on a page whose subject is permissions; a rule refusal, a network failure or a
record with none must all leave the page showing what it showed before. The line says what it can
and the rest of the card is untouched.

### Q7 — Is ordering a string by `orderBy` safe, given the offset it carries? — ANSWERED

Yes, for this purpose. The value is fixed-width and date-first, so lexical order is chronological
except across a daylight-saving change, where two instants within the same hour can order wrongly
against each other. Three sign-ins on a school day are not that hour, and the script has read them
this way since they were first written.

Changing the stored shape to a `Timestamp` would fix a case nobody has and would lose the school's
wall clock, which is the reason the string was chosen. Left as it is, and recorded here so that the
next reader finds the reasoning rather than the surprise.

## Sequencing

Each slice is a pull request of its own, and each is green on the whole gate before the next
starts — tests, lint, types, formatting, licence headers, and the rules tests against the emulator.
Test-driven throughout: the failing test that states the new behaviour comes first.

**No question blocks any slice.** Q1 to Q7 are answered.

| Slice | What lands                                                                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | The rule: `users/{uid}/logins` is readable by `editUsers` and by nobody else, and writable by nobody. Rules tests prove each denial — every other permission, the person it is about, and every write. No UI moves. |
| **2** | The formatter moves into `login-time.ts` and the script reads it from there. Nothing else changes; the script's ten stays its own.                                                                                  |
| **3** | The view reads the last three against each name, once per teacher, and says so where there are none. A refusal or a failure leaves the rest of the card intact (US-47).                                             |
| **4** | The filter gains the row: one field holding one of two values or null, cleared by "Alle", narrowing together with the permission row (US-48).                                                                       |
| **5** | The report: a pure tree from what the filter is showing, a toggle in the breadcrumb, the provenance line where the filter narrows (US-49).                                                                          |

Slice 1 stands alone and could land at any time; it is first because everything after it is a read
that the rule has to permit. Slice 2 is separate from slice 3 so that moving a decision and using
it in a new place are two diffs rather than one. Slice 5 is last because the report is built from
what slices 3 and 4 put on the page: it has no data of its own and no filter of its own.
