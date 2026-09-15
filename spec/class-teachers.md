<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# A Class Names the Teachers Who Look After It

A class stops being a bare name and becomes a record: a name, and the teachers responsible for
that class in this event series. Being named there grants no permission — what somebody may do is
still decided entirely on the rights page. What it does is bound their work to their own classes:
wherever a page offers the classes of a series, somebody responsible for some of them is offered
those and not the rest; the header offers them only the series they look after a class in; and
opening or closing registration acts on their own classes and on no others.

That last part forces a second change, which is half of this document: **"open to students" stops
being one flag on the event series and becomes a fact about a single class** — and the fact is the
invitation link itself. See "What 'open' means".

This document is a companion to `spec/requirements.md`, `spec/refactoring-event-series.md` and
`spec/refactoring-per-event-categories.md`. The user story numbers are stable, not positional:
US-38 onwards are appended by number here and placed by topic when the four documents are merged.
US-19, US-23 and US-29 are amended rather than replaced; what changes in each is set out below.

US-33 and US-34 already mean two different things across those documents, so every reference to
either names the document it comes from — **US-33 (identity)** against **US-33 (per-event
categories)**. See Q7.

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

**Half the staff has not signed in yet.** A record is keyed by the Firebase uid (US-31,
identity), and there is no uid until somebody arrives — so a colleague who has never signed in
cannot be named in the application at all. A school setting next winter's series up in August can
still name them, through the same provisioning script that invites them, and the first sign-in
applies what was left there.

## What changes, in one page

| Today                                                     | After                                                                             |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `classOptions` is a list of names                         | `classOptions` is a list of records: a name, its teachers, and whether it is open |
| A class has no record page                                | A class opens onto one collection: the teachers responsible for it                |
| Every page offers every class of the selected series      | It offers the classes its reader looks after, where they look after any           |
| The header offers every unarchived series                 | It offers the series its reader looks after a class in, where they look after any |
| An invitation carries a name and a set of permissions     | It may also carry classes, left there by the provisioning script                  |
| The rights page says what somebody may do                 | It also says which classes they look after, read-only                             |
| The Stammdatenbericht lists a class as a bare name        | It expands the class onto the teachers who look after it, as it does a programme  |
| A permission alone decides which pages a teacher may open | A permission still decides _which_ pages; an assignment decides _which series'_   |
| One flag opens a whole event series to students           | A class is open on its own, and closing one keeps its invitation link             |
| A link dies whenever the series is closed                 | A link is a stable address, replaced only by a teacher deliberately replacing it  |
| Assigning is refused while the series is open             | It is refused for a student whose own class is open                               |

## The shape it moves to

Classes follow the move an event already made (US-34, per-event categories): the entry becomes a
record, and the name stays its identity.

```jsonc
// eventSeries/{eventSeriesId}
{
  "name": "Wintersportwoche 2026/2027",

  // Gone: the series-wide `isOpenToStudents`. Whether students may write is a fact about a class
  // now, and the series' own answer is derived from its classes wherever one is still needed.
  "classOptions": [
    // An empty `teacherUids` is the normal state, and means the same as it does today: nobody is
    // named, so nobody is narrowed and every reader of this series is offered this class.
    //
    // `isOpenToStudents` is the window, and it is a decision a teacher makes. The address it
    // implies — the class's invitation link — is stable across any number of windows and lives in
    // `invitations`, out of reach of the students who can read this document (Q9).
    { "name": "2aWI", "teacherUids": ["8f3c…", "a91b…"], "isOpenToStudents": true },
    { "name": "2bWI", "teacherUids": [], "isOpenToStudents": false },
  ],
}
```

```jsonc
// invitations/{token} — one per class, stable, and readable and writable by no client at all.
// Kept whole through a close, and replaced only by a teacher deliberately replacing it.
{ "eventSeriesId": "0Kx…", "class": "2aWI" }
```

```jsonc
// invitedTeachers/{email} — provisioning only, written by the admin scripts through the Admin SDK
{
  "firstName": "Ada",
  "lastName": "Auer",
  "permissions": [],
  // Left here by the same script that leaves the invitation. No page and no handler reads or
  // writes this document; provisionUser claims it once, at the first sign-in, and deletes it.
  "classAssignments": [{ "eventSeriesId": "0Kx…", "class": "2aWI" }],
}
```

That is the whole of it. Nothing is added to a registration, nothing is added to a user record,
and `firestore.rules` is not touched — for the reason set out two sections below.

## What an assignment changes, and what it does not

**Which _kind_ of page somebody may open is decided by the permissions, exactly as it is today.**
`editRegistrations` opens Registrierungen, `editAssignments` opens Zuteilungen, `viewReports` and
`editReports` open Berichte. An assignment grants none of them: somebody holding no permission
reaches no page, whatever classes they look after, and no assignment adds a page to their
navigation.

**What an assignment does is bound where those permissions reach and what they act on.** Three
things follow from looking after at least one class anywhere:

1. **The header offers only the series they look after a class in.** The other series are absent
   from the tag row, not shown and refused.
2. **Those other series' pages refuse them.** Reaching one by its URL is answered the way an
   unavailable series already is, so the tag row is not the only thing standing in the way.
3. **Within a series they are scoped to, the three pages offer their own classes** — the class
   filter tags, the cards, the students counted and the students listed — and opening or closing
   registration acts on their own classes and on no others.

| Holds the page's permission | Looks after a class anywhere | Looks after a class in _this_ series | What they get                       |
| --------------------------- | ---------------------------- | ------------------------------------ | ----------------------------------- |
| yes                         | no                           | –                                    | every series, every class           |
| yes                         | yes                          | yes                                  | this series, their classes          |
| yes                         | yes                          | no                                   | nothing — the series is not offered |
| no                          | –                            | –                                    | nothing — no page                   |

Three things the table does not spell out:

- **Two different questions are asked, and the first is asked across the whole school.** Whether
  somebody is scoped at all is asked of every series together; which classes they get is then
  asked of the selected one. Somebody who looks after a class in the Wintersportwoche and none in
  the Sommersportwoche does not see the Sommersportwoche whole — they do not see it at all.
- **Looking after nothing narrows nothing.** A school that never assigns a class is unaffected by
  the whole feature, and the day this ships takes nothing away from anybody. It runs the other way
  too: removing the last class somebody looks after anywhere widens them back to every series
  rather than leaving them with none. That is the safe direction, and it is the direction that
  cannot lock the last teacher out of a series by an editing mistake.
- **It is not a permission.** It is not granted on the rights page, it is not in `PERMISSIONS`,
  no permission implies it, and it implies no permission. What it does is bound a permission the
  school has already granted; it can never widen one.

## Two layers, two rules

There are two ways into the data, and each has its own rule. Neither is a weaker version of the
other; they answer different questions.

**Reads go through the client SDK, and the permissions govern them — exactly as they already do.**
`firestore.rules` does not change. A holder of `editRegistrations`, `editAssignments`,
`viewReports` or `editReports` can read every registration of every series, whether they look
after its class or not. That is the scheme the application already has, and class scoping is not
asked to restate it in a language that cannot import the code that decides it.

