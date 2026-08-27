<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Refactoring: Seasons become Event Series

This document specifies one large change to the data model and to the way the application is
navigated. It is written as a companion to `spec/requirements.md`: the user stories below are
numbered on from the ones already there, and the section "Existing stories affected" says which
of those stories this change rewrites, narrows or withdraws. Once the refactoring has landed the
two documents are merged and this one is deleted.

The user story numbers are stable, not positional. US-19 to US-28 are appended by number and
placed by topic when merged, exactly as US-17 and US-18 were.

## Why

Three things are wrong with the model the application has today, and they have the same cause.

**Master data is global, but it describes one event.** Programs, classes, skill levels, bus
pickup points, food options and season pass options live in collections of their own, shared by
every season. A Kulturwoche has no use for "Ski" and a Sommersportwoche has no use for
"Silvretta-Montafon", but every season is made to offer both. The lists cannot diverge, so they
grow into the union of everything every event ever needed.

**Because the lists are shared, they cannot be edited.** US-5 to US-10 forbid editing or removing
an item that any registration of any non-archived season still holds, because the edit would
reach into a season nobody was looking at. The rule is correct given the model, and it is also
the single most obstructive thing in the application: a teacher who mistyped a class name in
October cannot fix it in November. Once each event series owns its own lists, an edit can only
ever reach the registrations of that one series — which is what makes cascading them safe, and
what lets the rule be withdrawn instead of worked around.

**One season is "active", and everything hangs off that.** Registration, assignment and the
report all read the active season, so the application can only ever be about one event at a
time. A school runs a Wintersportwoche and a Kulturwoche in the same year, and it prepares next
year's while this year's is still being reported on. A single global flag cannot express that.

A season is not a season, either. What the school actually plans is a series of events under one
banner — Wintersportwochen, Sommersportwochen, Kulturwochen — so the entity is renamed to an
event series, labelled "Eventreihe".

## What changes, in one page

| Today                                                    | After                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `seasons` collection, one of them `isActive`             | `eventSeries` collection, none of them privileged over the others                    |
| Seven collections of master data, shared by every season | Seven ordered arrays on the event series document                                    |
| Master data item identified by a document id             | Identified by its name, which is already unique within its list                      |
| An item in use cannot be edited or removed               | Any item can be renamed, and removed too — unless it is a class a registration holds |
| A registration is a snapshot nothing may disturb         | A registration is kept in step with the lists its series offers                      |
| `savedReports` collection, shared by every season        | Saved reports belong to one event series                                             |
| Registration joins `users` for the student's name        | Registration carries the name, so a report is one read                               |
| `studentMasterData`, which was never master data         | `registrations`, which is what a student's answers are                               |
| `studentMasterData.eventId` points at an event document  | `registration.event` names the event, like every other list value                    |
| One season is active; students write to that one         | Each series is open to students or not; several may be open at once                  |
| Registration opens when a teacher activates a season     | A series is opened by generating its invitation link                                 |
| The statistics page shows figures                        | The overview page runs the series: figures, invitation links and the open switch     |
| The page decides which season it is about                | The header decides, once, for every page                                             |
| Uniqueness via the `reservedNames` collection            | In-document for lists; a transactional query on `nameKey` for series names           |

## The shape it moves to

### The event series document

```jsonc
// eventSeries/{eventSeriesId}
{
  "name": "Wintersportwoche 2026/2027", // unique across event series
  // The normalised name, derived by the server and never sent by a client. Uniqueness is an
  // equality query on this inside the write's transaction (Q14) — an equality on `name` would
  // compare exact strings and lose the case- and whitespace-insensitivity the rule asks for.
  "nameKey": "wintersportwoche 2026/2027",
  // A template holds lists and saved reports to copy from, and never registrations (US-22).
  // It can never be opened to students, and that is the whole of it: it sits in the lower header
  // row and is selected and scoped like any other series (Q21).
  "isTemplate": false,
  "isArchived": false,
  // Whether students may write to this series: join it, and go on amending what they said
  // (US-19). NOT the old "active season" — any number of series may be open at once, and this
  // governs students only. An invitation link sets it; archiving clears it; unarchiving does
  // not restore it.
  "isOpenToStudents": true,
  "hasRegistrations": false, // mirror, server-owned, so the client can gate archive/delete
  "position": 0, // the order of the header tags (see Ordering)
  "revision": 41, // incremented by every write; what concurrent work checks against
  // The lock of US-27 while a cascade is running, and the only thing the trigger of Q15 reads:
  // which list changed, from what to what, how far it has got, and how many attempts it has had.
  "pendingCascade": null,

  // The maintained lists. Array order is the teacher-defined order, so no item carries a
  // position, and an item's name is its identity, so no item carries an id.
  "events": ["Woche 1", "Woche 2", "Woche 3"],
  "classOptions": ["2aWI", "2bWI", "2cWI"],
  "skillLevels": ["Keine Vorkenntnisse", "Anfänger:in", "Fortgeschritten", "Profi"],
  "busPickupPoints": ["HTL Dornbirn", "Bahnhof Bregenz", "Bahnhof Feldkirch", "Unterkunft"],
  "foodOptions": ["Alles", "Vegetarisch", "Vegan", "Kein Schweinefleisch"],
  "seasonPassOptions": ["Keine", "Vielleicht", "Golm-Bielerhöhe (Illwerke)", "Silvretta-Montafon"],
  "programs": [
    { "name": "Ski", "requiredEquipment": ["Ski", "Skischuhe", "Stöcke", "Helm"] },
    { "name": "Snowboard", "requiredEquipment": ["Board", "Boots", "Helm"] },
    { "name": "Alternativ", "requiredEquipment": [] },
  ],

  // A saved report is a selection the teacher asked to be remembered, and nothing else: a name,
  // which students are shown, and which detail lines they show (US-13, US-25). It is here for
  // the same reason the lists are — it belongs to this series and filters on these lists, and a
  // cascade that fixed the lists but left the reports behind would have fixed nothing. Array
  // order is the order the tags were dragged into, so no report carries a position either.
  "savedReports": [
    {
      "name": "Vegetarisch 2bWI",
      "filter": { "name": "", "tags": { "class": ["2bWI"], "foodOption": ["Vegetarisch"] } },
      "fields": ["class", "contact"],
    },
  ],
}
```

Six of the seven lists are arrays of names. `programs` is the one that is not, because a program
carries its required equipment (US-5); the shared CRUD reads a name off an item rather than
assuming the item is one.

### What does not sit in it

One thing does not, and cannot: the invitation token of US-23.

```
invitations/{token}   resolved server-side; readable by nobody through the access rules
```

A token is a secret. Firestore's access rules are per document, so a token stored as a field of
the event series document is readable by everyone the document is readable by — and a secret with
that property is not a secret. It therefore lives in a collection of its own that no client may
read at all, and is resolved by the Route Handler behind the link.

Everything else is in the document, saved reports included, and any signed-in user may read it.
That is a decision rather than an oversight: a rule grants a whole document or none of it, so
letting a student's registration form subscribe to the lists lets them read the saved reports
too. It is accepted, because a saved report holds a name, a filter and a set of field keys — no
student's answers, and nothing a student can write. See Q1.

### The registration document

```jsonc
// eventSeries/{eventSeriesId}/registrations/{upn}
{
  // Identity: the one reference the record keeps, because access rules must be able to say
  // "yours" about it. Everything a reader needs is beside it rather than behind it.
  "studentUpn": "anna.mueller@student.htldornbirn.at",
  "firstName": "Anna",
  "lastName": "Müller",
  "email": "anna.mueller@student.htldornbirn.at",

  "isIncomplete": true, // recomputed by the server on every write, including a cascade
  "isAttendingSportsWeek": true,

  // Values chosen from the event series' lists, held by name. Kept in step by US-24.
  "event": "Woche 2", // was eventId; null while unassigned
  "class": "2bWI", // set from the invitation link, not answered by the student (US-23)
  "program": "Ski",
  "skillLevel": "Fortgeschritten",
  "busPickupPoint": "Bahnhof Bregenz",
  "foodOption": "Vegetarisch",
  "seasonPassOption": "Keine",
  "rentedEquipment": ["Ski", "Helm"],

  // Answers the student owns outright, unchanged from US-11.
  "foodOtherText": null,
  "dateOfBirth": "2009-04-17",
  "gender": "female",
  "phoneNumber": "+43...",
  "emergencyContact": { "firstName": "…", "lastName": "…", "relationship": "mother", "…": "…" },
  "healthNotes": "",
  "hasMedication": false,
  "equipmentRentalNeeded": true,
  "shoeSize": "41",
  "heightCm": 168,
  "weightKg": 58,
}
```

### What is deleted outright

- The `seasons`, `events`, `programs`, `classOptions`, `skillLevels`, `busPickupPoints`,
  `foodOptions`, `seasonPassOptions` and `savedReports` collections.
- `Season.isActive` as it stands: the exclusivity, the guards that enforced it and the activation
  transaction all go. `isOpenToStudents` takes its place in name only — it answers a different
  question and carries no exclusivity (US-19, Q19).
- `src/lib/master-data/usage-guard.ts` in full, `GET /api/master-data/[category]`, the
  `useUsageReport` hook, and the hints `IN_USE_HINT`, `CHILD_IN_USE_HINT`, `USAGE_PENDING_HINT`,
  `ARCHIVED_DATA_UNCHANGED_HINT` and `ARCHIVED_DATA_KEEPS_NAME_HINT`. The one in-use rule that
  survives (Q16) needs none of them: it asks a single question about one list, answered from the
  registrations a teacher already reads, and it carries a hint of its own naming classes.
- `src/lib/master-data/seed-defaults.ts` in full, and the `seedState` collection with it. The
  application seeds nothing: a series is created blank or copied from another (Q9), and what an
  environment starts with is written by the provisioning scripts.
- The `users` join in `src/lib/students/roster.ts`, and with it the teacher's permission to read
  every user record.
- The `events` composite index in `firestore.indexes.json`. A collection group index on
  `registrations` by student UPN takes its place, for the login refresh of US-26.
- `SavedReport.createdByUserId`. A saved report is a remembered selection and nothing else, so
  there is nobody for it to name: it is written on every create and read by nothing.
- `position` on every master data item, event and saved report — an array has an order.
- The `reservedNames` collection and `unique-name.ts`. Master data uniqueness is decided inside
  the document; event series names stay unique through a transactional query on the derived
  `nameKey` (Q14). `normalizeName` survives as what derives that key.

### Naming

English inside, German outside, as always. The entity is `eventSeries` in the code, the
collection, the route segments and every identifier; "Eventreihe" is the label, "Eventreihen" the
plural.

The label is built on the word the interface already uses for the children — "Event", "Events",
"Neues Event" — so an Eventreihe holds Events and a teacher reads the relationship off the two
words. See Q2 for why it is not "Veranstaltungsprogramm" and not "Eventserie".

Note that `seasonPassOption` stays exactly as it is — a season pass is a thing the lift company
sells, not our entity, and renaming it because we renamed something else would be a mistake. Its
German label has since become "Zugangskarte", which takes nothing away from that: a caption is not an
identifier, and renaming one is not a reason to rename the other.

## New user stories

### US-19: Event series replaces the season

As a teacher, I organise the application around event series — a Wintersportwoche, a
Sommersportwoche, a Kulturwoche — so that what the application is about is what the school
actually runs, and so that two of them can be prepared at once.

**Acceptance criteria:**

- The entity a season used to be is an event series, labelled "Eventreihe". The collection, the
  schema, the routes and every identifier are English: `eventSeries`, `eventSeriesId`,
  `/app/event-series`.
- **The exclusive active season is gone.** No series is "the one the application is about": the
  invariant that at most one may be active, the transaction that enforced it, and every empty
  state phrased as "no active season" are removed. Which series a teacher works in is the
  selection of US-20, and which one a student registers in is the invitation of US-23.
