<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# A Class Names the Teachers Who Run It

A class stops being a bare name and becomes a record: a name, and the teachers responsible for
that class in this event series. That is master data and nothing else — being named there grants
nobody anything. What it does is narrow what those teachers are shown: wherever a page offers the
classes of a series, somebody responsible for some of them is offered those and not the rest.

This document is a companion to `spec/requirements.md`, `spec/refactoring-event-series.md` and
`spec/refactoring-per-event-categories.md`. The user story numbers are stable, not positional:
US-38 onwards are appended by number here and placed by topic when the four documents are merged.

No data migrates. Every environment is purged and reseeded, so a stored shape may change freely.

## Why

**A page that shows everything shows nothing in particular.** A teacher responsible for one class
opens Registrierungen and is handed every class of the series, then filters down to their own —
every time, on every page. Which classes are theirs is already known to the school; it is simply
not known to the application.

**Who looks after a class changes every year, and the class does not.** "2aWI" exists in the
Wintersportwoche and in the Sommersportwoche, and a different teacher looks after it in each.
Responsibility is therefore a fact about the class _in this series_, not about the class and not
about the teacher — which is why it is stored on the series' own class entry and nowhere else.

**Half the staff has not signed in yet.** A record is keyed by the Firebase uid (US-31), and
there is no uid until somebody arrives. A school setting up next winter's series in August has to
be able to say who runs "2aWI" before that person's first sign-in, so the assignment has to be
expressible against an invitation as well as against a record.

## What changes, in one page

| Today                                                 | After                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `classOptions` is a list of names                     | `classOptions` is a list of records: a name and the teachers responsible for it            |
| A class has no record page                            | A class opens onto one collection: the teachers responsible for it                         |
| Every page offers every class of the selected series  | It offers the classes its reader looks after, where they look after any                    |
| An invitation carries a name and a set of permissions | It also carries the classes waiting for its holder                                         |
| The rights page says what somebody may do             | It also says which classes they look after, read-only                                      |
| Which pages a teacher may open follows a permission   | Unchanged. An assignment opens nothing, and somebody holding no permission reaches nothing |

## The shape it moves to

Classes follow the move an event already made (US-34): the entry becomes a record, and the name
stays its identity.

```jsonc
// eventSeries/{eventSeriesId}
{
  "name": "Wintersportwoche 2026/2027",

  "classOptions": [
    // Empty is the normal state, and means the same as it does today: nobody is named, so nobody
    // is narrowed and every reader of this series is offered this class.
    { "name": "2aWI", "teacherUids": ["8f3c…", "a91b…"] },
    { "name": "2bWI", "teacherUids": [] },
  ],
}
```

```jsonc
// invitedTeachers/{email} — what waits for somebody who has never signed in
{
  "firstName": "Ada",
  "lastName": "Auer",
  "permissions": [],
  // Claimed once, at the first sign-in, and then gone with the rest of the invitation.
  "classAssignments": [{ "eventSeriesId": "0Kx…", "class": "2aWI" }],
}
```

That is the whole of it. Nothing is added to a registration, nothing is added to a user record,
and `firestore.rules` is not touched — for the reason set out two sections below.

## What an assignment changes, and what it does not

**Access is decided by the permissions, exactly as it is today.** `editRegistrations` opens
Registrierungen, `editAssignments` opens Zuteilungen, `viewReports` and `editReports` open
Berichte. An assignment opens nothing: somebody holding no permission reaches no page, whatever
classes they look after, and getting to a page is a question a class never answers.

**What an assignment does is narrow the page once it is open.** Where the reader looks after at
least one class of the selected series, all three pages offer those classes and no others — the
class filter tags, the cards, the students counted and the students listed.

| Holds the page's permission | Looks after a class in this series | What the page offers |
| --------------------------- | ---------------------------------- | -------------------- |
| yes                         | yes                                | their classes        |
| yes                         | no                                 | every class          |
| no                          | –                                  | nothing — no page    |

Three things the table does not spell out:

- **It is asked one series at a time.** Somebody who looks after a class in the Wintersportwoche
  and none in the Sommersportwoche is narrowed in the first and sees the second whole.
- **Looking after nothing narrows nothing.** A school that never assigns a class is unaffected by
  the whole feature, and the day this ships takes nothing away from anybody.
- **It is not a permission.** It is not granted on the rights page, it is not in `PERMISSIONS`,
  no permission implies it, and it implies no permission.

## It is a view, and only a view