**Everything that goes through the API is guarded by the access rules the interface shows.**
Whatever a scoped teacher cannot reach on screen, a handler refuses to do for them:

- **A page is refused where the tag row would not have offered it.** A series the teacher is not
  scoped to is absent from the header _and_ its pages do not open, decided in the server component
  that renders them, so a URL typed by hand is not the hole in the tag row.
- **A write is refused where the interface would not have offered the control.** Opening or
  closing a class, and every other act a scoped page carries, is re-checked against the caller's
  own classes before anything is written. A request naming a class outside them is refused, not
  quietly narrowed — the interface never being able to send one is not the reason it cannot
  arrive.
- **One module decides both.** The page guard and the handler ask the same function the header
  asks, so the screen and the server can never disagree about what somebody is scoped to.

The two layers therefore do not line up exactly: a scoped teacher can still _read_ a series whose
pages will not open for them. That is accepted, and it costs nothing that was not already spent —
scoping only ever subtracts from a permission the school has already granted, so everything it
keeps somebody away from is something the same person could reach a moment before their first
class was assigned.

**Where it does line up is later, and by a different route.** Reads move behind handlers, as the
invitations and the staff directory already are; the rules then deny those collections outright
and have nothing about the scope to say. That is its own refactoring, deliberately not this one:
the Security Rules are the last place to start pushing a rule that is still settling.

It follows from US-34 (identity): granting any of those four permissions is already the school
deciding that this person may handle student personal data — health notes, a medication flag, an
emergency contact, a date of birth, body measurements. Responsibility for a class neither widens
that circle nor is asked to narrow it. What it decides is where somebody's work starts, so that
their pages open on their own classes rather than on the whole school.

Two things follow, and both are worth stating where somebody will read them.

- **Nothing describes the read narrowing as protection** — not a label, not a hint, not a comment.
  A view that is mistaken for a boundary is worse than no view at all, because somebody will
  eventually rely on it. A refusal from a handler may be described as exactly what it is.
- **A rules-enforced version was drafted and dropped.** It needed a copy of each class's teachers
  on every registration, a second derived list on the series so that a rule could ask whether a
  caller looks after anything at all, a narrowed roster subscription, and an access-call budget to
  prove against a real deployment. All of that to restate a decision the permissions have already
  made, in the one place that cannot import it.

### Recorded debt: reads are wider than the interface

Written down here so that it is a decision on record rather than something a later reader
discovers and mistakes for an oversight.

**The debt.** Everything a teacher may read, they may read in full. The client SDK subscribes
directly to `eventSeries` and to `eventSeries/{id}/registrations`, and the rules governing both
ask only for a permission. So a scoped teacher's browser can read a series they are not scoped
to, and a report reader's can read a class they do not look after — while the interface built on
those subscriptions shows neither.

**It is not this feature's debt.** Class scoping only made it visible. The same shape is already
there wherever a rule grants a whole document to everyone it grants it to:

- The event series document carries seven maintained lists, and a student reads all of them
  because their form is built from one.
- The registrations subcollection is granted whole to four permissions, so `viewReports` reads
  the health notes and the emergency contacts along with the figures it came for.
- The staff directory had to be answered by a handler for precisely this reason (Q6), and the
  invitation tokens are readable by nobody at all for it.

**What it would take to pay.** The reads move behind handlers, which is where the two that had
this problem already went. A handler can answer a projection — the fields this page needs, for
the classes this caller looks after — which a rule cannot, because a rule grants a document or
nothing. The Security Rules then get simpler rather than harder: the collections they govern go
to `allow read: if false`, and there is no scope left for them to restate.

**Why not now.** It is a larger change than this feature, it touches every live subscription in
the application, and it wants the scoping rule to have settled first. Pushing a rule into the
Security Rules while it is still moving is the expensive order to do it in.

**What holds until then.** Scoping only ever subtracts from a permission the school has already
granted, so nothing here is an escalation — an unscoped read is the state every teacher was in
before their first class was assigned. And no label, hint or comment describes the narrowing as
protection, so nothing in the application invites somebody to rely on it.

## The class detail editor

A class becomes a record with one child collection, exactly as a program has one (US-33, per-event
categories). Its page is reached from the class list, at
`/app/event-series/{eventSeriesId}/classes?teachers=<class name>` — the class is named in a query
parameter for the reason a program is, and no teacher is named in the URL at all (US-33,
identity).

It is `editMasterData`, like every other master data page. That is uncontroversial for the
assignment itself, which grants nothing — but it does mean a holder of `editMasterData` comes to
read the staff's names, which is what the section after this one is about.

The tag row above the list holds the one tag, "Lehrpersonen". Beneath it is not a list that can
be added to: the people already exist, and the page only says which of them look after this class.

- **A name field**, matching first name, surname and address, as the rights page and the report
  both do.
- **A "Zugewiesen" tag**, which narrows the row to the teachers this class already has.
- **One tag per candidate**, pressed for assigned and unpressed for not, using the application's
  one tag component. Pressing assigns, pressing a pressed one withdraws. That is the whole of the
  editor: there is no save button, because there is no second state to be in.
- Candidates are **every teacher who holds a record**, sorted surname first — which is everybody
  who has signed in at least once.
- A tag shows the name; its accessible name carries the address as well, because two colleagues
  may share a surname and a class assignment is not a thing to get wrong.

## What the editor needs, and what it must never touch

Naming people who are not the caller is the one thing this editor needs that it does not have
today. Everything else about it is a matter of what it must be unable to do.

- **It reads `users`, through a handler.** `users` is readable today by its owner and by a holder
  of `editUsers` (US-2), and a rule grants a whole document — so opening it to `editMasterData`
  would hand over the staff's permissions along with their names. A handler answers instead, with
  a uid, a first name, a surname and an address per person, and nothing else: no permissions, no
  photo, no sign-in history. `firestore.rules` is not touched.
- **That is a widening, and it is accepted.** Enumerating the staff was `editUsers`' alone; it is
  now also `editMasterData`'s, for names and school addresses. It is the staff directory shown to
  staff, and it is exactly what the tags are — but it is a change, so it is written down as one
  rather than arriving with the feature.
- **It never writes a user record.** Nothing about a person changes when a class is assigned. The
  uids are stored on the event series, beside the class they belong to; a user record holds no
  classes and gains no field.
- **It never reads or writes an invitation.** `invitedTeachers` stays closed to every client in
  both directions, exactly as it is today, and no handler opens it either. Its candidates are the
  people who hold a record, and nobody else.

The one write this editor makes is to `classOptions` on one event series document, naming a series,
a class and a uid. That is the whole of its reach.

### Two consequences, both accepted

**A teacher has to have signed in at least once before they can be assigned.** Until then there is
no record, so there is no uid to store and nothing for the editor to offer — the person simply
does not appear in the dialog. It is not an error state and it says nothing on screen: somebody
who has never been here is not a teacher this application knows about.

**Somebody can be made a class's teacher by provisioning instead.** The script that leaves the
invitation can leave the class assignments with it (US-40), and the first sign-in applies them.
Two ways in for one fact, then, which is the compromise being accepted — and it is bearable
because the second is not an application path at all: it needs the Admin SDK and it happens before
anybody has arrived, so the two can never race and the dialog never has to explain the other.