- **A series is open to students, or it is not**, and that is a different question entirely from
  the one the old flag answered. While a series is open a student can join it and go on amending
  what they said; while it is not, they can do neither. Any number of series may be open at once,
  which is the point — a Wintersportwoche and a Kulturwoche can both be taking registrations. It
  governs students only: a teacher works in a series whether it is open or not. The flag is
  `isOpenToStudents` (Q19).
- A student who meets a series that is not open is told so, in the one sentence US-23 gives:
  "Derzeit ist keine Veranstaltung freigeschaltet." It is the existing
  `REGISTRATION_NOT_OPEN_HINT`, reworded — one constant, shown by the form, the invitation link
  and the student's own landing page alike.
- **Closing hides nothing a student has already written.** Where a registration exists, it is
  shown read-only beneath that message rather than withheld: a student who filled a form in is
  entitled to see what they said about themselves. Only where there is nothing to show does the
  message stand alone, which is what US-11 does today.
- A series is opened by the invitation link: generating one opens it (US-23), because handing out
  a link and opening the series are one intent rather than two. A teacher can close it at any
  time from the overview page (US-29), and open it again without regenerating the link.
- **Archiving closes, and unarchiving does not reopen.** A teacher who unarchives to look at last
  year does not thereby let that year's students back in; reopening is a separate, deliberate
  act. An archived series is therefore never open, which the server enforces by refusing to open
  one.
- Because archiving implies closed, the student-side check is **one flag rather than two**: a
  student may write when the series is open, and that already excludes every archived series.
- An event series stores its name, whether it is a template, whether it is archived, whether it
  is open to students, whether it holds registrations, its place in the teacher's order, and its
  revision.
- **A template is an event series that can never be opened to students** (US-22, Q21). That is
  the whole of it: it is selected from the header row and scoped like any other, its lists are
  maintained like any other's, and the report, overview and assignment scoped to it show the
  ordinary empty state, because it holds no registrations — exactly as a series created this
  morning holds none. Several may exist, one per kind of week the school runs.
- The server refuses to open a template to students, as it refuses to open an archived series —
  one rule shape, two reasons. It also refuses to write a registration into one.
- A template can always be deleted, because it can never hold registrations and so can never trip
  the rule that makes deleting wait for archiving.
- "Template" and "archived" are independent flags answering different questions, so an archived
  template behaves like any archived series.
- **Event series names are unique**, compared ignoring surrounding whitespace and letter case, as
  every other name in the application is. A rejected name is reported on the name field itself,
  in German, and nothing is saved. It is enforced by a query inside the write's own transaction
  rather than by a reservation document (Q14).
- A teacher can create, rename, reorder, archive, unarchive and delete an event series, from the
  event series list — the one page that is not scoped to the selection, because it is where the
  things the header offers are maintained. It shows archived ones behind the same reveal tag the
  seasons list has today. Creating asks what kind the new one is and where its lists come from
  (US-22); there is no separate duplicate action.
- An event series holding no registrations can be deleted whatever its archive state. One holding
  registrations can only be deleted once it is archived, and its row's delete control is disabled
  until then with a hint saying so.
- The delete confirmation keeps the shape US-4 gave it: asked only where registrations would be
  lost, showing the exact name, requiring that name to be typed back before the delete button
  becomes usable, and stating that this cannot be undone.
- Deleting an event series takes everything belonging to it: its master data, which is in the
  document, and its registrations and saved reports, which hang off it.
- An archived event series cannot be **selected** (US-20), and every editing view acts on the
  selected series — so archiving is what makes a series read-only, rather than a separate rule
  disabling controls one at a time. There is no screen from which its name, its seven lists or
  its saved reports can be changed, because there is no way to put it on one.
- The server refuses those writes as well. Not being reachable through the interface is how a
  teacher experiences it; a client is not a trust boundary, so the handler checks the archived
  flag itself and a bypassed client gets a conflict rather than a write.
- **Archiving reaches the registrations too**, but through the open flag rather than a rule of
  its own: archiving closes the series, and a closed series refuses every student write. There is
  no archived flag on a registration, exactly as US-4 already computes a record's archived state
  from its season rather than storing one.
- Its place in the teacher's order is not part of that, exactly as US-4 already says for seasons:
  ordering describes how a teacher wants to look at the list, not what a series is.
- Archiving is unconditional: a series can be archived whether or not it holds registrations, and
  whatever else is true of it. Archiving an empty series is admittedly close to meaningless — a
  series nobody needs is better deleted — but that is the teacher's call to make, not a rule's
  (Q5).
- Archiving and unarchiving are **routine, unceremonious actions**: one control each, no
  confirmation, no name to type back. They have to be, because unarchiving is how a teacher looks
  at an archived series at all (Q6). The ceremony belongs to deleting, which is the irreversible
  one.
- Unarchiving returns a series to every teacher's header and makes its lists editable again. It
  does **not** reopen it to students, so reading last year never lets last year's students back
  in — which is what makes unarchiving cheap enough to be the way an archive is read (Q6).

### US-20: The header says which event series I am working in

As a teacher, I choose the event series I am working in from a tag list in the application
header, so that every page I open is about that series and no page has to ask me again.

**Acceptance criteria:**

- The header carries **two tag rows** immediately after the application title "Sportsweek", each
  in the order the teachers dragged them into (see Ordering):
  - the **upper row** holds the event series that carry data — every one that is neither archived
    nor a template;
  - the **lower row** holds the templates (US-19, Q21).
- **Each row wraps onto further lines rather than scrolling sideways**, so a school with many of
  either can still see all of them. The two rows stay two rows however tall each becomes.
- The lower row is **absent, not empty**, where there are no templates, so a school that never
  makes one never sees a space set aside for them.
- A selected series tag is drawn in the accent colour, as every selected tag in the application
  is. A selected **template** tag is drawn in grey instead. Both are in the base palette (see
  Design Guidelines), so this introduces no colour — it distinguishes at a glance what carries
  student data from what is only a pattern to copy.
- **Exactly one tag is highlighted across both rows**, because exactly one thing is scoped:
  selecting a template releases the series, and selecting a series releases the template.
- Colour is not the only thing that says which row a tag is in — its position does, and each row
  carries an accessible name ("Eventreihen", "Vorlagen") so the distinction survives for a reader
  who has neither.
- **A tag whose series is open to students carries an icon** (US-19), so a teacher standing on any
  page can see which series are taking registrations. Several may be open at once, and that is
  precisely the state that is easy to lose track of — a Kulturwoche left open through the summer
  is invisible otherwise. It is an icon rather than a third shade because colour is already spoken
  for: accent says selected, grey says template, and a further tone would have to be told apart
  from both. The icon carries an accessible name, so the state is not left to sight alone.
- **Archived series are in neither row.** A template is offered because the row is the scope and
  a template's lists are maintained through it (Q21); an archived series is not, because it is
  read-only and nothing read-only is selectable (Q6).
- Archiving therefore does two things at once: it takes a series out of the header, and by doing
  so it takes away every screen that could edit it or show it (US-19). There is no read-only
  selection and no view has a read-only mode.
- Reading an archived series means unarchiving it, looking, and archiving it again (Q6). Its
  master data can be had without that, by creating a new series from it (US-22).
- Pressing a tag selects it, and the two rows are the only way to choose what is scoped.
- Every teacher view — report, assignment, overview, and each of the seven maintained lists —
  is about the selected event series and nothing else. There is no second place to choose one.
- The selection survives navigation and a reload.
- Selecting another series while a page is open re-scopes that page rather than navigating away
  from it: the teacher asked a different question about the same view, not for a different view.
- With no event series at all both rows are gone and every teacher view shows an explicit empty
  state pointing at the event series list, in place of the "no active season" states US-12 and
  US-13 show today.
- A series that is archived or deleted by another teacher while it is selected leaves the
  selection empty rather than leaving a stale series on screen, and says so.
- Students never see either row. They manage no series and reach a registration through an
  invitation link (US-23).
- The tags are the application's one tag component, the same one the filter, field and saved
  report rows use.

### US-21: Master data belongs to the event series and is stored in its document

As a teacher, I maintain the events, programs, classes, skill levels, bus pickup points, food
options and season pass options of one event series, so that a Kulturwoche is not made to share
its lists with a Wintersportwoche.

**Acceptance criteria:**

- The seven maintained lists are fields of the event series document, stored as ordered arrays.
  None of them is a collection any more.
- Events join the master data section as the seventh list. Reaching them is no longer a step
  inside a season's row; they are maintained like any other list, for the selected series.
- An item's identity is its name. There is no id beside it, because the name is already unique
  within its list, and because the values registrations and saved reports hold are names.
- The array order is the teacher-defined order (see Ordering). No item carries a `position`.
- Uniqueness within a list is decided in the document rather than through a reservation: the
  whole list is present in the transaction that writes it, so a duplicate is a comparison and not
  a query. Names of two different lists may still coincide, and required equipment is still
  unique only within its own program.
- Every write to a list — add, rename, remove, reorder — is one transaction on the one document,
  so it is atomic, and two teachers editing two different lists cannot lose one another's work.
- A Route Handler takes the intent ("rename this item of this list to that") rather than the
  document the client happens to be holding, so a stale client cannot overwrite a list it never
  saw.
- Any signed-in user may read an event series document, because a student's registration form
  chooses from its lists and subscribes to them live. A rule grants the whole document, so a
  student can also read the saved reports in it; that is accepted rather than overlooked, and
  Q1 says why. Nobody writes the document from a client.
- The in-use restriction of US-5 to US-10 is withdrawn, with **one exception**: an item of a
  non-archived series may be renamed at any time, and removed at any time _unless_ it is a class
  that some registration of that series holds (Q16). What an edit does to the registrations and
  saved reports holding it is US-24 and US-25.
- The exception is as narrow as it can be stated: **classes only, removal only, one series only.**
  Everything that enforced or explained the old restriction is still deleted, because the surviving
  rule asks one question about one list and a teacher already reads every registration of the
  selected series — so which classes are in use is derived from data on hand rather than fetched.
- **A newly created event series is blank.** Every list is empty and the application seeds
  nothing into it (Q9): it cannot know whether it is being asked for a Wintersportwoche or a
  Kulturwoche, and guessing wrong is worse than not guessing. Starting from something instead of
  from nothing is what naming a source at creation is for (US-22). The once-ever global seeding,
  its `seedState` marker and `seed-defaults.ts` are removed altogether, which also stops a
  teacher's first sign-in writing master data as a side effect.
- **An empty list is a question the student is never asked.** A series with no programs does not
  ask which program; one with no skill levels does not ask for a skill level; and so on for every
  list. This is what lets one application serve a Kulturwoche as well as a Wintersportwoche
  without a single setting deciding which questions apply — the lists already say, by being there
  or not. A teacher shapes the form by filling lists in, which is the thing they were going to do
  anyway.
- The rule follows the taxonomy of Q4 exactly: **a list value is asked only where its list has
  entries; the answers the student owns — attendance, date of birth, gender, phone, emergency
  contact, health — are always asked.** Nothing else needs deciding, and there are no exceptions:
  food's permanent "Sonstiges" is an answer rather than a list item, so it is offered only
  alongside a non-empty list and cannot keep the question alive on its own (Q22).
- Consequences that have to move with it, because a question nobody was asked cannot be missing
  or reported on:
  - **Completeness is computed against the series' lists**, not against a fixed set of fields.
    `missingAnswers` becomes a function of the registration _and_ what its series asks.
  - **The report offers only the fields its series asks for.** A field tag for a question nobody
    was asked would add a detail line reading "keine Angabe" for every student, which is noise
    wearing the shape of data.
  - **The statistics leave out what has no dimensions**, so a series with no programs and no
    skill levels shows no skill matrix rather than an empty grid.
  - Filters need nothing: a category with no options offers no tags, and a category with no tag
    selected already restricts nothing (US-12).
- Equipment rental was already conditional on the chosen program having required equipment
  (US-11); it now sits behind a second condition, since a series with no programs asks no program
  question and so can have no rental question either.