The narrowing lives in the interface and nowhere else. **`firestore.rules` does not change.** A
holder of `editRegistrations`, `editAssignments`, `viewReports` or `editReports` goes on being
able to read every registration of the series through the SDK, whether they look after its class
or not.

That is accepted rather than overlooked, and it follows from US-34: granting any of those four is
already the school deciding that this person may handle student personal data — health notes, a
medication flag, an emergency contact, a date of birth, body measurements. Responsibility for a
class neither widens that circle nor is asked to narrow it. It decides what somebody is shown, so
that a page opens on their own class rather than on the whole school.

Two things follow, and both are worth stating where somebody will read them.

- **Nothing describes the narrowing as protection** — not a label, not a hint, not a comment. A
  view that is mistaken for a boundary is worse than no view at all, because somebody will
  eventually rely on it.
- **A rules-enforced version was drafted and dropped.** It needed a copy of each class's teachers
  on every registration, a second derived list on the series so that a rule could ask whether a
  caller looks after anything at all, a narrowed roster subscription, and an access-call budget to
  prove against a real deployment. All of that to restate a decision the permissions have already
  made.

## The class detail editor

A class becomes a record with one child collection, exactly as a program has one (US-33). Its
page is reached from the class list, at
`/app/event-series/{eventSeriesId}/classes?teachers=<class name>` — the class is named in a query
parameter for the reason a program is, and no teacher is named in the URL at all (US-33,
identity).

It is `editMasterData`, like every other master data page, which is uncontroversial precisely
because the assignment grants nothing: this is a page for recording who looks after what, not for
handing anything out.

The tag row above the list holds the one tag, "Lehrpersonen". Beneath it is not a list that can
be added to: the people already exist, and the page only says which of them look after this class.

- **A name field**, matching first name, surname and address, as the rights page and the report
  both do.
- **A "Zugewiesen" tag**, which narrows the row to the teachers this class already has.
- **One tag per candidate**, pressed for assigned and unpressed for not, using the application's
  one tag component. Pressing assigns, pressing a pressed one withdraws. That is the whole of the
  editor: there is no save button, because there is no second state to be in.
- Candidates are **every teacher and every pending invitation**, in one row, sorted surname first.
  The two lists are complementary by construction (below), so nobody appears twice.
- A tag shows the name; its accessible name carries the address as well, because two colleagues
  may share a surname and a class assignment is not a thing to get wrong.

## Invitations and records are complementary

An invitation exists only until its holder first signs in; a record exists only from then on.
Nothing is ever in both, and the editor above relies on it.

- `provisionUser` claims the invitation when it creates the record, and deletes it. That already
  happens; what is added is the claim of `classAssignments` — for each entry, the new uid joins
  that class's `teacherUids`.
- `scripts/invite-teacher.mts` already refuses to invite an address that holds a record.
- An assignment made against an invitation names the series and the class, because the same class
  name means a different class in a different series.

A pending assignment can be left pointing at nothing — the class is renamed, the class is deleted,
the whole series is deleted — and what happens then is Q4.

## The rights page says which classes somebody looks after

`Benutzerrechte` gains one line per teacher, beneath their permission tags: the event series and
class pairs they look after.

- It is **read-only**. No tag, no button, nothing to press — the assignments are edited on the
  class, which is where they are stored, and a second place to edit them would be a second answer
  to one question.
- The pairs are **separated by commas** and **wrap onto as many lines as they need**. A teacher
  looking after eight classes across three series is a long line, not a truncated one.
- Each pair names the series and the class, so the same class name in two series reads as the two
  different things it is.
- A teacher who looks after nothing shows **nothing at all** — no line, and no sentence saying so.

It is read from the event series documents, which every school member may already read, so this
needs no rule change and no new endpoint.

## What this does not change

- **`firestore.rules`.** Not one line. This is the point of the whole design, and it is what makes
  the feature one field and the views that read it.
- **The permissions.** Nothing is added to `PERMISSIONS`, no label changes, and the exclusivity
  rule between the two report permissions is untouched.
- **Which pages a teacher may open.** `reachablePages`, the navigation and the header's event
  series rows are all decided by permissions alone, exactly as today.
- **What a page can do.** A narrowed page carries the controls it always carried, for the classes
  it offers: handing out an invitation link, showing a QR code, deleting a registration, moving a
  student between events, saving a report.
- **Opening and closing a series to students.** It is a decision about the whole series and stays
  with `editRegistrations`, whoever looks after which class.
- **Saved reports.** A report is the school's, not its author's (US-13). One naming a class its
  reader does not look after opens with that tag dropped, exactly as a tag whose class has been
  renamed away already does. It is not an error and it is not rewritten.