## An invitation may arrive already carrying classes

An invitation is provisioning. It is written by `scripts/invite-teacher.mts` and by the seeding
script through the Admin SDK, and read by `provisionUser` at a first sign-in. No page reads one,
no handler writes one, and `firestore.rules` denies both to every client. **None of that changes.**

What is added is that those scripts may leave class assignments alongside the permissions, each
naming an event series as well as a class — the same class name means a different class in a
different series.

- `provisionUser` already claims the invitation when it creates the record, and deletes it. It now
  also applies the assignments: for each entry, the new uid joins that class's `teacherUids`.
- An entry whose series or class is no longer there is skipped, silently and one at a time (Q4),
  so renaming a class, removing one and deleting a whole series each stay decided on their own
  terms.
- An invitation and a user record never describe the same person: an address holding a record
  cannot be invited, and an invitation is deleted the moment a record is made from it. That is
  what makes the editor's candidate list complete without it ever naming an invitation.

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

## The Stammdatenbericht expands a class onto its teachers

The report writes out what a record is made of, expanded downwards (US-33). A class became a
record with one child collection the moment slice 1 landed, and the report went on listing it as a
bare name — so the report and the page it reports on now disagree about what a class is.

- Under "Klassen", each class is a **heading** rather than a bullet, and the teachers who look
  after it are its bullets directly — there is no "Lehrpersonen" heading of its own between the
  class and its names, the class heading already says whose names these are.
- A class nobody looks after has an empty bullet list, not a "Keine Einträge." line. The heading
  itself — the class's own name, still under "Klassen" — is what a teacher reads; a line under it
  saying nothing was assigned would repeat what the empty list already shows.
- A teacher is named first name first, matching the rights page, the class editor and the report's
  own name field. The order is the stored order of `teacherUids`, which is the order they were
  assigned in — no meaning is claimed for it, and none is imposed either.

### Where the names come from

The report is built from master data, and master data holds uids. Resolving one to a name needs
`users`, which a holder of `editMasterData` cannot read declaratively — the same wall the class
editor met, and it is answered the same way: `GET /api/users/teacher-candidates` already returns a
uid, a first name, a surname and an address per teacher, and already re-verifies `editMasterData`
server-side. **No new endpoint, no rule change, and no widening beyond the one already recorded
under "What the editor needs".**

The report tree stays a pure function. It is handed the resolved names rather than fetching them,
so what a teacher reads remains one testable answer computed from its inputs.

A uid that resolves to nobody is **left out**, silently, one at a time — the same treatment a
stale entry gets when an invitation is claimed (Q4). The report is a reading of master data, not
an audit of it, and a line about a person who is not there would be the only thing in it that is
not a fact about the school.

### The report never scopes narrower than a series

The root lists every series; below the root, the report is always **one series, in full** —
never an event's own slice of it, and never a programme's own slice of it either. A teacher
standing on an event's own page or a programme's own equipment list reads the same report as one
standing on the series itself, because a class's teachers are something the report should say
regardless of which of the series' own pages happens to be open, and a second, narrower shape of
the same report is a second thing to keep in sync with the first.

This closes two places that used to scope narrower and opens one that used to have no report at
all: an event's own page reported only that event; a programme's own page reported only that
programme; a class's own page — the teachers editor — reported nothing. All three now show the
open series' `eventSeriesReport`, exactly as the series' own category pages already did.

## What "open" means

Scoping breaks the one control this feature cannot leave alone. A teacher who looks after 2aWI
must not be able to open 3bWI to students, and today "open" is a single flag on the event series
document — there is no smaller thing to press.

Pulled on, that flag turns out to be answering three questions at once, and to be entangled with
the invitation links in a way that serves neither. Minting a class's link opens the whole series;
closing the series deletes every link in it. So one state is reachable that should not be — a
series opened from the header tag is open with no link in existence, and nobody can join it — and
one act does damage it was never asked to do: closing, which every assignment pass requires,
destroys every link the school has handed out.

**So "open" becomes a fact about a single class, and the link stops being the same fact.**

> A class carries two things: **an address**, which is its invitation link, and **a window**,
> which is whether it is currently open. The address is stable across any number of windows.

One invariant ties them together, and it is the only one:

> **A class may never be open without a link.** Opening mints one where there is none.

That leaves three states and no fourth:

| State           | Link | Open | Reached by                           |
| --------------- | ---- | ---- | ------------------------------------ |
| Never invited   | –    | no   | a newly created class                |
| **Open**        | yes  | yes  | pressing open, which mints if needed |
| **Closed**      | yes  | no   | pressing close, which keeps the link |
| _open, no link_ | –    | yes  | **unreachable by construction**      |

"Invalidated" is not a fourth state. It is a deliberate, rare act that replaces the address,
leaving the window exactly as it found it — see Q11.

See Q8 for what else was considered, and for what defeated the alternative this document held
until recently: that the link's existence _was_ the open state.

### The three questions it used to answer at once

| Question                                             | Now asked of                                                                             | Where               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------- |
| May this student **join** — may a record be created? | the token they presented, which names both a series and a class, and whose class is open | `/join/{token}`     |
| May this student **amend** what they already said?   | their own class being open                                                               | `saveRegistration`  |
| May this series be **archived**?                     | none of its classes being open                                                           | `updateEventSeries` |
| May **this student** be assigned to an event?        | _their own class_ being closed — not the series                                          | `assignStudents`    |

That last row is a narrowing, and it is what makes stable links worth having. Assigning is refused
while a student might be answering questions their event decides, which is a fact about **that
student's class** and never was one about the series. Asked series-wide, it obliged a teacher to
shut the whole school to assign one class — and under the old rule that also destroyed every link
in it.

Joining and amending come apart, and they have to: a student who joined in September returns in
October by signing in, with no link in hand at all. So joining is the one act that demands a
token, and amending asks only whether the class the record already names is open.

**A record is never created without a live link to an open class.** Not by opening the form, not
by saving it, and not by any other route. That is why a token names a class as well as a series —
a record carries the class it was enrolled into, and nothing else in the flow can supply it.

### The controls, per class

On Registrierungen, on each class card the page offers its reader:

- **"Registrierung öffnen" and "Registrierung schließen"**, one toggle, which is the only thing
  that moves the window. Opening mints a link where the class has none; closing keeps the one it
  has. Closing evicts nobody: its students keep their registrations and simply cannot change them.
- **"Link kopieren" and the QR code hand out the address, and change nothing.** Where the class
  has no link one is minted — an address with the window shut admits nobody, so this is harmless —
  and where it has one, the same link comes back. Copying twice copies the same link, this year
  and next. A teacher can prepare the mail before the window opens.
- **"Neuen Link erzeugen"** replaces the address and leaves the window alone. It is the answer to
  a link that has got into the wrong hands, and to nothing else. It is confirmed, and the
  confirmation can now say something true and specific: the previous link stops working, and
  whoever holds it needs the new one.

The first two are the everyday controls and the third is the rare one, which is the shape the
controls should have had all along. "Regenerieren" used to be the only way to replace a link, and
it sat beside a close button that silently did the same thing.

### The controls, per series