- A program's required equipment is unchanged in every other respect: a list on the program,
  capped at `MAX_EQUIPMENT_ITEMS`, ordered by dragging, rewritten whole.
- Because one subscription to one document now carries every list and every saved report, the six
  `useMasterData` subscriptions, the `useEvents` subscription and `useSavedReports` collapse into
  one.

### US-22: A new event series is a series or a template, blank or copied

As a teacher, I say at the moment I create an event series what kind it is and where its lists
come from, so that next year's Wintersportwoche begins with the setup I keep for exactly that
purpose — and so that there is one way to make a series rather than several.

**Acceptance criteria:**

- Creating asks three things: the **name**, the **kind** — an event series or a template (US-19) —
  and the **source**: blank, or a copy of any existing series or template.
- **There is no separate duplicate action and no separate "make a template" action.** Both are
  answers to questions creation already asks, so the event series list carries one control rather
  than three, and every path shares one dialog, one validation and one write.
- The four combinations all mean something and all work: a blank series, a series from a
  template (the ordinary case), a series from last year's series, and a template from a series —
  which is how a setup that turned out well becomes the thing next year starts from.
- **Any series or template may be the source, archived ones included.** This is what keeps
  archiving from being a one-way door: an archived series cannot be selected and so cannot be
  edited (US-19, US-20), and naming it as a source is how its lists come back into something that
  can be. Filing a series away therefore never means losing the master data in it.
- The source list marks which of its entries are templates and which are archived, in words
  rather than by colour, which is already spoken for (see Design Guidelines).
- Copying takes the seven maintained lists whole and in their order, each program with its
  required equipment.
- It takes **no registrations, no archive state and no invitation link**, whatever the source was.
  A fresh link is generated on demand (US-23), because a link that still pointed at the source
  would enrol students into the wrong series.
- A copy is never a template because its source was one, nor a series because its source was one.
  The kind is answered on its own, so a template copied from a template is as ordinary as a
  series copied from a template.
- The name is asked for and validated the same way whatever kind and source are chosen (US-19),
  since names are unique across series and templates alike — they share one list, so two things
  called the same thing would be ambiguous in the very dialog that offers them as sources.
- **The saved reports are copied too** (Q10), and each is pruned as it is copied: a filter tag
  naming something the copied lists do not offer is dropped in the same write, exactly as US-25
  drops it when an item is removed. A copy is therefore consistent with its own lists from the
  moment it exists, rather than relying on the report view to overlook the difference later.
- A new series or template goes to the end of the teacher's order (see Ordering).
- Creating is one atomic write: either the whole thing exists or none of it does.
- Whether saved reports are copied along with the lists is Q10.

### US-23: A teacher invites students to an event series with a link

As a teacher, I hand out a link that enrols students in one event series, so that registration
opens for the event I am running rather than through an application-wide switch that opens it for
everybody at once.

**Acceptance criteria:**

- **A link names an event series _and_ a class**, so a teacher hands out one link per class rather
  than one per series. That costs the teacher an invitation per class; what it buys is that a
  student never chooses their own class, and so can never pick the wrong one.
- **The class is therefore not an answer.** It is set from the link and owned by the server,
  alongside the name and e-mail of US-26; the form **shows it read-only**, beside the series it
  belongs to, the student's own name and e-mail and the event they are assigned to — the band of
  facts the form states rather than asks. A student sending one is refused, as with every
  server-owned field.
- Because it is not theirs to give, it is also not theirs to get back, which is what forbids
  removing a class any registration holds (Q16). The one way a class changes after registration is
  another link (Q20).
- This is worth more than the convenience suggests: the class is the dimension the per-class
  cards, the assignment board and every grouped figure are built on (US-12, US-13). One student
  picking "3bWI" when they meant "3aWI" quietly falsifies both classes' numbers, and nothing in
  the application would ever show that it had happened.
- **A series with no classes has no link to generate, and so cannot be opened.** That is the
  structural version of a rule US-11 states today as a check — a student cannot usefully register
  before the teacher has set up a class — and it now holds because there is nothing to hand out
  rather than because something refuses.
- **The links are handed out from the overview page** (US-29), which already lists the classes of
  the selected series, one card each. Each class card's header carries the controls for that
  class's link — copy it, or show it as a QR code — so a teacher setting registration up reads
  down the same list of classes they are about to invite.
- Generating the first of them **opens the series to students** (US-19): handing out a link and
  opening the series are one intent, so they are one action, whichever control produced the link.
- The link names the event series by an unguessable token rather than by its id, so that holding
  one link tells the holder nothing about any other.
- The token is generated from a cryptographically secure random source and is long enough that
  guessing is not a strategy.
- Each class's link is regenerated on its own, which invalidates only that class's previous link.
- **A link is cascaded like anything else that holds a list value** (US-24): renaming a class
  rewrites the class its links name, and removing a class invalidates them, because a link into a
  class that no longer exists could only produce a registration with no class. Invitations are
  the third thing a list change reaches, after the registrations and the saved reports.
- The link selects an event series and does nothing else. It signs nobody in and grants no
  identity: a student following it still signs in through Entra ID (US-1) and still has the role
  their UPN domain gives them (US-3).
- Following the link as a signed-in student opens that series' registration form (US-11); the
  registration itself is created on the first save, as it is today.
- **A link never leads to a choice.** It names one series, so a student following it goes there
  whatever else they hold registrations in (Q7). Asking which series they meant, when they have
  just said, would be asking them to repeat themselves.
- A student who already has a registration in that series and follows the link again is taken to
  that registration rather than being given a second one.
- **The link is needed once.** It is how a student _joins_ a series, and joining happens once:
  afterwards they reach their registration by signing in, and the application takes them to it
  (Q7). Following the link again still works and is simply not necessary, so a student who loses
  it is not locked out of what they wrote.
- That is what the link's secrecy is protecting, and it is worth being precise about: **a token
  guards enrolment, not the student's own data.** What keeps a registration private is the
  identity that owns it (US-26), which is why a leaked link can produce an unwanted registration
  (US-28) but can never expose an existing one.
- **Regenerating a link evicts nobody.** It stops the old token producing new registrations; the
  students who already used it keep theirs and go on reaching them by signing in. Regenerating is
  how a teacher stops a leaked link being used again, not how they undo what it has already done
  — that is deleting the registration (US-28).
- The teacher can regenerate the link, which stops the previous one working and leaves the series
  open.
- **Closing a series to students is how registration is closed** (US-19), not a separate
  "withdraw the link" action. A closed series refuses every student write, a first registration
  included, so the link stops working for that reason and no second mechanism is needed. Two
  controls for one decision would be two answers to the same question. Opening it again needs no
  new link.
- A link that leads nowhere — mistyped, superseded by a regenerated one, naming a series that is
  closed, archived or deleted — is refused with one German message for all of those cases, so
  that a caller cannot tell which of them applies:
  **"Derzeit ist keine Veranstaltung freigeschaltet."**
- The message says "Veranstaltung", not "Sportveranstaltung" as the existing string does. A series
  may be a Kulturwoche, so naming it a sports event would be wrong for the very case this
  refactoring exists to allow — the same reason "season" had to go.
- It is one message for a second reason as well as the security one: to a student the situation
  is the same in every case — there is nothing here to fill in. Naming which of the five reasons
  applies would tell them something they can do nothing about.
- The wording says "derzeit" rather than the "noch" the existing string uses, because a series
  can now be closed after having been open. "Noch keine" claims it has not started yet, which is
  wrong half the time.
- The token is never readable through the database's access rules. It is resolved server-side by
  a Route Handler, which is also where the refusals above are decided.
- **A teacher who follows a link is taken to the dashboard**, scoped to the series the link names
  (Q12). They are not registered and are told nothing: the commonest teacher to follow a link is
  the one who made it, checking it before sending it out, and a refusal would be a message for
  somebody who has done nothing wrong.

### US-24: A change to a list reaches the registrations that hold it

As a teacher, when I rename or remove an item, the registrations holding it are brought into
line, so that no registration is left holding a value its event series no longer offers.

**Acceptance criteria:**

- Renaming an item rewrites that value in every registration of the same event series that holds
  it. A class renamed from "3aWI" to "3AWI" is what the report, the assignment board, the filters
  and every export then show, none of which has to know the old name.
- Removing an item clears that value from every registration of the same event series that holds
  it. The registration itself is kept: a student whose program was removed has no program, not no
  registration.
- Removing a program also clears the rented equipment of the students who chose it, because a
  rental is only meaningful as an entry of that program's list. Renaming a required equipment
  item rewrites the rentals naming it; removing one drops it from them.
- Removing an event unassigns the students assigned to it, which is what US-4 already requires
  and is now the same rule as every other removal rather than a special case.
- **A class that any registration holds cannot be removed** (Q16). It is the one list value a
  student cannot be asked for again, because it comes from the invitation link rather than from
  them — so clearing it would strand the registration outside every class, permanently. Renaming
  is always allowed and cascades like anything else; removal is refused while the class is in use,
  and the row's remove control is disabled with a hint saying so.
- **The invitation links are cascaded too** (US-23): renaming a class rewrites the class its
  links name, and removing a class invalidates them. A link is the third thing that holds a list
  value, after a registration and a saved report, and it would otherwise go on enrolling students
  into a class that no longer exists. Removing a class that has links but no registrations is
  therefore still allowed — nobody used them, so nothing is lost.
- Every registration the cascade touches has its outstanding-answers flag (US-11) recomputed,
  since clearing a value can only make a registration less complete.
- The cascade is scoped to the event series whose list changed and reaches no other. That is
  precisely what moving master data into the series bought, and it is what makes the withdrawal
  of the in-use rule safe.
- No cascade can ever arise from an archived event series, because it cannot be selected and so
  its lists cannot be edited (US-19, US-20). This is not a case the cascade has to exclude — it is
  a case that cannot occur.
- The invariant this exists to preserve, stated so it can be tested: on a non-archived series,
  every list value on every registration is either unanswered or one the series currently offers.
  The cascade is one half of holding it, and US-27's validation of a student's save is the other.
- Before confirming a removal the teacher is told what it will do, including how many
  registrations will lose the value, so that a destructive edit is a decision and not a surprise.
  A rename says the same thing in the terms a rename deserves: how many registrations will be
  rewritten.
- **Removing the last item of a list says so too**, because it does more than clear a value: the
  question stops being asked altogether (US-21), and every registration that answered it becomes
  one answer shorter rather than one answer poorer.
- The cascade is not atomic with the edit that caused it. US-27 is what makes it safe anyway.

### US-25: A change to a list reaches the saved reports that filter on it

As a teacher, my saved reports go on meaning what I saved them as when the lists they filter on
change, so that opening one shows the report rather than a report widened by tags that quietly
stopped matching.

**Acceptance criteria:**

- Renaming an item rewrites that tag in every saved report of the same event series that selects
  it.
- Removing an item removes that tag from every saved report of the same event series that selects
  it. A report left with no tag in that category simply stops restricting by that category, which
  is what an empty category already means (US-12).
- The event filter tag holds the event's name rather than its id, so that removing or renaming an
  event is the same rule as every other category. It is the only tag storing an id today, and
  with it goes the `ReportFieldContext` that existed to translate ids back into names.
- The activated field tags are not master data and are never touched by a cascade.
- Saved reports belong to one event series and are stored in its document, beside the lists they
  filter on: they are created in it, listed only while it is selected, deleted with it, and their
  order is the array's. That is also what makes this cascade cheap — a rename rewrites the lists
  and the reports that filter on them in the same transaction, so the two can never disagree,
  which the cascade into registrations (US-24) cannot promise.
- A saved report is a selection that was remembered, and nothing else: a name, a filter and a set
  of field keys. It names nobody and records nothing about how it came to exist.