- **Both exports**, which are built from what is on screen and so follow it without being told to.
- **The student's own view**, which was never about classes other than their own.

## User stories

### US-38: A class names the teachers who look after it

As a teacher maintaining master data, I record which of my colleagues look after each class of
this event series, so that the application knows what the staff room already knows.

**Acceptance criteria:**

- A class is a record: a name, and the teachers who look after it. The name remains its identity,
  and everything US-6 says about maintaining the list — uniqueness, the maximum count, the maximum
  length, the teacher's order — holds unchanged.
- It belongs to the class _of this series_. The same class name in another series carries its own
  assignment, and a new series copied from an old one (US-22) takes the classes and their
  assignments with it, as it takes every other list.
- **It grants nothing.** It is not a permission, it opens no page, and it is not checked by any
  Security Rule. What somebody may do stays entirely a matter of the permissions (US-2).
- A class's record page lists every teacher and every pending invitation as tags, pressed for
  assigned. Pressing assigns; pressing again withdraws.
- The row is narrowed by a name field, and by one tag that shows only the teachers already
  assigned.
- A teacher may look after any number of classes, and a class may be looked after by any number of
  teachers.
- Assigning somebody who has never signed in writes the assignment onto their invitation, to be
  claimed at their first sign-in (US-40).
- Removing a class removes its assignments with it, on the same terms as removing any list entry:
  refused while a registration still names that class.

### US-39: My pages open on the classes I look after

As a teacher who looks after a class, I find the pages I may open already narrowed to my own
classes, so that I start where my work is rather than filtering the whole school down to it every
time.

**Acceptance criteria:**

- Where the reader looks after at least one class of the selected series, Registrierungen,
  Zuteilungen and Berichte offer those classes and no others: the class filter tags, the cards,
  the figures and the students listed.
- Where they look after none of its classes, all three offer every class, exactly as today.
- It is asked per series, so the same person can be narrowed in one and not in another.
- The other filter categories are untouched. A narrowed teacher filtering by program filters their
  own students by program, because those are the students the page is showing.
- **The narrowing is a view and is never described as anything else.** The Security Rules are
  unchanged, and a holder of any of the four reading permissions can still read every registration
  of the series through the SDK.
- Withdrawing an assignment widens the pages again on the next read, in the way the lists behind
  every other tag row already update live.

### US-40: An invitation carries the classes waiting for its holder

As a teacher setting a series up before the school year starts, I record that a colleague who has
never signed in looks after a class, so that it is waiting for them rather than needing a second
visit once they arrive.

**Acceptance criteria:**

- An invitation carries the classes its holder looks after, each naming the event series it
  belongs to as well as the class.
- The assignments are claimed at the holder's first sign-in, together with the permissions the
  invitation carries, and the invitation is then deleted.
- Claiming adds the new uid to each named class, so their pages are narrowed from that first
  sign-in.
- An invitation and a user record never describe the same person: an address holding a record
  cannot be invited, and an invitation is deleted the moment a record is made from it.

### US-41: The rights page says which classes somebody looks after

As a teacher holding `editUsers`, I see which classes each colleague looks after alongside what
they may do, so that both halves of "who does what here" are on one page.

**Acceptance criteria:**

- Each teacher's row names the event series and class pairs they look after, beneath their
  permission tags.
- The list is **read-only**: no tag, no button, nothing to press. Assignments are edited on the
  class.
- The pairs are separated by commas and wrap onto as many lines as they need.
- Each pair names both the series and the class.
- A teacher who looks after nothing shows nothing at all — no line, and no sentence saying so.
- The list updates live, as the permissions already do.

## Open questions and inconsistencies

### Q1 — What a report permission alone sees, once class scoping exists — ANSWERED

**Narrowing applies only to somebody who looks after a class.** A holder of `viewReports` or
`editReports` who looks after none in this series is offered every class, as today; looking after
one is what narrows them to what they look after.

The alternative — a report permission grants the page and the classes decide the data — was
rejected: on the day it shipped nobody would be assigned anywhere, so every existing report reader
would open an empty report until an admin had gone through the classes one by one.

Superseded in part by Q2, which makes this a question about what a page offers rather than about
what anybody may read. The answer is unchanged; only its consequences shrank.

### Q2 — Does an assignment grant anything? — ANSWERED

**No. It is master data, and it implies no access right.** It says these teachers look after this
class, and nothing more. A teacher reaches Registrierungen by holding `editRegistrations`,
Zuteilungen by holding `editAssignments` and Berichte by holding a report permission — all granted
where they have always been granted, on the rights page.