The door on the header's event series tag keeps its two states and its **one** action, but it now
reads a set of classes rather than a flag on the series. The action is whichever the door is not:

- **In scope** means the classes the pressing teacher looks after in this series, or every class of
  it where they look after none (the same rule as everywhere else in this document).
- **The door shows open while one or more classes in scope are open**, and closed only when every
  one of them is closed. So it answers "is anybody being let in?" rather than "is everybody?" —
  which is the question worth being able to see from any page.
- **While the door reads closed, the action is "öffnen"**, and it opens every class in scope,
  minting a link only for those that have never had one. A class that was open last month keeps
  the address it was given then.
- **While the door reads open, the action is "schließen"**, and it closes every class in scope, and
  no other. A teacher who looks after three of a school's twenty classes closes those three; a
  teacher who looks after none closes all twenty. No link is destroyed by it.
- **There is no press that opens while the door already reads open.** The tag offers one action,
  and it is the one the door is not — so the state cannot be pressed further in the direction it is
  already in.

One consequence, and it is the intended one: **a partly open series can only be closed from the
header.** With one of three classes open the door reads open, so the press on offer shuts all
three. Opening the other two is done on their own cards, which is where opening one class lives.
The header's job once something is open is to be able to stop everything from wherever the teacher
happens to be standing, and that is the press it keeps.

### What a student sees

**One rule covers almost all of it: a student who holds a registration is taken to it, however
they arrived.** A link, a dead link, or no link at all — the destination is the same, and the only
thing the arrival decides is what happens to a student who holds none.

|                               | Holds a registration                 | Holds none                             |
| ----------------------------- | ------------------------------------ | -------------------------------------- |
| **Live link, class open**     | that series' registration            | joined, then their new registration    |
| **Live link, class closed**   | that series' registration, read-only | told the window is shut, keep the link |
| **Dead link**                 | their registration, or the chooser   | told the link is no longer valid       |
| **No link — just signing in** | their registration, or the chooser   | told they hold none                    |

- **A link names one event series, so it never asks which.** It carries a series and a class, and
  that is the series it opens — the question the chooser exists to ask does not arise.
- **The chooser stays, for the two arrivals that name no series.** Signing in and navigating to
  the app, and following a link that leads nowhere, both fall back to `/app/my-registration`. It
  opens the one registration the student holds; where they hold several it asks which; where they
  hold none it says so. That is what it does today (Q7 of `spec/requirements.md`), and it is
  unchanged except in which registrations it counts.
- **An archived series is never on that list.** Archiving is what signs a series off and takes it
  off every screen, the student's included — so it is archiving, not closing, that ends a
  registration's visible life.
- **A registration whose class is closed is shown read-only**, wherever the student came from.
  Every answer is on screen, filled in and inactive, with one line saying registration is closed.
  Today the form is replaced by that sentence alone, which takes a student's own answers away from
  them at the moment they most want to check them.
- **A link that leads nowhere says so, apart from a plain sign-in with nothing joined.** Mistyped,
  replaced by a new one, or naming a class or series since removed: those reasons stay untold
  apart from each other, since none is anything a student could act on differently — but arriving
  with a link that did not work reads differently from arriving with nothing at all, and is told
  apart in what it says.
- **A live link to a closed class is the one case that says something different**, and it should.
  The address is theirs and still good; only the window is shut. Telling them "no longer valid"
  would send them chasing a teacher for a link they already have — which is the very cost stable
  links were adopted to remove. Nothing is leaked by saying it: they are signed in, and holding
  the token is proof they were invited.
- **Following a link never moves an existing registration to another class** (Q13). It navigates,
  and nothing more. Enrolling somebody into a different class is done by deleting their
  registration and inviting them again, which is what it honestly is.

The read-only rule moves a line in `openSeriesOfStudent`, which today lists only the series a
student holds a registration in **and** that are open. It becomes every series they hold one in,
**archived aside**. **The consequence is that the chooser appears where it did not before**: a
closed but not yet archived series stays on the list beside a live one, so a student holding both
is asked which. That is accepted — the alternative is hiding a registration from the person who
filled it in, and archiving remains the act that ends the list's growth.

### What this does to archiving

Archiving is refused while **at least one class of the series is open**, in place of the
series-wide flag it asked before. The hint is unchanged in intent: close registration first, then
file the series.

**Archiving is also the one thing that deletes links in bulk.** A signed-off series should not
leave live enrolment addresses lying about, and archiving is terminal — there is no reopening it
for, so nothing has to be handed out again. It is the only bulk invalidation left in the design,
and it is the only one that cannot cost anybody a resend.

## What this does not change

- **`firestore.rules`.** Not one line — deliberately, and for now. Every write already goes
  through a handler and every rule that governs one already says `allow write: if false`, so the
  scope has a server-side home without the rules being told about it. What the rules cannot yet
  say about reads is set out in "Two layers, two rules".
- **`invitations`.** One document per live link, readable and writable by no client at all,
  reached only through the handlers that mint and delete one. The token never appears on a
  document a student can read (Q9).
- **`invitedTeachers`.** Closed to every client in both directions, reached by nothing but the
  provisioning scripts and `provisionUser`, exactly as today. The application gained no way in.
- **A user record.** Nothing is added to it and nothing writes it: the uids live on the event
  series, beside the class they belong to.
- **The permissions.** Nothing is added to `PERMISSIONS`, no label changes, and the exclusivity
  rule between the two report permissions is untouched. Which _kind_ of page somebody may open is
  still decided by a permission and by nothing else; an assignment only decides which series'.
- **What a page can do.** A scoped page carries the controls it always carried, for the classes it
  offers: handing out an invitation link, showing a QR code, deleting a registration, moving a
  student between events, saving a report.
- **Who may open and close.** It stays with `editRegistrations`. What changes is not who presses
  it but what the press reaches — their own classes, and no others.
- **What a link is worth.** 32 bytes of entropy, base64url, standing in for the series id so that
  its holder learns nothing about any other (US-23). What changes is its lifetime, and it changes
  in the direction of stability: it now survives every close and reopen, and ends only where a
  teacher replaces it, the class is removed, or the series is archived or deleted (Q12).
- **Saved reports.** A report is the school's, not its author's (US-13). One naming a class its
  reader does not look after opens with that tag dropped, exactly as a tag whose class has been
  renamed away already does. It is not an error and it is not rewritten.
- **Both exports**, which are built from what is on screen and so follow it without being told to.
- **The student's own view**, which was never about classes other than their own — only about
  whether it is shown at all, which is what US-45 changes.

## User stories

### US-38: A class names the teachers who look after it

As a teacher maintaining master data, I record which of my colleagues look after each class of
this event series, so that the application knows what the staff room already knows.

**Acceptance criteria:**

- A class is a record: a name, and the teachers who look after it. The name remains its identity,
  and everything US-6 says about maintaining the list — uniqueness, the maximum count, the maximum
  length, the teacher's order — holds unchanged.
- Renaming a class and reordering the list carry the teachers with them: the entry is respelled or
  moves, and who looks after it is left alone.
- It belongs to the class _of this series_. The same class name in another series carries its own
  assignment, and a new series copied from an old one (US-22) takes the classes and their
  assignments with it, as it takes every other list.