- Opening a saved report stays as tolerant as US-13 requires: a tag nothing offers any more
  restricts nothing, and a field key nothing offers adds no detail line. The cascade and the
  tolerance are both kept and neither replaces the other — the cascade is what stops a rename
  silently widening a report, the tolerance is what keeps a report saved by an older release
  readable.
- The same pruning runs **when a report is copied into a new series** (US-22, Q10): a tag the
  copied lists do not offer is dropped there and then. Copying and removing are the same
  situation from the report's point of view — a value its series does not have — so they get the
  same treatment rather than one being left to the reader.

### US-26: A registration is self-contained

As a teacher reading a report, every answer I need is on the registration itself, so that the
report is one read rather than a join, and so that a registration stays readable whatever happens
to the records around it.

**Acceptance criteria:**

- The registration carries the student's first name, last name and e-mail address. The report,
  the assignment board, the overview and both exports read them from the registration and never
  join to `users`.
- Those three fields are owned by the server. They are written from the session on every save and
  refused on the way in, so a student cannot type a name into their own record — which is the
  same rule US-11 already applies to the fields the server owns.
- **Signing in refreshes them.** US-1 already reads the names from the directory on every login
  and corrects the user record; the same step now carries the correction into that student's
  registrations, so a copy can never be more than one login out of date. This is what makes the
  copy safe: the record is not a snapshot that drifts, it is a copy with a scheduled repair.
- Only a field that actually differs is written. A login that changes nothing writes nothing, so
  signing in does not bump every registration a student holds and wake every teacher's
  subscription to say so.
- Registrations in an archived event series are left alone, because an archived series is
  read-only in everything it holds (US-19). A name in last year's report is a record of what was
  true then.
- Finding a student's registrations across every series is a collection group query on
  `registrations` by the student's UPN, which needs a collection group index. It is the one index
  this refactoring adds, against the one it removes.
- The registration names the event it is assigned to by name rather than by id, so that it holds
  no identifier that means nothing on its own.
- The registration keeps exactly one identifying field: the UPN of the student it belongs to.
  Self-containment is about the data a reader needs, not about ownership: the access rules have
  to be able to say "yours" about a record, and a record naming nobody can be owned by nobody.
  See Q3.
- There is one registration per student per event series, and it is reached without a query:
  where it is stored is derived from the two.
- Which event series a registration belongs to is where it is stored rather than a field it
  carries.
- A teacher reads every registration of the selected event series. A student reads their own and
  no other, and neither writes one directly — every write goes through a handler, as today.
- With the join gone, teachers no longer read the `users` collection at all, and the rule that
  let a teacher read every user record is narrowed to reading their own. The fake login's list of
  existing users (US-16) is unaffected: it is already read server-side.

### US-27: Concurrent writes are serialised and cascades are resumable

As the system, I keep one event series consistent while several teachers and a class full of
students write to it at the same time.

**Acceptance criteria:**

- Every write to an event series' lists is a transaction on its document, so two edits to two
  different lists cannot lose one another and two edits to the same list are ordered. The saved
  reports are in that document, so the cascade of US-25 is part of the same transaction as the
  edit that caused it and needs nothing below.
- The event series carries a revision that every write increments. Anything that depends on what
  the lists currently say — a student saving a registration, a teacher assigning students, a
  cascade — reads it, and is retried rather than committed if it moved underneath.
- The cascade into the registrations (US-24) is the one that cannot join that transaction, because
  the registrations are documents of their own and there may be hundreds of them. An edit that
  needs one records on the event series, before it starts, what changed: which list, what the
  value was, what it became or that it went, and at which revision.
- While that record stands, further edits to that event series' lists are refused with a conflict
  and the interface says so through the application's shared spinner and busy region, as it
  already does while an assignment or a saved report is being written. That refusal is the lock,
  and it is held in the database, so it holds across tabs, teachers and processes rather than
  only within one client.
- The cascade is expressed as "wherever this value is still the old one, make it the new one",
  which makes it idempotent: running it a second time changes nothing the first run did not.
- The cascade is performed in bounded batches and records how far it has got, so an interrupted
  run is resumed rather than restarted, and no run is bounded by how many registrations an event
  series holds.
- **What runs it is a Firestore trigger on the event series document** (Q15), so the fan-out
  outlives the request that caused it and is retried by the platform rather than by a person.
- **The trigger acts on stored state, never on the event's payload.** It re-reads
  `pendingCascade` in a transaction and works from that; the `before`/`after` deltas are not
  consulted. This is what makes at-least-once delivery and out-of-order delivery both harmless,
  and it is the one implementation rule that cannot be relaxed — a delta applied out of order
  would corrupt rather than merely lag.
- Ordering cannot arise in any case, because the lock permits **at most one cascade record per
  series at a time**. There is never a second cascade to arrive before the first.
- The trigger returns immediately where the document carries no pending cascade. That one
  condition is also what stops it recursing when the cascade clears the lock, and what keeps a
  reorder or a saved report edit from starting anything.
- **The progress write is what schedules the next batch**, since it is itself a write to the
  document the trigger watches. There is no queue and no scheduler, and no continuation is passed
  anywhere.
- `pendingCascade` carries an **attempt count**, and the cascade stops after a fixed number of
  them, so a batch that can never succeed comes to rest instead of looping for ever.
- A cascade that cannot be finished leaves its record standing rather than clearing it, so the
  inconsistency is visible and retriable instead of silent, and the event series list says which
  series is in that state — with a control on that row to resume it, which resets the attempt
  count.
- **A pending cascade never blocks a class.** It refuses list edits, not registrations: a student
  saving validates against the lists, and those are already correct, since the list edit committed
  in the first transaction and only the fan-out is outstanding.
- A student saving a registration has every list value validated against the event series as it
  stands in the same transaction. A value the series no longer offers is refused rather than
  stored, which closes the window in which a save races a removal.
- Deleting an event series, and creating one from a copy, take the same lock, so neither races a
  cascade.

### US-28: A teacher removes a registration

As a teacher, I can delete a single registration, so that somebody who joined through a link that
reached them by mistake does not stay in the series for good.

**Acceptance criteria:**

- The need comes from the links themselves: an invitation names a class rather than a student
  (US-23), so it can be forwarded, pasted into a group chat, or used by somebody it was never
  meant for. Without a way out, one stray registration is permanent.
- **It is done from the overview page** (US-29), which is scoped to the selected series and lists
  every registered student of it, attending and not attending, grouped by class. That is why it is
  the right page and not the assignment board: the board shows only the students who are attending
  (US-12), so a wrongly-registered student who answered "no" would never appear on it.
- The control lives on the student's tag and follows the pattern the saved report tags already
  set (US-13): pressing a tag marks it, and the controls appear on the marked tag only,
  permanently rather than revealed by a hover a teacher has to discover.
- Deleting asks for confirmation in a warning dialog (see Design Guidelines) naming the student,
  stating that their answers go with the registration and that it cannot be undone. It does
  **not** ask for the name to be typed back, as deleting a whole series does (US-19): this is one
  record, and its name is already on the screen in front of the teacher.
- What is destroyed is somebody else's work, which is what makes this heavier than the inline
  confirmation a teacher's own saved report gets, and lighter than the ceremony a whole series
  gets.
- **Only a teacher may do it.** A student cannot delete their own registration; a student who is
  not coming answers "no" (US-11), which keeps their answers and keeps them in the figures.
- Deleting is possible whether or not the series is open to students, because closing governs
  students only (US-19). It is not possible in an archived series, which is read-only.
- The registration's id is derived from the series and the student (US-26), so deleting frees
  that id: a student removed by mistake can register again through the same link, and one removed
  on purpose is kept out by regenerating the link (US-23).
- **`hasRegistrations` is recomputed in the same transaction.** Deleting the last registration of
  a series puts the mirror back to false, which is the first time it has ever had to go down
  (Q5) — and it is what the archive and delete controls of US-19 read.
- A delete that races a running cascade is harmless: the cascade is expressed as "wherever this
  value is still the old one" (US-27), and a document that is gone simply is not among them.

### US-29: The overview page is where an event series is run from

As a teacher, I open one page that shows me the classes of the series I am working in, hands out
the invitation links for them and says whether students may register at all, so that setting a
series up is one place rather than three.

**Acceptance criteria:**

- **The statistics page becomes the overview page.** `/app/statistics` becomes `/app/overview`,
  `ROUTES.statistics` becomes `ROUTES.overview`, and the navigation entry reads "Übersicht"
  rather than "Statistik". The rename is the point rather than a tidy-up: the page stopped being a
  set of figures the moment it became where a series is opened and where its classes are invited.
- It is scoped like every other teacher view — by the header tag row (US-20) — and chooses nothing
  itself. Which series it is about is settled above it, and selecting another re-scopes it.
- It lists **one card per class** of the selected series, as it does today: the students of that
  class, attending and not, and that class's figures.
- **The title line carries a tag that opens and closes the series to students.** It is the
  application's one tag component with `aria-pressed`, reading "Anmeldung freigeschaltet" when the
  series is open and "Anmeldung nicht freigeschaltet" when it is not — Q19's two labels with the
  noun they are about, since a bare "Freigeschaltet" in a title line does not say what is.
- Pressing it is the whole of closing registration (US-19). There is no second control anywhere
  else: two controls for one decision would be two answers to the same question.
- The tag is **absent rather than disabled** where the series can never be opened — a template
  (US-22), and an archived series, which cannot be selected at all (US-20). A page that offers to
  open what cannot be opened is a page explaining a refusal it did not have to make.
- **Each class card's header carries that class's invitation controls** (US-23): copy the link,
  and show it as a QR code. A class with no link yet gets one on the first press, which opens the
  series (US-19).
- **The QR code is what removes the mailing step.** A teacher projects it and the class scans it,
  which is quicker than any list of addresses and reaches the students who never read school mail.
  It encodes the same link, so everything US-23 says about the token holds unchanged: regenerating
  invalidates it, and closing the series stops it working.
- The QR code is rendered **in the browser**, never fetched from an image service. A token in a
  URL handed to a third party is a token that third party holds, and holding the token is the
  whole of what enrols somebody.
- **It is shown on a surface of its own, carrying the code and nothing but what the code is for.**
  The event series name and the class name sit with it; the application chrome does not. The
  students in the room are about to register for that series and that class, so naming both is the
  point rather than a leak — what is withheld is the rest of the application, not the identity of
  the thing being registered for. The header tag row would otherwise name every series the school
  runs, and the navigation would show a room full of students a teacher's tools.
- The code is centred and sized to the screen it is being shown on, and the only control on the
  surface is a cross that closes the view.
- Naming both is also what guards the mistake US-23 exists to prevent: a teacher projecting an
  invitation reads the class off the same screen the room is looking at, rather than trusting the
  card they pressed a moment ago. Getting that wrong enrols one class into another, and nothing
  else on the screen would say so.
- Everything beyond those two names stays off it, for the reason the code has to scan at all: a
  projector has poor contrast and a phone camera focuses on whatever it finds first, so a quiet
  field around the code is the difference between a class scanning it once and a class scanning it
  three times.
- Escape closes the view as well as the cross, and the cross carries an accessible name — it is
  the one control on the surface, and a control nobody can name is one a screen reader cannot
  offer.
- **A projected code is more exposed than a mailed link**, and that is accepted rather than
  overlooked: anyone in the room, or looking through the door, can scan it. What it costs is a
  registration that should not exist, which US-28 deletes and a regenerated link (US-23) stops
  from recurring. What it buys is a class registered in the time it takes to scan.
- Deleting a registration stays on this page (US-28), for the reason it was put there: it is the
  only view that lists every registered student, attending or not.

## Existing stories affected