What an assignment does is restrict the filters on those three pages to the classes it names. That
is all, and it is interface only.

**Accepted with it:** `firestore.rules` stays exactly as it is, so a holder of `editRegistrations`
can read every registration document of the series and not only those of the classes they look
after. The narrowing is a view, not a boundary.

This is what withdrew the whole enforcement design — `classTeacherUids` on the registration,
`assignedTeacherUids` on the series, the rule, the narrowed subscription, the access-call proof —
and with it the concern that `editMasterData` would become able to grant access to personal data.
It cannot: there is no access to grant.

### Q3 — Is the assignment page narrowed too? — ANSWERED

**Yes.** Registrierungen, Zuteilungen and Berichte are narrowed alike. Since the narrowing is a
view rather than a read boundary, the assignment board keeps every student it needs and simply
offers the classes its reader looks after.

### Q4 — A pending assignment can be left pointing at nothing

An invitation names a series and a class, and neither is guaranteed to be there when it is
claimed. Three cases, and each has a defensible answer:

- **The class is renamed.** The in-use guard refuses a rename while a registration names the
  class; a pending invitation is not a registration. Refuse the rename too, rewrite the pending
  assignments with it, or let the claim find nothing.
- **The class is removed.** Same three answers.
- **The series is deleted.** Deleting a series already takes its lists, reports, invitations and
  registrations with it. Pending assignments live in another collection entirely, so pruning them
  means a scan of `invitedTeachers` — or leaving them to be dropped when they are claimed.

Dropping silently on claim is the cheapest and never blocks an edit; refusing is consistent with
how the in-use rule already treats a name somebody depends on. **Undecided.**

### Q5 — "View" or "manage", for a teacher who looks after a class — WITHDRAWN

The question was what a class teacher holding no permission may do on the registrations page. Q2
removes the case: holding no permission, they do not reach the page at all. Somebody who does
reach it holds `editRegistrations` and carries every control it has always carried — the
invitation link, the QR code, deleting a registration — for the classes the page offers them.

### Q6 — A teacher's uid becomes readable by every school member

`teacherUids` sits on the event series document, which any signed-in member of the school may read
in full, students included — the same rule that lets a student see the lists they answer from. So
"which teacher looks after which class" becomes readable by students, as a uid.

A uid is opaque and cannot be resolved to a person without reading `users`, which a student may
not. The class teacher is not a secret from the class either. Recorded so that it reads as a
decision, not as an oversight.

### Q7 — The user story numbers already collide, twice

Not caused by this change, found while placing US-38:

- `spec/refactoring-identity.md` uses US-33, US-34 and US-35 for "A person is never named in a
  URL", "The permissions that reach personal data form a restricted circle" and "Every write goes
  through the API". `spec/refactoring-per-event-categories.md` uses the same three numbers for
  "Teacher maintains master data as a hierarchy", "An event carries master data of its own" and
  "A student is offered their event's lists". Both meanings are referenced from code comments
  under the same numbers, so a reader following one arrives at the other.
- The story that says which required equipment the school lends is US-37 in
  `spec/refactoring-per-event-categories.md` and is referenced as US-36 everywhere in the code.

US-38 onwards is free under every reading, so this change is unaffected. It needs settling when
the documents are merged, and until then a number is not enough to find a story by.

## Sequencing

Each slice is a pull request of its own, and each is green on the whole gate before the next
starts — tests, lint, types, formatting, licence headers, and the rules tests against the
emulator. Test-driven throughout: the failing test that states the new behaviour comes first.

**Q4 blocks slice 2.** Slices 1, 3 and 4 are unblocked; Q1, Q2, Q3 are answered and Q5 is
withdrawn. No slice touches `firestore.rules`.

| Slice | What lands                                                                                                                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | A class becomes a record. `classOptions` goes from `string[]` to objects with a name and an empty `teacherUids`. Nothing reads the new field yet. Purge and reseed.                                                         |
| **2** | The class record page and its editor: candidates from records and invitations alike, the name field, the "Zugewiesen" tag, and the write that assigns. `classAssignments` on an invitation, and the claim at first sign-in. |
| **3** | The narrowing: the classes offered by Registrierungen, Zuteilungen and Berichte follow what their reader looks after.                                                                                                       |
| **4** | The rights page shows the assignments, read-only.                                                                                                                                                                           |

`spec/database-erd.puml` is updated with slice 1. Environments are purged and reseeded after slice
1; the seeding script writes the new class shape in the same slice.