- **It grants nothing.** It is not a permission, it adds no page to anybody's navigation, and it
  is not checked by any Security Rule. What somebody may do stays entirely a matter of the
  permissions (US-2); what an assignment decides is how far a permission they already hold
  reaches (US-42).
- A class's record page lists as tags every teacher who holds a record, pressed for assigned.
  Pressing assigns; pressing again withdraws.
- The row is narrowed by a name field, and by one tag that shows only the teachers already
  assigned.
- A teacher may look after any number of classes, and a class may be looked after by any number of
  teachers.
- **The editor writes the event series document and nothing else.** It never writes a user record
  and never reads or writes an invitation.
- Somebody who has never signed in holds no record and is not offered. Where the school wants to
  name one in advance, the provisioning script leaves the assignment with their invitation (US-40).
- Removing a class removes its assignments with it, on the same terms as removing any list entry:
  refused while a registration still names that class. Somebody left looking after nothing in that
  series is thereby widened back to all of it, rather than narrowed to none.

### US-39: My pages open on the classes I look after

As a teacher who looks after a class, I find the pages I may open already narrowed to my own
classes, so that I start where my work is rather than filtering the whole school down to it every
time.

**Acceptance criteria:**

- Where the reader looks after at least one class of the selected series, Registrierungen,
  Zuteilungen and Berichte offer those classes and no others: the class filter tags, the cards,
  the figures and the students listed.
- Where they look after no class **anywhere**, all three offer every class of every series,
  exactly as today.
- Where they look after a class somewhere but none in this series, the series is not one they can
  select at all (US-42), so the case does not arise on these three pages.
- The other filter categories are untouched. A narrowed teacher filtering by program filters their
  own students by program, because those are the students the page is showing.
- **The narrowing is a view and is never described as anything else.** The Security Rules are
  unchanged, and a holder of any of the four reading permissions can still read every registration
  of the series through the SDK. See "Recorded debt: reads are wider than the interface".
- Withdrawing an assignment widens the pages again on the next read, in the way the lists behind
  every other tag row already update live.

### US-40: An invitation can be provisioned with the classes waiting for its holder

As the operator setting a school up, I leave a colleague's class assignments with their invitation,
so that somebody who has not yet signed in arrives with their pages already narrowed.

**Acceptance criteria:**

- An invitation may carry class assignments, each naming the event series it belongs to as well as
  the class.
- They are written **only by the provisioning scripts**, through the Admin SDK. No page and no
  Route Handler reads or writes an invitation, and the Security Rules go on denying both to every
  client.
- They are claimed at the holder's first sign-in, together with the permissions the invitation
  carries, and the invitation is then deleted.
- Claiming adds the new uid to each named class, so their pages are narrowed from that sign-in on.
- An entry naming a class or a series that is no longer there is skipped, silently, and the rest
  are applied. Nothing is reported and nothing is blocked.
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

### US-42: I am only shown the event series I look after a class in

As a teacher who looks after a class, I find the header offering the event series my work is in
and no others, so that I cannot wander into a series that is somebody else's job.

**Acceptance criteria:**

- Where the teacher looks after at least one class **anywhere**, the header's tag row offers the
  event series they look after a class in, and no others. The rest are absent, not shown and
  refused.
- Where they look after no class anywhere, the row offers every unarchived series, exactly as
  today. Archived series stay absent for everybody, as they already are.
- A series the row does not offer **does not open**, whichever of its pages is named and however
  it is reached. The refusal is decided in the server component, so a URL typed by hand is not the
  hole in the tag row, and it reads as the sentence an unavailable series already gives.
- The same answer decides the tag row, the page guard and the landing redirect, computed by one
  module, so the header and the server can never disagree about what somebody is scoped to.
- Where the remembered series is not one they are scoped to, they land in one that is rather than
  on a refusal.
- It is decided by class assignments alone. No permission grants a series, and no series grants a
  permission.
- Being scoped to a series shows only the pages the teacher's permissions already open — the
  navigation is unchanged.

### US-43: I open and close registration one class at a time

As a teacher who looks after a class, I open and close registration for that class on its own, so
that my class can be registering while the rest of the school is not.

**Acceptance criteria:**

- A class carries **a window** — whether it is open — and **an address**, its invitation link. They
  are separate: closing the window keeps the address.
- **A class is never open without a link.** Opening one that has never had a link mints it.
- On Registrierungen, a class card carries **one toggle**, "Registrierung öffnen" and
  "Registrierung schließen", and it is the only control that moves the window.
- **"Link kopieren" and the QR code change nothing.** They mint where the class has never had a
  link — an address with the window shut admits nobody — and otherwise hand back the same link.
  Copying twice copies the same link, this year and next, so a teacher can prepare the mail before
  the window opens.
- A class card carries **"Neuen Link erzeugen"**, which replaces the address and leaves the window
  as it found it. It is confirmed, and the confirmation says that the previous link stops working.
  It is the answer to a leaked link and to nothing else (Q11).
- Closing a class **evicts nobody**: its students keep their registrations, and their answers stay
  exactly as they left them.
- **Assigning a student to an event is refused while _their own class_ is open**, in place of the
  series-wide refusal it asked before. A teacher closes one class, assigns it, and reopens it,
  without shutting the school — and without invalidating anything.
- Only the classes the page offers its reader can be opened, closed or re-linked by them (US-39),
  and the handler refuses a class outside them rather than narrowing the request quietly.
- A class of an archived series cannot be opened, and neither can one of a series that has no
  classes — both refusals already exist and are unchanged in intent.
- Renaming or removing a class is refused while its invitation is live; archiving the series
  deletes every invitation in it (Q12).

### US-44: I open or close every class I look after at once

As a teacher who looks after several classes of one event series, I open or close all of them from
the header, so that starting a registration round is one act rather than one per class.

**Acceptance criteria:**

- The door on the header's event series tag **shows open while one or more classes in scope are
  open**, and closed only when every one of them is closed.
- The tag carries **one action, and it is whichever the door is not**. There is no press that
  opens while the door already reads open.
- Pressing it while closed opens **every class in scope**, minting a link only for those that have
  never had one — a class that was open last month keeps the address it was given then.
- Pressing it while open closes **every class in scope**, and no other. **No link is destroyed by
  it.**
- **In scope** means the classes the pressing teacher looks after in this series. A teacher who
  looks after none of them is in scope of every class of the series, and closes all of them.
- A partly open series can therefore only be closed from the header; the remaining classes are
  opened on their own cards.
- Opening or closing it acts on nothing outside that set, which the handler enforces rather than
  trusting the request.
- It stays with `editRegistrations`, and it stays the only series-wide control for this — there is
  no second one on a page, and there is no bulk way to replace a link.
- Archiving is refused while **at least one class of the series is open**, in place of the
  series-wide flag it asked before.

### US-45: My link keeps working, and my registration stays mine when it is closed

As a student, the link I was sent goes on working from one registration round to the next, and I
can always reach what I filled in — even after registration has closed — so that a closed round
neither strands me nor takes my own answers away from me.

**Acceptance criteria:**

- **A registration I hold is where I land, however I arrived** — by a live link, by a dead one, or
  by signing in with none. What the arrival decides is only what happens when I hold none.