| Story                   | What happens to it                                                                                                                                                                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US-1                    | Provisioning gains one step: the names it refreshes at every login are carried into that student's registrations (US-26).                                                                                                                                                                                               |
| US-2, US-3              | Unchanged.                                                                                                                                                                                                                                                                                                              |
| US-4                    | Rewritten as US-19 and US-21. The active season, its transaction and its empty states go; the delete and archive rules survive, the archive gate loosens.                                                                                                                                                               |
| US-5 to US-10           | Kept as descriptions of the seven lists. The in-use restriction preceding them is withdrawn and replaced by US-24 and US-25. Storage moves (US-21).                                                                                                                                                                     |
| US-11                   | The season becomes the event series the invitation named, and the class comes from that invitation rather than being answered (US-23). **A question whose list is empty is not asked at all** (US-21). List values stop being snapshots and become references the server keeps in step (Q4). Self-containment is US-26. |
| US-12                   | Scoped to the selected event series rather than the active season. `eventId` becomes `event`. Otherwise unchanged.                                                                                                                                                                                                      |
| US-13                   | Scoped to the selected event series. Saved reports become per series (US-25). The tolerance on opening a saved report is kept.                                                                                                                                                                                          |
| US-14                   | The header gains the event series tag row (US-20). Master data gains an "Events" sub-item, and the seasons sub-item becomes the event series list — the one page under it that is not scoped. The "Statistik" entry becomes "Übersicht" (US-29).                                                                        |
| US-15                   | A student may hold registrations in several series, but is asked to choose only when more than one is **open**; otherwise they go straight in (Q7).                                                                                                                                                                     |
| US-16                   | Unchanged. It substitutes the identity provider and touches nothing this refactoring moves.                                                                                                                                                                                                                             |
| US-17, US-18            | Unchanged in shape; both read a registration that no longer needs a join.                                                                                                                                                                                                                                               |
| Ordering, Drag and Drop | Unchanged as rules. What is ordered gains the header tag row and loses `position` as its mechanism.                                                                                                                                                                                                                     |

## Sequencing

The refactoring is too large for one pull request and each slice below leaves the application
working, tested and deployable. Each is red-green-refactor as usual, and the Firestore rules
suite has to grow a denial test for every new path before that path exists.

Nothing is live yet (Q18), so the slicing is for **reviewability** rather than continuity: there
are no users to keep served, and no slice has to survive contact with a running school. Each one
is kept deployable anyway, because that is what stops a half-finished shape being excused by the
slice that was going to follow it.

Two things hold for every slice and are not repeated under each. The gate is the one already
written down — the unit tests, the lint, the type check, the formatter, the licence check and the
rules suite against the emulator, and the problems the editor reports on the files that changed.
The deploy order is the one Q9 sets out: a new index first, a widening rule before or with its
code, a narrowing rule after it.

The environments are reset rather than migrated (Q18), and the moments where they have to be are
the ones that move stored data: slice 1, which renames two collections; slice 2, which changes
where master data lives; and slice 4, which changes where a registration lives and what its id
is. Each is a purge and a reseed with the scripts that already exist.

### 1. Rename only

`seasons` becomes `eventSeries` in the code, the collection, the routes, the labels and the ERD.
No shape change and no behaviour change: this is the diff nobody needs to read closely, and
keeping it separate is what makes the ones that follow readable.

What moves is the whole of `src/lib/seasons/`, `src/components/seasons/`, `src/app/api/seasons/`
and the pages beneath `master-data/seasons/`, together with `seasonId` wherever it appears — in
the `events` index, in the reservation scope, in the seeding script, and in the rules file's copy
of the collection names. `useSeasonRoster` becomes `useEventSeriesRoster`; "Saison" and "Saisons"
become "Eventreihe" and "Eventreihen" (Q2).

**`studentMasterData` becomes `registrations` in the same slice**, because it is the same mistake
and fixing it twice would be worse than fixing it once. What a student fills in was never master
data — master data is the maintained lists a teacher keeps, and the record beside them is one
student's answers for one event series. The module already knew: `EMPTY_REGISTRATION`,
`toRegistrationInput` and `REGISTRATION_NOT_OPEN_HINT` are its own vocabulary, and US-26 calls
the entity a registration throughout. So `src/lib/student-master-data/` becomes
`src/lib/registration/`, `studentMasterDataSchema` becomes `registrationSchema`,
`/app/my-master-data` becomes `/app/my-registration`, and the mirror `hasStudentData` becomes
`hasRegistrations` — the name US-28 gives it when it finally has to go back down.

The German follows: "Meine Stammdaten" becomes **"Meine Anmeldung"**. "Stammdaten" survives where
it is still true — the teacher's maintained lists — which is the whole point of the distinction.

**`seasonPassOption` does not move.** The field, the `seasonPassOptions` collection and the route
segment stay exactly as they are, for the reason given under Naming. It is also what proves the
rename was done by reading rather than by replacing: afterwards the word "season" survives in that
one list and nowhere else. What a teacher reads on screen is no longer "Saisonkarte" but
"Zugangskarte",
renamed on its own account — which is exactly the kind of change that leaves an identifier alone.

### 2. Master data into the document

The seven lists become ordered arrays on the event series document (US-21). `position` and the
item ids go, since an array has an order and a name is an identity; the six `useMasterData`
subscriptions and the `useEvents` one collapse into a single subscription to a single document;
and every list write becomes one transaction on it, taking the intent rather than the list the
client happened to be holding.

The in-use rule of US-5 to US-10 **stays** for this slice, rewritten against the new storage, so
that nothing a teacher can do changes yet. Withdrawing it is slice 3b, where the cascade that
makes withdrawing it safe arrives.

Three things are finished here rather than left half-done:

- **`reservedNames` goes entirely** (Q14), not merely shrinks. Master data uniqueness moves into
  the document, and event series names move to a transactional equality query on the derived
  `nameKey` in the same slice — so the collection has no callers left at the end of it. Keeping
  it alive for one caller would be worse than either shape: a mechanism nobody can see the point
  of, guarded by tests that no longer describe a rule anyone relies on.
- **Seeding leaves the application** (Q9). `seed-defaults.ts` and the `seedState` collection are
  deleted whole, the well-known defaults move into the seeding script, and signing in stops
  writing master data as a side effect.
- **An empty list asks no question** (US-21, Q22), with the consequences that have to move with
  it: completeness computed against the series' lists, the report offering only the fields its
  series asks for, and the statistics leaving out what has no dimensions.

### 3a. The functions codebase

The `functions/` codebase arrives on its own, carrying nothing but the trigger's guard clause and
the test that proves it returns on a document with no pending cascade.

It is separate from 3b because of what it costs rather than what it does: its own dependency tree
and lockfile, a second install and test run in CI, the functions and eventarc emulators beside
the firestore one, a deploy workflow, and **a widening of what the deploy identity may reach** —
Cloud Build, Artifact Registry, Cloud Run and service-account-user, where deploying rules needs
almost none of it. That is the largest real cost of Q15 and the part to review rather than copy
from a template, and it is not reviewable buried under the cascade.

### 3b. The cascade, and withdrawing the in-use rule

US-24, US-25 and US-27 land together, and the in-use machinery goes with them: `usage-guard.ts`,
`GET /api/master-data/[category]`, `useUsageReport`, and the five hints that explained the rule.

The saved reports move into the event series document in this slice rather than the last, because
what makes their cascade cheap is being in the same transaction as the edit that caused it
(US-25) — moving them earlier would mean writing that cascade twice.

What survives of the old restriction is one refusal: a class held by any registration of that
series cannot be removed (Q16). It needs none of the deleted machinery, being a reduce over
registrations a teacher already reads.

This is the slice that needs the concurrency tests, and the invariant of US-24 is the one worth
writing first: after any edit to a non-archived series, every list value on every registration is
either unanswered or one the series currently offers.

### 4. Self-contained registrations

US-26: the name and e-mail fields, the event held by name, the `users` join deleted, and the
`users` read rule narrowed to a caller's own record. A registration becomes a document beneath
the series it belongs to, keyed by the student's UPN, so which series it is in is where it is
stored rather than a field it carries.

This is the slice where the deploy order matters: the collection group index goes first, and the
narrowed `users` rule goes last. Deploying that rule early denies the release still running.

### 5. Dropping the active season

US-20's header selection, the invitation of US-23 and the new `isOpenToStudents` flag land
together. None of the three is any use without the others: removing the old exclusive `isActive`
before the header can select a series and the link can open one would leave registration with no
way to open at all.

It is also the slice that carries Q8's decision into the routes. The selection lives in the URL,
so every teacher route gains an event series segment and `proxy.ts` stops matching teacher pages
by a fixed prefix — which is the largest churn in the slice and the reason it is not sharing a
pull request with anything else.

The statistics page becomes the overview page in the same slice (US-29), because that is where
both of the new controls live: the tag that opens the series and the per-class invitation links.
Renaming it earlier would rename a page for a reason nobody could see yet.

### 6. Creating from a copy, and provisioning

US-22's source choice, which needs everything above: the lists have to be in the document to be
copied, and the invitation link has to exist to be left behind.

The provisioning scripts follow in the same slice, because what production is seeded with is a
template and templates do not exist until now: `seed-students.mts` becomes `seed-environment.mts`
with the mapping of Q9, and `purge-environment.mts` trades its closed list of environments for
the typed-back project id.

### 7. Removing a registration

US-28, which needs the invitation links of slice 5 to have a reason to exist, and which gives
`hasRegistrations` its first false transition.

### 8. The two documents become one

US-19 to US-28 are folded into `spec/requirements.md` by topic and by number, US-4, US-5 to US-10
and US-11 are rewritten as the table above says, the ERD is brought into line, and this document
is deleted. It is a slice rather than a footnote because the merge is where the stale wording in
US-12 is finally fixed, and because a refactoring document left lying beside the requirements it
has already replaced is the next reader's first wrong turn.

## Open questions and inconsistencies

These are the places where the change as described contradicts itself, contradicts a rule already
in `spec/requirements.md`, or leaves a decision that cannot be inferred. Each states the problem,
the options, and what this document assumes in the meantime.

### Model and storage

**Q1 — Students can read the saved reports, and that is accepted. Decided.** Firestore's access
rules grant a **whole document or none of it** — there is no field-level read — and the client SDK
hands a document to anyone the rule admits, whatever the application chooses to draw on screen.
The registration form subscribes to `eventSeries/{id}` for the class and program lists, so the
rule admits students, so a signed-in student can read that document entire, saved reports
included. This was worth deciding rather than discovering, because saved reports are teacher-only
today (US-13) and this quietly ends that.

**Decided: they stay in the document and students may read them.** What a saved report holds is a
name, a filter and a set of field keys: no student's answers, nothing a student can write, and
nothing that is not already visible to a teacher standing at a whiteboard. The alternative —
serving the lists to students through a Route Handler so the document could stay teacher-only —
would have cost the live updates for no proportionate gain.

Two consequences to write down rather than leave implicit:

- The rules test suite asserts this deliberately: a student **may** read an event series document
  and everything in it, and may still write none of it. A test that reads as a leak needs the
  comment saying it is a decision.
- Nothing in the document is about a person, and it is worth keeping it that way. A field added
  later that names a teacher is a field every student in the school can read.

The invitation token is not part of this and never was: it is a secret, and it lives outside the
document regardless.

**Q2 — The German label is "Eventreihe". Decided.** "Veranstaltungsprogramm" was the first
proposal and collides: the application already calls Ski, Snowboard and Alternativ "Programme"
(US-5), and the master data menu already carries that title, so a teacher would meet two
unrelated things under one word three lines apart. It is also long for a header tag row, which is
where this label mostly appears.

Three candidates were weighed:

- **"Eventreihe"** — chosen. `-reihe` is the German head noun for a sequence of events
  (Veranstaltungsreihe, Vortragsreihe, Konzertreihe), so it is Denglisch that shortens a real
  German word rather than replacing one. It is built on "Event", which the interface already uses
  for the children ("Events", "Neues Event"), so an Eventreihe holds Events and the relationship
  is legible from the words alone.
- **"Eventserie"** — the same length and equally clear, but `-serie` belongs to broadcasting and
  manufacturing (Fernsehserie, Serienproduktion) where `-reihe` belongs to events.
- **"Veranstaltungsreihe"** — correct, standard and collision-free, and the fallback if the
  Denglisch is ever regretted. Rejected only for its 19 characters in a row of tags.

**Q3 — The join goes, the identity stays. Decided.** The requirement asked for a registration
with no reference to the user, but access rules decide ownership by comparing something on the
record with the caller's identity: a record naming nobody is a record nobody owns, readable by
everyone or by no one. So self-containment is about the data a **reader** needs, not about
ownership. The registration keeps the student's UPN and drops the join — first name, last name
and e-mail are copied onto it, and no reader touches `users` again.

The copy is kept honest by **rewriting it at every login** (US-26). US-1 already re-reads the
names from the directory each time a student signs in; that step now carries the correction into
their registrations as well, so a name can never be more than one login stale, and a student who
never opens their form again is still corrected the next time they sign in at all. This is also
the answer to Q17.

**Q4 — They are denormalised references the server keeps in step, not snapshots. Decided.** US-11
states at length that a list value is stored "redundantly as plain text, not as a foreign key"
precisely so that "later changes to the maintained list do not alter already-stored master data
records". US-24 says the opposite, and US-24 is what we want. The values keep the same shape —
a name or nothing — but they stop being a record of what was chosen and become a reference whose
spelling the server maintains. **US-11 is rewritten rather than left to contradict US-24.**

Saying it that way is what gives the model an invariant worth testing: on a non-archived series,
every list value on every registration is either unanswered or one the series currently offers.
The cascade exists to preserve it, US-27's validation of a student's save is the other half of
it, and a test can assert it outright after any edit.

It also sorts the registration's fields into three kinds, which is worth keeping straight because
each is repaired by a different mechanism:

| Kind                                                            | Kept honest by            |
| --------------------------------------------------------------- | ------------------------- |
| Answers the student owns (birth date, phone, health, free text) | Nothing — they are theirs |
| List values (class, program, skill level, event, …)             | The cascade, US-24        |
| Identity copies (first name, last name, e-mail)                 | The next login, US-26     |

Archiving then needs no rule of its own to freeze these values. An archived series has no tag in
the header, so it cannot be selected, and every editing view acts on the selected series — so
there is no screen from which its lists can be changed, and no edit that could start a cascade.
Its list values simply stop moving, which makes them exactly the snapshots US-11 used to
describe. Archiving is the point at which a reference becomes a record again.

**Q5 — Any event series can be archived. Decided.** US-4 forbids archiving a season that holds no
student data, on the grounds that archiving signs off on that data. The reasoning behind that
rule is sound as far as it goes — archiving an empty series is fairly meaningless, and a series
nobody needs is better deleted than filed — but it is too marginal a case to be worth a rule.
What the rule actually buys is a refusal a teacher has to read and work around; what it costs is
a special case in the service, a disabled control, a hint explaining it, and a test for each.
**The rule is dropped: archiving is unconditional.**

The knock-on for Q11: today a season with no data cannot be archived, so `hasStudentData` never
has to return to false. That stops being true here on both counts — an empty series can now be
archived, and US-28 lets a registration be deleted, so the mirror needs a false transition too.

**Q6 — Unarchive to look, archive again after. Decided.** Archiving is defined by
unselectability: no tag in the header, no selection, therefore no view can reach it (US-19,
US-20). That settles editing, and it leaves reading with no answer — the report, the assignment
and the figures are all scoped to the selected series, so as stated there is no way to look at
last year at all.

**Decided: a teacher who wants to look at an archived series unarchives it, looks, and archives
it again.** Rejected alternatives were a second read-only kind of selection, which would put back
every disabled-control case that unselectability had just removed, and treating an archive as
write-only with the exports (US-17, US-18) as the only way to keep last year's numbers.

What this buys is that the model gains no concepts at all. There is one notion of selection and
one of archived, `isArchived` stays a plain boolean with no third state, and no view anywhere in
the application needs a read-only mode.

What it costs, stated plainly rather than discovered later:

- **Looking is no longer passive.** A teacher cannot read an archived series without first
  unarchiving it, which is a write. The act of looking therefore changes stored state, which
  reading normally does not.
- **Other teachers see it happen.** The event series list is shared and every header subscribes
  to it live, so the moment one teacher unarchives last year's series to check something, a tag
  for it appears in every other teacher's header, and disappears again when they archive it back.
  Untidy rather than harmful, and accepted because looking at an archive is rare and brief.
- **An unarchived series is editable again, though not open again.** Its lists can be changed by
  any teacher while it sits unarchived, so a teacher who unarchived only to read should archive
  it back when finished. What cannot happen is the serious version of this: archiving closes the
  series and unarchiving does not reopen it (US-19), so reading an archive never lets that year's
  students back in. `isOpenToStudents` is what makes this option safe — without it, looking at
  last year would have reopened last year.
- Archiving and unarchiving are consequently routine actions rather than momentous ones. Neither
  asks for a confirmation, and neither requires the name to be typed back — that ceremony belongs
  to deleting, which is the irreversible one.

Creating from a copy (US-22) covers the other half without any of that: an archived series can be
named as the source for a new one, and that new one is selectable, so the **master data** in an
archive is never stranded. Unarchiving is only needed to reach the registrations — which is the
one thing a copy cannot bring back.

**Q13 — The document fits comfortably; the caps are named rather than discovered. Decided on
size.** One document per event series holds seven lists and the saved reports, against a 1 MiB
limit. With **at most 20 saved reports per series**, which is the working assumption, the budget
is not close:

| Part                                          | Generous estimate |
| --------------------------------------------- | ----------------- |
| Seven lists, a few hundred names between them | 20–30 KB          |
| 20 saved reports, each a name plus a filter   | 30 KB             |
| Everything else on the document               | under 1 KB        |
| **Total against 1 MiB**                       | **under 6%**      |

So the caps exist to keep it that way rather than because anything is tight: **20 saved reports**
per series, and a generous ceiling per maintained list, both in the schema in the spirit of
`MAX_EQUIPMENT_ITEMS`, which stays 10.

One limit is tighter than bytes and worth naming: Firestore indexes **each array element
separately**, against 20,000 index entries per document. Nothing ever queries by the contents of
a saved report, so the `savedReports` field is exempted from indexing with a `fieldOverrides`
entry in `firestore.indexes.json` — one line of configuration that removes the pressure entirely.

What this does not settle is the **write rate**. Every list edit, every reorder, every saved
report and every `hasRegistrations` update writes the same document, against roughly one
sustained write per second per document. For a handful of teachers editing master data that is
not a real constraint, and it is accepted — but it is the number to watch if a series is ever
edited by many people at once.

**Q14 — `reservedNames` goes; event series names stay unique. Decided.** Master data uniqueness
moves into the document (US-21), so the collection would have survived for one purpose only.
Event series names **are** still unique — two "Wintersportwoche 2026/2027" tags in one header
would be unusable — but a whole collection, its key format and its two modules are a heavy way to
say so about a handful of documents.

**Uniqueness is enforced by a query inside the write's transaction.** Firestore locks the index
range a transactional query scans, so a second create racing the first waits and then sees it —
the same mechanism the current activation transaction already relies on, and already commented as
such in `season-service.ts`.

One detail this turns on, easy to lose in the move: the comparison ignores surrounding whitespace
and letter case, and a Firestore equality query does neither. The document therefore carries
**`nameKey`**, the normalised form of its name, derived by the server on every write and never
sent by a client; the uniqueness query is an equality on that field. `normalizeName` from
`reservation-key.ts` is what derives it, so that module survives in part — the reservation half
goes, the normalisation half becomes the thing `nameKey` is built with. Without this the rename
would quietly reduce uniqueness to an exact-string match.

Deleted with the collection: `unique-name.ts`, the reservation half of `reservation-key.ts`,
their tests, and the seeding script's duplicate of the key format — a script no longer has to
write a reservation document beside each record it creates.

The obvious alternative, making the normalised name the **document id**, is rejected: renaming
would then mean moving the document, and the registrations subcollection lives underneath it.
Ids stay opaque.

### Lifecycle and selection

**Q7 — Yes, several — but a student is almost never asked to choose. Decided.** With no exclusive
active season, a Wintersportwoche and a Kulturwoche can be open together and a student may hold a
registration in each. Over four years at the school they will accumulate several more. So the
model allows any number, and the interface is built so that the normal case still costs no
decision:

1. **A link always wins.** A student arriving through an invitation link (US-23) goes straight to
   that series, whatever else they hold. The link _is_ the choice, so it must never lead to a
   chooser.
2. **Otherwise, count only what is open.** Exactly one open series the student holds a
   registration in — the ordinary case — and they are taken straight to it, with nothing to pick.
3. **More than one open, and only then, they are asked**, before the registration form is shown.
4. **None open** and they see "Derzeit ist keine Veranstaltung freigeschaltet." (US-23),
   with whatever they have already filled in shown read-only beneath it (US-19).

The part that matters is step 2 counting **open** series rather than registrations. A student who
went on three sports weeks has three registrations, and if all of them counted, the chooser would
appear every year from the second onwards — for a decision with one real answer. Past series are
closed or archived, so they are history: reachable, never in the way.

Steps 2 to 4 are also the whole of how a student **returns**. The link is what they joined
through, not what they come back through (US-23): once a registration exists, signing in is
enough, and a student who deleted the mail is no worse off than one who kept it. The link is
therefore an enrolment mechanism with a short useful life, which is what makes regenerating one
safe.

A student's past registrations are still listed somewhere they can find them, read-only. They are
just not what the application opens on.

**Q8 — The selection lives in the URL. Decided.** `/app/{eventSeriesId}/report` and so on: it
makes a link to a report shareable, lets two tabs show two different series, and makes the
selection a first-class part of routing rather than hidden state. The costs are a segment on
every teacher route and a change to `proxy.ts` and `TEACHER_ONLY_PREFIXES`. A cookie remembers
the last choice, so `/app/report` redirects to the series the teacher was last in.

**Q9 — The application seeds nothing. Decided.** Seeding "Ski", "Snowboard" and four ski skill
levels into a Kulturwoche would be worse than seeding nothing, and there is no way for the
application to know which kind of series it is being asked for. So it does not guess.

**A new event series is either blank or a copy of an existing series or template (US-22)**, and
which of the two is answered once, at creation. There is no third way and no separate duplicate
action: what production is seeded with is the **"Wintersportwochen" template**, and every real
series is made from it or from last year's.

What defaults an environment starts with is a **provisioning** concern, not an application one —
they are written by the scripts that stand a project up, alongside everything else those scripts
already create.

Three things follow:

- `src/lib/master-data/seed-defaults.ts` is deleted **whole**, not merely its marker, and the
  `seedState` collection with it. The well-known defaults themselves — Ski, Snowboard,
  Alternativ, the four skill levels, the pickup points, the food and season pass options — move
  out of `src/` and into the seeding script, which is now the only thing that knows them.
- **Signing in stops writing master data.** Today a teacher's first sign-in seeds the defaults,
  which is a write on a read path — the kind of side effect that is invisible until it fires in
  the wrong environment. Afterwards, signing in provisions the user record and nothing else.
- **A real installation starts with whatever provisioning put there, and nothing more.**
  Production holds no defaults the _application_ created: either a teacher types the first series
  in, or the seeding script is asked for it deliberately. Either way it happens once, and every
  series after it names an earlier one as its source.

### Seeding moves to a script, and the environment decides what it gets

`scripts/seed-students.mts` becomes **`scripts/seed-environment.mts`**, pairing it with the
`purge-environment.mts` it is the inverse of: one empties a project, the other fills it. It stops
being about students, because nothing else builds a working state any more.

**It takes the environment and nothing else**, exactly as it does today, and what an environment
gets is fixed rather than chosen:

| Environment          | What it seeds                                         | Purges first |
| -------------------- | ----------------------------------------------------- | ------------ |
| production           | the "Wintersportwochen" template, and nothing besides | no           |
| development, staging | the whole test environment, that template included    | yes          |