- **The link I was given keeps working.** Closing my class does not kill it, and it lets me in
  again when my class reopens. It stops working only where a teacher has deliberately replaced it.
- **A dead link tells me so only when I hold no registration.** Where I hold one, it takes me
  there instead. Mistyped, replaced, or naming a class or series since removed all read the same,
  so none of them can be told apart (US-23).
- **A live link to a closed class tells me the window is shut and to keep the link**, where I hold
  no registration — because the link is not dead and I should not go looking for a new one.
- **A closed registration is shown, not withheld.** Every answer is on screen, filled in and
  inactive, with one line saying registration is closed. Nothing can be changed and nothing can be
  saved.
- **A record is only ever created by following a link to an open class**, and that link names both
  the event series and the class. There is no other way for one to come into existence.
- **Following a link never moves my registration to another class.** It takes me to it and changes
  nothing; being put in a different class means being registered again.
- **A link names one event series, so it never asks me which.** Signing in with no link, or
  following one that leads nowhere, asks only where I hold registrations in more than one series.
- Amending an existing registration needs no link: it is allowed exactly while the class the
  record names is open.
- The list of registrations I hold covers every series I hold one in, **archived aside** — so a
  closed round stays reachable until the school files it away, and an archived one is off my
  screen as it is off everybody's.

### US-46: The Stammdatenbericht names the teachers of each class

As a teacher maintaining master data, I read who looks after each class in the same report that
tells me everything else the series is made of, so that the report describes a class as the record
it now is rather than as the name it used to be.

**Acceptance criteria:**

- Under "Klassen", each class is a heading; the teachers who look after it are its bullets
  directly, with no "Lehrpersonen" heading of its own between the class and its names.
- A class nobody looks after has an empty bullet list, not a "Keine Einträge." line — the class's
  own heading, still under "Klassen", is what says which class this is.
- A teacher is named first name first, in the stored order of the assignment.
- The report shown anywhere below the root is the open series' report in full, never an event's
  or a programme's own slice of it — so a class's teachers show wherever that series' report is
  read, including from an event's own page, a programme's own page, and a class's own page,
  which did not offer a report before.
- Both exports follow, being built from what is on screen.
- A uid naming nobody is left out silently; the rest of the class is reported as usual.
- The names come from `GET /api/users/teacher-candidates`, which already re-verifies
  `editMasterData`. No new endpoint, and `firestore.rules` is not touched.
- The report tree stays a pure function: it is handed the resolved names, and does no fetching.

## Questions and inconsistencies, all settled

### Q1 — What a report permission alone sees, once class scoping exists — ANSWERED

**Narrowing applies only to somebody who looks after a class.** A holder of `viewReports` or
`editReports` who looks after none in this series is offered every class, as today; looking after
one is what narrows them to what they look after.

The alternative — a report permission grants the page and the classes decide the data — was
rejected: on the day it shipped nobody would be assigned anywhere, so every existing report reader
would open an empty report until an admin had gone through the classes one by one.

Superseded in part by Q2, which makes this a question about what a page offers rather than about
what anybody may read. The answer is unchanged; only its consequences shrank.

### Q2 — Does an assignment grant anything? — ANSWERED, then amended by Q8

**No, and it still grants nothing.** It is master data: it says these teachers look after this
class. A teacher reaches Registrierungen by holding `editRegistrations`, Zuteilungen by holding
`editAssignments` and Berichte by holding a report permission — all granted where they have always
been granted, on the rights page. No assignment adds a page to anybody's navigation, and no
assignment lets anybody do anything they could not do before.

**What the original answer got wrong was the other direction.** It said the effect was "interface
only" — restricting the filters on three pages, and nothing else. Per-class opening and closing
(Q8) makes that untrue: an assignment now decides which event series the header offers, which
series' pages open, and which classes a press of open or close reaches. So the amended answer:

> An assignment grants nothing and takes away plenty. It can only ever _subtract_ from a
> permission the school has already granted, never add to one.

That is what keeps the original conclusion standing. `editMasterData` gained the ability to assign
a class, and assigning one still cannot hand anybody access to anything — the worst it can do is
narrow somebody who should have been left wide, which is visible, reversible, and takes a page
away rather than opening one.

**Accepted with it:** `firestore.rules` stays exactly as it is, so a holder of `editRegistrations`
can read every registration document of every series and not only those of the classes they look
after. The narrowing is a view on the read side; on the write side and at the page guard it is
enforced. See "Two layers, two rules" and the debt recorded beneath it.

This is what withdrew the whole enforcement design — `classTeacherUids` on the registration,
`assignedTeacherUids` on the series, the rule, the narrowed subscription, the access-call proof —
and with it the concern that `editMasterData` would become able to grant access to personal data.
It cannot: there is no access to grant.

### Q3 — Is the assignment page narrowed too? — ANSWERED

**Yes.** Registrierungen, Zuteilungen and Berichte are narrowed alike. Since the narrowing is a
view rather than a read boundary, the assignment board keeps every student it needs and simply
offers the classes its reader looks after.

### Q4 — A pending assignment can be left pointing at nothing — ANSWERED

**The claim drops it, silently.** At the first sign-in each entry of `classAssignments` is applied
where its series and its class are both still there, and skipped where either is not. Nothing is
reported, and nothing is blocked.

That is what keeps the assignment out of everybody else's way: renaming a class, removing one and
deleting a whole series are each decided on their own terms, and none of them has to scan the
invitations first. A dropped entry grants nothing and takes nothing away — it would have narrowed
a view, and the unnarrowed view is what somebody gets instead.

### Q5 — "View" or "manage", for a teacher who looks after a class — WITHDRAWN

The question was what a class teacher holding no permission may do on the registrations page. Q2
removes the case: holding no permission, they do not reach the page at all. Somebody who does
reach it holds `editRegistrations` and carries every control it has always carried — the
invitation link, the QR code, deleting a registration — for the classes the page offers them.

### Q6 — A teacher's uid becomes readable by every school member — ANSWERED, and what it was hiding

**Accepted.** `teacherUids` sits on the event series document, which any signed-in member of the
school may read in full, students included — the same rule that lets a student see the lists they
answer from. A uid is opaque and cannot be resolved to a person without reading `users`, which a
student may not; and the class teacher is not a secret from the class.

Reviewing the rest of the design turned up **two things that had been missed**, both now settled in
"What the editor needs, and what it must never touch":

1. **The editor reads a collection it may not read.** `users` is closed to `editMasterData` today,
   and widening the rule would hand over permissions with the names, because a rule grants a whole
   document. A handler answers the names instead, and `firestore.rules` is left alone.
2. **Writing an invitation would have been an escalation path.** An earlier draft had the editor
   record an absent colleague by writing `classAssignments` onto their invitation. An invitation
   also carries `permissions` — so that write, however strictly scoped, would have put
   `editMasterData` one handler mistake away from granting `editUsers`. The application therefore
   does not write an invitation at all: `invitedTeachers` stays closed in both directions and
   belongs to provisioning alone. This is the one that mattered.

Four smaller things, accepted rather than fixed:

- **`editMasterData` comes to read the staff directory.** Names and school addresses, which only
  `editUsers` could enumerate before. Narrowed to what the tags show, and no permissions with it.