That is safer than a mode argument, and simpler: **there is no mode to get wrong.** The dangerous
case was ever seeding test data into production — which would fill it with invented students that
look like real ones — and it is now unreachable by construction rather than refused by a check,
because no argument can ask for it.

Purging is a different matter, and is dealt with below: emptying production is a legitimate admin
task, where filling it with lies is not.

#### Production gets one template, through the ordinary mechanism

It is named **"Wintersportwochen"**, and for now it is the only template the school has. It
carries the standard lists — Ski, Snowboard and Alternativ with their equipment; the four skill
levels; the pickup points; the food and season pass options — with **no classes and no events**,
because those are what differ every year and what a teacher fills in for the series they make
from it (US-22).

The plural is deliberate and worth keeping: a template is the pattern behind every
Wintersportwoche the school runs, not one of them. What a teacher creates from it is singular and
dated — "Wintersportwoche 2026/2027" — so the two names cannot collide under the uniqueness rule
(Q14), and the relationship between them is legible from the words alone.

- **The script uses the template mechanism rather than going around it.** What it writes is an
  ordinary event series with the template flag set, indistinguishable from one a teacher could
  have made by hand, so production starts from something the application already understands and
  the first real series is created from it through US-22's ordinary copy.
- It **adds**; it never purges. A project that already holds data keeps it.
- Running it twice is refused rather than duplicating: the name is already unique (Q14), so the
  second run fails on the name it would have to reuse.

#### Development and staging get a whole environment

Everything above plus enough to exercise the application by hand, purging first exactly as the
script does today:

- the "Wintersportwochen" template, so the copy path of US-22 can be tried;
- at least one open event series with all seven lists filled, and one archived series beside it,
  so both states exist without anybody arranging them;
- an invitation link per class (US-23), since a series with no links cannot be open and a
  registration cannot exist without one;
- the roster it already writes, spread over those classes with the distributions it already uses,
  and assigned to events.

#### Purging is an admin task, and production stops being fenced off from it

`purge-environment.mts` excludes production by construction today, and **that exclusion is
withdrawn**. Q18's clean break needs it, standing a project back up needs it, and the list was
never as protective as it looked: anyone holding credentials the script can use holds credentials
the Firebase console will accept. **It defended against a typo, not against a person** — and
fencing off the legitimate path only pushes an admin towards deleting collections by hand, which
is slower and less complete.

So the closed list is replaced by a guard aimed at the thing that was actually being guarded
against: **purging production asks for the project id to be typed back** — `htld-sportsweek` — and
does nothing until it matches. That is the ceremony the application already asks of a teacher
deleting an event series that holds registrations (US-19), reused rather than invented, and it is
not something a mistyped script name or a tab-completion can produce.

- Development and staging keep their unceremonious `purge:development` and `purge:staging`. There
  is nothing in either worth a confirmation.
- **Seeding keeps its mapping regardless.** Emptying production and filling it with invented
  students are not the same risk: the first is a deliberate reset, the second leaves records that
  look real and are not.

#### Rules and indexes reach production through the workflow, never from a laptop

The means already exists and is worth naming rather than adding a second one beside it.
`deploy-rules.yml` deploys `firestore.rules`, `storage.rules` and `firestore.indexes.json` — to
staging from `main`, to **production from the `production` branch** — and it can be run
deliberately through `workflow_dispatch`. It authenticates with a short-lived token from workload
identity federation, so no long-lived key exists anywhere to be provisioned or leaked.

That is why `package.json` carries `rules:development` and no staging or production counterpart:
development is a project a developer owns, and the other two are reached only through a branch
somebody reviewed. The asymmetry is deliberate and stays.

What this refactoring adds is an **ordering constraint**, because rules and indexes deploy on
their own schedule while the code depends on both:

- **A new index goes first** — the `registrations` collection group (US-26) and the `savedReports`
  `fieldOverrides` (Q13) — because a build takes time and a query without its index fails.
- **A rule that widens goes before or with its code**, such as students reading the event series
  document (Q1).
- **A rule that narrows goes after its code**, such as teachers losing the `users` read (US-26).
  Deploying it early denies the release that is still running.

So a slice is two deploys rather than one, in that order, and slice 4 is the one where getting it
backwards would be visible: narrowing the `users` rule before the join is gone breaks every
teacher's report.

None of that bites while nothing is live (Q18) — with no users, any order works. It is worth
following from the start regardless, because the ordering is a habit rather than a step, and the
first deploy where it matters is not one anybody will remember to think about.

**Q10 — Saved reports are copied along with the lists. Decided.** They are part of the setup a
teacher would otherwise rebuild, and they filter only on master data, which the copy has — so a
copied report works from the moment it exists.

The objection was that a report is often tuned to one year's classes, and a series copied for
next year would start with a row of tags naming classes that have moved up. That is true, and
**it is the class-filtered reports alone**: programs, food options, skill levels and pickup
points usually carry over unchanged, so reports filtering on those keep working exactly.

The answer to it is to **drop, at the moment of copying, every filter tag the copied lists do not
offer** — which is not a new rule but the one US-25 already applies. A value the copy's lists do
not contain is structurally identical to a value that was removed, and removal already means the
tag goes. So a copied report is self-consistent from birth rather than leaning on the read-time
tolerance of US-13.

That distinction matters more than it looks, and it is why the eager version is worth the extra
line of code. If the tags were dropped on **reading** instead, the report on screen would differ
from the report as stored the very first time it was opened — so `sameSelection` would fail, and
US-13's marked tag would show every copied report as **changed before anybody had changed
anything**. Dropping at copy time avoids that entirely.

The read-time tolerance is still kept, for what it was always for: a report saved before a
category or a field key existed (US-25).

**Q11 — A teacher can delete a registration, from the overview page. Decided, as US-28.**
There is no such path today, and the invitation links of US-23 create the need: a link is per
class, not per student, so it can be forwarded, pasted into a group chat or simply used by
somebody it was not meant for. A teacher needs to be able to take a registration out again.

The **overview page** (US-29) is the right place, and for a reason worth stating rather than
leaving to taste: it is the only view that lists **every registered student** of the series,
attending and not attending alike, grouped by class. The assignment board deliberately shows only
the students who are attending (US-12), so a wrongly-registered student who answered "no" would be
invisible there; the report can be filtered down to nobody. The overview is the one page where the
registration you need to remove is guaranteed to be on screen.

Two knock-ons this settles:

- **`hasRegistrations` gains a false transition**, which Q5 flagged as the open end. The mirror
  has been append-only until now; deleting the last registration has to put it back, in the same
  transaction, so the delete rule and the archive control stay honest.
- **Deleting is the symptom, regenerating the link is the cause** (US-23). A teacher who deletes a
  registration that arrived through a leaked link should regenerate that class's link as well, or
  the same thing happens again tomorrow.

**Q12 — A teacher following a link lands on the teacher dashboard. Decided.** Teachers cannot
register: the form is student-only (US-15) and the role follows the UPN domain (US-3). The
question was what a teacher who follows one anyway should be told.

**Nothing.** They are simply taken to the dashboard, which is where signing in already sends
them — `homeFor(role)` decides that today and needs no help. A refusal would be a message for
somebody who has done nothing wrong and can do nothing about it.

It is also not the odd case it first looks like: **the commonest teacher to follow an invitation
link is the one who generated it**, checking that it works before sending it to a class. That
ought to be pleasant rather than scolded.

Two details that follow:

- **The link is scoped, not consumed.** Following one selects the series it names (Q8) and takes
  the teacher to the dashboard there, so the link doubles as a shortcut into that series' report.
  Nothing is registered, nothing is invalidated, and the series is not opened — opening happens
  when a link is _generated_ (US-23), not when it is followed.
- **A dead link is no different**, because the message it would show is about a student's
  registration and means nothing to a teacher. So there is one rule with no branches: a teacher
  following any link lands on the dashboard.

Which leaves the question of how a teacher checks that a link actually works, since they never
meet the student's path themselves. **The fake login (US-16) is what that is for**: a teacher
signs in as a student, follows the link, and sees exactly what a class will see. This is one more
reason that mechanism earns its place — it is the only way to exercise a student-only path
end to end, and the invitation link is now the most consequential of them.

It is not available in production, by construction, so what production offers instead is the
overview page: whether a class has a current link is visible on its card without clicking anything
(US-29). That is the right division — the card says a link **exists**, the fake login proves it
**works** — and between them they remove any reason to build a "test link" control, which could
only ever report on a path its own caller was not taking.

### Consistency and delivery

**Q15 — The cascade runs in a Firestore trigger, and the trigger reads state rather than the
change. Decided.** The architecture table says that reacting to a document change belongs in an
event-driven function, and this repository has no Cloud Functions codebase — it is App Hosting
and Next.js. **One is added.**

One argument is dismissed before the others, because it would otherwise decide this by accident:
**portability is not a consideration here.** This application is committed to Firebase and
Firestore in ways that are load-bearing rather than incidental — the access rules are the
authorisation model, the live subscriptions are the update mechanism, and the uniqueness rule of
Q14 rests on Firestore's transactional-query locking specifically. Moving off it would be a
rewrite, not a refactoring, and one we are deliberately not paying for. So "a Cloud Function
deepens the lock-in" carries no weight: there is nothing left to protect, and if that rewrite ever
happens it is a rewrite whether or not a Functions codebase exists. **The right tool for the job
wins, and a Cloud Function is one of the tools.**

It does not turn on throughput either. A school-sized series is a few hundred registrations —
twenty classes of thirty is six hundred — which is two or three batched commits and well under a
second of work. Nothing here is near a request's budget.

It turns on the one thing a request cannot do: **outlive its own client.** A teacher who closes
the tab mid-cascade, or a transient error halfway through, leaves the fan-out half-done with the
lock standing, and a Route Handler has no retry of its own. The tempting answer — let the next
teacher to edit that series finish it, since the lock blocks them anyway — has a hole that is not
as rare as it sounds: **if nobody edits that series again, the cascade never finishes.** The
likeliest moment to rename a class is at the end of setup, after which master data goes untouched
for weeks. Recovery cannot depend on somebody happening to come back.

### It is a database trigger, with one difference that decides the design

The comparison is apt and worth making precisely, because where it breaks is where the bugs would
be:

| Postgres `AFTER UPDATE`           | Firestore trigger                        |
| --------------------------------- | ---------------------------------------- |
| Runs **inside** the transaction   | Fires **after** commit, asynchronously   |
| A failure rolls the original back | Cannot roll anything back                |
| Fires once, in order              | **At-least-once**, no ordering guarantee |

So the trigger does **not** supply the atomicity that makes a SQL trigger trustworthy. It replaces
exactly one thing — who retries — and every other guarantee in US-27 is still carried by the lock,
the idempotence and the batching. Nothing there is softened.

**Which is why the trigger carries no payload that matters.** It means only "there may be work on
series X"; the function re-reads `pendingCascade` in a transaction and acts on **that**. Acting on
the event's `before`/`after` deltas is the mistake this rule exists to forbid, because deltas are
order-sensitive and a redelivered or out-of-order one would apply a rename that no longer
describes anything — corruption rather than staleness.

With that rule, **ordering cannot bite at all**, and the reason is the lock: a standing
`pendingCascade` refuses every further list edit, so **at most one cascade record exists per
series at any moment**. There is never a second cascade to arrive out of order. The mechanism
specified for concurrency turns out to be what makes delivery order irrelevant.

### Why a trigger and not a task queue

A task queue (`onTaskDispatched`) was weighed and rejected. It gives the same retry and backoff,
fires only when enqueued, and needs no filtering — but it has a gap the trigger does not: the
handler commits, and **then** enqueues. A process that dies in between leaves a lock with no task
behind it, which is the same hole as waiting for the next teacher, merely narrower. Closing it
needs a scheduled sweeper, so the queue costs two functions to the trigger's one.

**A trigger has no gap, because delivery is the platform's job and is inseparable from the write.**
That is precisely the property that made the SQL comparison attractive in the first place.

The two objections to a trigger both collapse into a single guard: `if (!after.pendingCascade)
return;`. That one line discards the writes that are not cascades — a reorder, a saved report, a
`hasRegistrations` update — **and** terminates the recursion when the cascade clears the lock,
because after clearing there is nothing left to do.

And it yields something better than a scheduler: **the cascade's own progress write re-fires the
trigger, so it schedules its own next batch.** The document is both the state and the clock, and
no continuation is passed anywhere.

That needs one safeguard, which is not optional: **`pendingCascade` carries an attempt count, and
the cascade stops after a fixed number of them.** Without it a permanently failing batch loops for
ever. With it, a cascade that cannot succeed comes to rest in exactly the state US-27 already
describes — standing, visible in the event series list, and resumable by hand.

### What it costs

Stated plainly, since it is the first second deployment target this repository has had:

- A `functions/` directory with its **own `package.json`, lockfile and dependency tree**, versioned
  and patched separately. `firebase.json` already ignores `functions` in its App Hosting block, so
  the two do not collide.
- **CI**: the root `npm ci` does not reach it. A second install, typecheck, lint and test run in
  `ci.yml`, or a workspaces setup.
- **Deploy**: a new workflow, and **wider IAM on the workload identity federation** — a functions
  deploy needs Cloud Build, Artifact Registry, Cloud Run and service-account-user where the rules
  deploy needs almost none of it. This is the largest real cost, because it widens what a
  compromised workflow could reach, and it is the part to review rather than copy from a template.
- **Emulators**: `firebase.json` declares only firestore, and `test:rules` runs
  `emulators:exec --only firestore`. Testing the trigger needs the functions and eventarc
  emulators alongside it.
- **Licence headers cost nothing**: the check walks `git ls-files`, so new sources are stamped
  automatically and `functions/node_modules` never appears.
- Blaze billing is already required by App Hosting, and the runtime volume sits inside the free
  tier.

**Q16 — A class that any registration holds cannot be removed. Decided.** The cascade clears a
removed value from every registration that held it, and for six of the seven lists that is
harmless — the student is asked the question again next time they open the form, and answers it.
**The class is the one value that cannot be re-answered**, because US-23 deliberately took it away
from the student: it is set from the invitation link, and removing the class invalidates that link.

So clearing a class is not "one answer poorer". It leaves a registration with no class and no path
that could give it one:

- the student cannot supply it, since it is not a question they are asked;
- the teacher has no control that sets it, since a class comes from a link;
- re-creating a class of the same name reattaches nobody, because the cascade already blanked the
  field.

What is left belongs to no class: absent from the per-class cards, from every grouped figure and
from the class column of the statistics, while still counting as a registration. **Removing a
class is therefore closer to deleting that class's registrations than to clearing a field** — and
it does it silently, without the confirmation US-19 demands before any registration is destroyed.

There is a recovery, and naming it precisely is what shows it is not one: re-create the class,
generate a fresh link, and get every affected student to follow it again. For a class of thirty
that is a second registration drive rather than a repair, and it works only for the students who
act on it.

**So this one is refused rather than confirmed: a class cannot be removed while any registration
of that series holds it.** Renaming stays free and cascades like everything else, which is what
fixes the mistake teachers actually make.

**And it costs almost nothing**, because the class list is the one list a teacher is made to check
before it is used: an invitation link is generated **per class** (US-23), so setting the links up
means reading the list and picking from it. The review is built into the ceremony that makes the
classes matter, so a wrong class is caught before any registration can exist — and until one does,
removal is free.

**What survives of the old rule, and what still goes.** This is the single exception to the
withdrawal in US-21: **classes only, removal only, one series only.** The machinery does not come
back — `usage-guard.ts`, the usage endpoint and `useUsageReport` are still deleted — because the
question is now one question about one list, and a teacher already reads every registration of the
selected series, so which classes are in use is a reduce over data on hand rather than an endpoint.

Two smaller things fall out:

- **The class list can be emptied only in a series with no registrations at all**, so US-21's "an
  empty list asks no question" never fires for classes in a series that has students. That is the
  right shape rather than a gap: a series with registrations is by definition a series with
  classes.
- **Removing a class that has links but no registrations stays allowed.** The links are
  invalidated (US-24) and nothing is lost, because nobody used them.

**Q17 — A copied name is repaired at the next login. Decided, with Q3.** The worry was that a
name copied into a registration goes stale if the student never saves again. It does not: signing
in is what repairs it, and a student who never signs in again has no name to correct anyway. Only
a field that differs is written, and registrations in archived series are left as they are
(US-26). No manual re-sync control is needed.

**Q18 — No migration; a clean break. Decided.** **The application is not in production yet**, so
there is no data anywhere to carry across — not a registration, not a season, not a saved report.
Development and staging are purged with the scripts that already exist, the new rules and indexes
are deployed to each, and the sequencing above stands unchanged: no migration step in slice 2 or
slice 4, and no schema anywhere that has to read both shapes.

That is a property of the moment rather than of the design, and the moment ends precisely at the
**first real registration**. Until then the refactoring costs what is written above; after it,
slice 2 and slice 4 each grow a migration script and every schema in between has to read two
shapes. Which is the whole argument for doing it now.

**Q19 — The flag is `isOpenToStudents`, not `isActive`. Decided.** The state introduced in US-19
— students may join and go on amending — needs a name, and the two obvious ones both mislead.

- **`isActive`** is the name of the flag this refactoring is deleting, and the old one meant
  something structurally different: exclusive, one per installation, deciding what the whole
  application was about. Reusing the name would leave anyone reading the code, the spec or the
  git history to conflate two opposite ideas.
- **`isRegistrationOpen`** names a one-time act. Registering happens once; what this flag governs
  is also every later amendment, which is no longer registration. The same objection sinks
  `acceptsRegistrations`, `isEnrolmentOpen` and `isSubmissionOpen`.
- **`isLocked`**, inverted, is good English for "no more changes" but makes every rule read as a
  double negative, and it collides with the cascade lock of US-27.

**`isOpenToStudents`** avoids all three. "Open" names a **period** rather than an act — an open
enrolment, an open call — so it covers joining and amending alike; and "to students" fixes the
scope, which is the one thing `isActive` never conveyed, since a teacher works in a series
whether it is open or not.

The German label is already in the application, and so is a spelling inconsistency worth fixing
while we are here. The word is "freigeschaltet", and the application uses it five times — "Dieses
Konto ist für Sportsweek nicht freigeschaltet." and its tests. It also uses the non-standard
"freigeschalten" exactly once, in `REGISTRATION_NOT_OPEN_HINT`. That single odd form is corrected
rather than propagated.

The states are therefore labelled "Freigeschaltet" and "Nicht freigeschaltet", and the message a
student meets is "Derzeit ist keine Veranstaltung freigeschaltet." (US-23). Two words change from
the string that exists today: "derzeit" rather than "noch", since a series can now be closed
after having been open, and "Veranstaltung" rather than "Sportveranstaltung", since a series may
be a Kulturwoche.

**Q20 — The link wins and the class changes. Decided.** Since a link names a class (US-23), a
student already registered through the "3aWI" link can follow the "3bWI" link for the same series.
The class is rewritten, and nothing is refused.

It follows from what the class already is rather than being a new rule. The class is **owned by
the server** and was never the student's to protect (US-23), and a link is a teacher's
instruction — so a student who moved class, or was sent the wrong link to begin with, is corrected
by sending them the right one, without anybody editing a record by hand. It is also the same
principle Q7 states for the series: a link always wins, because the link _is_ the choice.

Three consequences worth writing down:

- **What is rewritten is one server-owned field.** Every answer the student owns is untouched —
  the taxonomy of Q4 puts the class among the list values, not among the answers that are theirs.
- **No message is needed**, because nothing is refused. US-23's single-message rule therefore
  keeps no exception, which was the cost the alternative would have carried.
- **It is the per-student counterpart to Q16.** A link is how one student's class is corrected —
  which is precisely why removing a class wholesale has to be refused, since that repair does not
  scale to a class of thirty.

The one harm to name: a leaked link can now move somebody between classes rather than only enrol
somebody new. Regenerating the link (US-23) stops it happening again and deleting the registration
(US-28) undoes what it did, and both are smaller than the alternative — a mis-sent link with no
way back.

**Q21 — Templates are in the header tag row after all, and that is the only way this works.**
Three things were asked for, and they cannot all be true at once:

1. **The header tag row is the scope.** Not a shortcut to it, not one of several ways in — it is
   what "which event series am I working in" means, for the report, the overview, the
   assignment and the master data alike.
2. **Master data is scoped to it**, like everything else.
3. **A template's lists can be maintained, but a template is never in the row.**

Any two hold comfortably; all three cannot. If the row is the scope and master data is scoped by
it, then a thing whose lists are editable **is** something the row must offer, by definition. A
template excluded from the row is a template nobody can maintain — frozen as whatever it was
seeded as, which is precisely what a template must not be.

**So (3) gives, in its second half only: a template does appear in the row.** That is the
cheapest of the three to surrender, because (1) and (2) are the whole navigation concept and (3)
was a preference about tidiness.

And surrendering it collapses the rest of the design, which is the sign it was the right one to
drop. A template stops needing anything of its own:

- **The definition shrinks to one sentence.** A template is an event series that can never be
  opened to students. Not a different kind of thing with views of its own — just that one refusal.
- **No shrunken navigation, no template-only views, no read-only mode.** The report, the
  overview and the assignment scoped to a template show their ordinary empty state — because a
  template holds no registrations, exactly as a series created this morning holds none. There is
  no case to write: the empty case already exists and already works.
- **No second way to scope anything.** One row, one selection, one URL, as before.
- **Q6 is untouched.** Nothing read-only is selectable; a template is fully editable.

What it costs, and how it is paid:

- The header now offers things that are not events anybody is running. **Two rows** answer that
  (US-20): the series that carry data above, the templates below, each wrapping onto further
  lines as needed. A selected template is drawn in grey where a selected series is drawn in the
  accent colour — both already in the base palette, so no colour is introduced, and the pairing
  of position with tone says which is which without either having to carry the meaning alone.
- A teacher could be looking at a template and forget. The row it sits in, its grey highlight and
  the page heading all say otherwise, and every view scoped to it is visibly empty.

Two things fall out pleasantly:

- **A template never needs the cascade lock of US-27.** It holds no registrations, so renaming or
  removing one of its list items reaches only its own saved reports — same document, one
  transaction, nothing to fan out and nothing to resume.
- **The delete rule never bites on a template**, since it can never hold registrations and so can
  never be one of the series that must be archived before it can go.

An archived template is out of the row like any archived series, and is reached the same way
(Q6). "Archived" and "template" stay two independent flags answering two different questions.

**Q22 — "Sonstiges" is suppressed with the list, so US-21's rule has no exceptions. Decided.**
US-9 gives the food question a permanent "Sonstiges" option which is deliberately **not** a row,
so that a teacher can neither rename nor remove it. That made food look like the one place where
US-21's rule broke down: an empty `foodOptions` list would still have had one thing in it, and
the question would have gone on being asked with exactly one answer available.

**"Sonstiges" is offered only alongside a non-empty list.** An empty food list means no food
question at all, exactly as an empty program list means no program question.

The reason it is not really an exception, once written down: **"Sonstiges" is an answer, not a
list item.** US-9 keeps it off the list precisely so that it cannot be maintained like one — and
a thing that is not on the list cannot be what keeps the list from being empty. An answer has
never been able to summon its own question.

So the rule stands as seven cases and no exceptions: **each of the seven questions is asked
exactly when its list has entries.** In code it is one condition in one place — the permanent
option is appended to the offered answers only where the stored list is non-empty — and the test
worth writing is that an empty food list produces no question, rather than a question with a
single option.