- **A copy carries the assignments.** Creating a series from another (US-22) copies `classOptions`
  and therefore its `teacherUids`, so last year's teachers arrive in this year's series. That is
  usually what is wanted, and where it is not, it grants nobody anything.
- **A uid can outlive the person.** Nothing deletes a user record, so somebody who leaves the
  school stays named on the classes they looked after until a teacher removes them. It narrows a
  view for an account that no longer signs in.
- **A dropped assignment is dropped late.** Q4 leaves a stale entry on an invitation until the
  claim discards it, so a series id and a class name stay attached to an address for as long as
  the invitation does. The invitation is the thing being retained; this adds nothing to its life.

### Q7 — The user story numbers already collide, twice — ANSWERED for this document

US-38 to US-41 are free under every reading of the existing documents, so the stories added here
are exclusive as they stand: `spec/refactoring-identity.md` stops at US-35 and
`spec/refactoring-per-event-categories.md` at US-37.

What was not exclusive is the way this document _referred_ to the numbers. US-33 and US-34 mean
one thing in the identity document and another in the per-event one, and both meanings were cited
here, pages apart. Every reference to a colliding number now names the document it comes from:
**US-33 (identity)** is "A person is never named in a URL" and **US-33 (per-event categories)** is
"Teacher maintains master data as a hierarchy"; likewise for US-34.

The collision itself is untouched, because it lives in two other documents and in the code
comments that cite them. It still needs settling when the four documents are merged, and until
then a number alone is not enough to find a story by. So does its second half: the story saying
which required equipment the school lends is US-37 in
`spec/refactoring-per-event-categories.md` and is cited as US-36 throughout the code.

### Q8 — Is a live link the only thing that makes a class open? — ANSWERED, after being answered the other way first

**No. The link is an address and the window is a decision, and they are two facts.** Four shapes
were considered.

| Option                                                  | What "open" would be                               | Verdict                                            |
| ------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------- |
| **A — the link, and nothing else**                      | The class holds a token                            | Held for a while, then defeated — see below        |
| **B — a stable link, plus a window a teacher opens**    | The class is flagged open; the link is its address | **Chosen**                                         |
| **C — a per-class flag, with the link a separate door** | A flag says so; the link merely lets somebody in   | This is B, differing only in whether opening mints |
| **D — a per-class flag, or the series' own switch**     | Either the class or the whole series says so       | Two answers, and an ambiguity to settle            |

**Why A was chosen first.** One fact, one record, nothing to fall out of step — and the entangled
pair it replaced already had a state where they disagreed. It also matched what a teacher appears
to do: handing the link out _is_ opening registration.

**What defeated it.** Under A, closing destroys the link, so every reopening obliges the teacher to
broadcast a new one to the whole class. That would be a fair price if closing were rare. It is not,
and it is not even voluntary: **assigning students to events is refused while their class is open**,
so a teacher must close in order to do an assignment pass and reopen afterwards so students can go
on amending. The cycle is forced by the design. Under A, every assignment pass invalidates the
links of every class it touches.

Two secondary arguments, neither decisive alone:

- **Students accumulate links.** After two cycles a class's students hold three addresses in their
  mail or their Teams channel, and no way to tell which is live. The one that works is the newest,
  which is the one hardest to find.
- **Every comparable system separates the two.** A Teams team join code is generated once and stays
  valid until somebody presses Reset; a Teams meeting link is stable for the meeting's life;
  Microsoft Forms and Google Forms both pair one permanent link with an "accept responses" toggle,
  and a closed form says so rather than 404-ing. Four independent products converging on address
  plus window is not proof, but it is not nothing either.

**What made A tempting is preserved anyway.** The disagreement it was collapsing is prevented by
the invariant instead: a class may never be open without a link, so opening mints one. The
unreachable state stays unreachable.

**What B costs, accepted.** Two facts rather than one, an extra control for the rare case, and a
link that lives long enough to see its class renamed — which is why a rename is now refused while
the link is live (Q12). Against that: the codebase's own note that leaving links dormant "made
closing look like a remedy for a link that got out, when it only suspended one" is answered rather
than ignored. It was right when closing was the _only_ way to kill a link. Once "Neuen Link
erzeugen" exists as its own named act, closing no longer has to pretend to be a remedy, and the
remedy is the button that says so.

**Two questions come apart under B**, and they have to. Joining demands a token; amending does
not, because a student returning in October signs in with no link in hand. So joining asks the
token _and_ the window, and amending asks only the window. That split is what makes "a record is
only ever created by following a link to an open class" (US-45) sayable at all.

### Q9 — Should the token live on the class, beside `teacherUids`? — ANSWERED, and it is a finding

**No, and this one is not a preference.** The class carries the window; the token stays in
`invitations`, which no client may read.

`firestore.rules` grants every signed-in school member a read of the whole event series document,
because a student's form is built from its lists — and a rule grants a whole document or none of
it. A token on `classOptions` would therefore be handed to every student in the school, and a
token _is_ the enrolment. Any student could join any class of any series; and since joining an
existing registration sets its `class`, they could move themselves out of their own class into
another. Under US-39 that also moves them from one teacher's page to another's, silently. No
outsider gets in — Entra ID comes first — so it is a data-integrity hole rather than a breach, but
it is one click wide and leaves no trace.

Stable links make the case for putting it on the class stronger, not weaker: the address is now a
durable property of the class, it would be carried by a rename for free, and it would be deleted
with the class for free. Two other shapes were weighed and set aside:

- **A subcollection of class records** with a rule of its own would close the read, but a class is
  keyed by its name (US-38), so renaming one would become a document move — trading the problem
  for a worse one.
- **`eventSeries/{id}/invitations/{className}`** would make lookup by class O(1) and follow the
  series on deletion, at the cost of turning `/join/{token}` into a collection-group query. A
  lateral move, not an improvement.

So the shape is: `classOptions[].isOpenToStudents` on the series document, and
`invitations/{token}` unchanged in shape and rule. The boolean is a **decision, not a mirror** —
it is what a teacher pressed, and the link's existence no longer implies it.

**It moves onto the class later, for free.** When the recorded debt is paid and the event series
reads move behind handlers, the rule becomes `allow read: if false` and there is nothing left to
hide the token from. That is when to make it a property of the class, and not before.

The series' own `isOpenToStudents` is **removed**, not moved. Everything that asked it now asks the
classes of the document it already has — archiving, the list's state label, the header's door —
except assigning, which stops asking about the series at all and asks the student's own class
(US-43). The one place that queried it (`openSeriesOfStudent`) stops filtering on open entirely,
because US-45 requires a closed registration to still be reachable.

### Q10 — What does one tag's door say when its classes disagree? — ANSWERED

**Two states, and the threshold is "any", not "all".** The door reads open while one or more
classes in scope are open, and closed only once every one of them is closed. The tag carries one
action, and it is whichever the door is not: pressing it while closed opens every class in scope,
and pressing it while open closes every class in scope. There is no press that opens while the
door already reads open.

A third state — "teilweise offen" — was considered and dropped. The mixed state is not rare: with
opening and closing done per class, opening a single one from its card produces it immediately, so
it is not a corner the tag can pretend does not exist. But naming it would cost a third icon and a
third label in a header that already carries a name, a selection and an action, and it would make
the effect of one press depend on which of three states the tag was in. The class cards already say
precisely which classes are open, one row each; the tag only has to answer the question that is
worth seeing from any page, which is whether anybody is being let in at all.

**What "any" buys.** The tag reads as a stop button whenever there is something to stop. A teacher
who has opened one class and walked away can shut it from wherever they are standing, without
first working out which of them it was.

**What it costs, accepted.** A partly open series can only be closed from the header: with one of
three classes open the press on offer shuts all three. Opening the other two is done on their
cards, which is where opening one class lives. The alternative — a door that reads closed until
every class is open — would leave an open class invisible from every page but one, which is the
worse mistake to make.

### Q11 — What becomes of "Regenerieren"? — ANSWERED

**It stays, renamed to what it does: "Neuen Link erzeugen".** Under Q8's stable links it is the
only way to replace a class's address, so it earns a place it did not have before.

It was nearly dropped. While the answer to Q8 was "the link _is_ the open state", closing and
reopening replaced the token anyway, so a third control would have been a second way to do
something two existing controls already did — and one with a confirmation dialog of its own. Q8
turning over turns this over with it: closing now keeps the link, so nothing else replaces one.

The rename is not cosmetic. "Regenerieren" never said what it was for, and it sat beside a close
button that silently did the same thing, so its confirmation could not honestly claim the old link
would stop working — closing was about to do that regardless. Now it can, and that sentence is the
whole reason the control exists: this link has got into the wrong hands, and the class needs a
different one.

- It **replaces the address and leaves the window alone**, so a class that was open stays open on
  the new link, and one that was closed stays closed.
- It **evicts nobody**. Students who already registered keep their records and reach them by
  signing in, exactly as they always did.
- It is offered **per class and nowhere else**. A leak is a fact about one link, and there is no
  bulk version of it — the one bulk invalidation in the design is archiving (Q12), which is
  terminal.

### Q12 — What must a long-lived link be carried through? — ANSWERED

A link that dies at every close is never around to see its class change. A stable one is, so three
events that never had to think about invitations now do.

- **Renaming a class is refused while its invitation is live.** The token records the class by
  name, so a rename would otherwise orphan it and a student joining afterwards would be enrolled
  into a class name matching nothing. Closing the class, or regenerating the link, is what frees
  the name again — the same terms a rename already refuses under while a registration still names
  the class.
- **Removing a class is refused on the same terms**, for the same reason: nothing is orphaned in
  either direction.
- **Archiving deletes every invitation of the series.** It is the one bulk invalidation left in the
  design and the only one that can cost nobody a resend, because archiving is terminal: a
  signed-off series is not reopened, so there is nothing to hand out again. A series is closed
  before it can be archived in any case, so the links being deleted are already admitting nobody.

Deleting a series already takes its invitations with it, and that is unchanged.

### Q13 — Does following a link re-class a student who has already registered? — ANSWERED

**No. A link leads somewhere; it does not change anything.** A student who already holds a
registration for the series a link names is taken to it, and the class the record carries is left
exactly as it was.

Today `joinEventSeries` updates an existing registration's `class` to whichever the followed link
names. That was how a student who joined the wrong class got corrected: the teacher sent them the
right class's link, and following it moved them.

Stable links turn that into a hazard. A student moved from 2aWI to 2bWI in October still holds
2aWI's link, and it still works — so clicking the old mail moves them back, silently, and the
teacher finds out when the figures disagree. Under the old model the stale link died at the next
close, which is why this never came up.

**The correction path becomes delete and re-invite.** The registrations page already offers both
halves, and together they are an honest description of what is happening: the student is being
enrolled again, into a different class. It costs the teacher one press more in a case that is
already rare, and it costs the student their answers — which is the part worth weighing, and the
reason it is a deliberate act rather than a side effect of a click in an old mail.

## Sequencing

Each slice is a pull request of its own, and each is green on the whole gate before the next
starts — tests, lint, types, formatting, licence headers, and the rules tests against the
emulator. Test-driven throughout: the failing test that states the new behaviour comes first.

**No question blocks any slice.** Q1 to Q4 and Q6 to Q13 are answered and Q5 is withdrawn. **No
slice touches `firestore.rules`** — the debt recorded under "Two layers, two rules" is a separate
piece of work and is not in this sequence.

| Slice  | What lands                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | A class becomes a record. `classOptions` goes from `string[]` to objects with a name and an empty `teacherUids`. Nothing reads the new field yet. Purge and reseed. ✅ landed                                                                                                                                                                                                                                                                              |
| **2**  | The class record page and its editor, and the handler that answers the candidates from `users`. The editor writes `classOptions` and nothing else. ✅ landed                                                                                                                                                                                                                                                                                               |
| **3**  | Provisioning: `classAssignments` on an invitation, written by the scripts, claimed by `provisionUser`, dropping what no longer applies. ✅ landed                                                                                                                                                                                                                                                                                                          |
| **4**  | The narrowing: the classes offered by Registrierungen, Zuteilungen and Berichte follow what their reader looks after (US-39). ✅ landed                                                                                                                                                                                                                                                                                                                    |
| **5**  | The rights page shows the assignments, read-only (US-41). ✅ landed                                                                                                                                                                                                                                                                                                                                                                                        |
| **6**  | The Stammdatenbericht expands a class onto the teachers who look after it, resolving the uids through the candidates handler (US-46). ✅ landed                                                                                                                                                                                                                                                                                                            |
| **7**  | The scope itself: one module answering "which series is this teacher scoped to", the header offering only those, and the three pages refusing the rest (US-42). ✅ landed                                                                                                                                                                                                                                                                                  |
| **8**  | Open becomes per class and stops meaning "a link exists". `isOpenToStudents` moves onto `classOptions` and leaves the series; the card gains an open/close toggle; copying stops opening; "Regenerieren" becomes "Neuen Link erzeugen"; assigning asks the student's own class; archiving asks the classes and deletes the links; renaming and removing a class are refused while their invitation is live (US-43, Q8 to Q12). Purge and reseed. ✅ landed |
| **9**  | The bulk switch: the header's door reads the classes in scope and opens or closes over that set, destroying no link (US-44). ✅ landed                                                                                                                                                                                                                                                                                                                     |
| **10** | The student's side: a live link to a closed class says so, a dead one lands on their own registration, a closed registration is shown read-only, and the series list stops filtering on open (US-45). ✅ landed                                                                                                                                                                                                                                            |

Slices 5 and 6 are the same piece of work seen from two pages — where an assignment is looked for,
it is now stated — and neither needs anything from the other, so 6 follows 5 only because they
were noticed in that order.

Slices 7 to 10 are ordered by what each needs from the one before: 8 needs the scope 7 establishes
to know which classes a control may act on, 9 needs the per-class acts 8 introduces, and 10 is the
only one a student ever sees, so it lands once the teacher's half is settled.

`spec/database-erd.puml` is updated with slice 1 and again with slice 8. Environments are purged
and reseeded after slice 1 and after slice 8; the seeding script writes the new class shape in the
same slice each time.
