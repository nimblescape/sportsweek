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

**Master data is global, but it describes one event.** Classes, programs, skill levels, season
pass options, bus pickup points and food options live in collections of their own, shared by
every season. A Kulturwoche has no use for "Ski" and a Sommersportwoche has no use for
"Silvretta-Montafon", but every season is made to offer both. The lists cannot diverge, so they
grow into the union of everything every event ever needed.

**Because the lists are shared, they cannot be edited.** US-5 to US-10 forbid editing or removing
an item that any registration of any non-archived season still holds, because the edit would
reach into a season nobody was looking at. The rule is correct given the model, and it is also
the single most obstructive thing in the application: a teacher who mistyped a class name in
October cannot fix it in November. The rule is correct given the model, and once each event series
owns its own lists it stops being obstructive: an edit can only ever reach the registrations of
that one series, so it bites only where the same series' own students have already answered —
which is the case where changing the question behind their backs would be wrong anyway.

**One season is "active", and everything hangs off that.** Registration, assignment and the
report all read the active season, so the application can only ever be about one event at a
time. A school runs a Wintersportwoche and a Kulturwoche in the same year, and it prepares next
year's while this year's is still being reported on. A single global flag cannot express that.

A season is not a season, either. What the school actually plans is a series of events under one
banner — Wintersportwochen, Sommersportwochen, Kulturwochen — so the entity is renamed to an
event series, labelled "Eventreihe".

## What changes, in one page

| Today                                                    | After                                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `seasons` collection, one of them `isActive`             | `eventSeries` collection, none of them privileged over the others                               |
| Seven collections of master data, shared by every season | Seven ordered arrays on the event series document                                               |
| Master data item identified by a document id             | Identified by its name, which is already unique within its list                                 |
| An item in use cannot be edited or removed               | An item **this series'** students have chosen cannot be renamed or removed; everything else can |
| A registration is a snapshot nothing may disturb         | Unchanged — and now true by construction rather than by luck                                    |
| `savedReports` collection, shared by every season        | Saved reports belong to one event series                                                        |
| Registration joins `users` for the student's name        | Registration carries the name, so a report is one read                                          |
| `studentMasterData`, which was never master data         | `registrations`, which is what a student's answers are                                          |
| `studentMasterData.eventId` points at an event document  | `registration.event` names the event, like every other list value                               |
| One season is active; students write to that one         | Each series is open to students or not; several may be open at once                             |
| Registration opens when a teacher activates a season     | A series is opened by generating its invitation link                                            |
| The statistics page shows figures                        | The overview page runs the series: figures, invitation links and the open switch                |
| The page decides which season it is about                | The header decides, once, for every page                                                        |
| Uniqueness via the `reservedNames` collection            | In-document for lists; a transactional query on `nameKey` for series names                      |

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

  // The maintained lists, in the order the master data menu states (US-14) — the one order the
  // report fields, the filter categories and the registration form already follow. Array order
  // is the teacher-defined order, so no item carries a position, and an item's name is its
  // identity, so no item carries an id.
  "events": ["Woche 1", "Woche 2", "Woche 3"],
  "classOptions": ["2aWI", "2bWI", "2cWI"],
  "programs": [
    { "name": "Ski", "requiredEquipment": ["Ski", "Skischuhe", "Stöcke", "Helm"] },
    { "name": "Snowboard", "requiredEquipment": ["Board", "Boots", "Helm"] },
    { "name": "Alternativ", "requiredEquipment": [] },
  ],
  "skillLevels": ["Einsteiger:in", "Anfänger:in", "Fortgeschritten", "Profi"],
  "seasonPassOptions": ["Keine", "Vielleicht", "Golm-Bielerhöhe (Illwerke)", "Silvretta-Montafon"],
  "busPickupPoints": ["HTL Dornbirn", "Bahnhof Bregenz", "Bahnhof Feldkirch", "Unterkunft"],
  "foodOptions": ["Alles", "Vegetarisch", "Vegan", "Kein Schweinefleisch"],

  // A saved report is a selection the teacher asked to be remembered, and nothing else: a name,
  // which students are shown, and which detail lines they show (US-13, US-25). It is here for
  // the same reason the lists are — it belongs to this series and filters on these lists, so one
  // transaction writes both and they cannot disagree. Array
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

  "isIncomplete": true, // recomputed by the server on every write
  "isAttendingSportsWeek": true,

  // Values chosen from the event series' lists, held by name. Stored as plain text, and left
  // alone once given: US-24 refuses the edits that would strand one.
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
- The `events` composite index in `firestore.indexes.json`, and every other entry in its
  `indexes` array, which ends this refactoring empty. What remains is a single `fieldOverrides`
  entry: see "The one index is a field override, not a composite" below.
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
  is open to students, whether it holds registrations, and its place in the teacher's order.
- **A template is an event series that can never be opened to students** (US-22, Q21). That is
  the whole of it: it is selected from the header row and scoped like any other, its lists are
  maintained like any other's, and the report, overview and assignment scoped to it show the
  ordinary empty state, because it holds no registrations — exactly as a series created this
  morning holds none. Several may exist, one per kind of week the school runs.
- The server refuses to open a template to students, as it refuses to open an archived series —
  one rule shape, two reasons. It also refuses to write a registration into one.
- A template can be deleted like any other series, because it can never hold registrations and so
  can never trip the rule that makes deleting wait for archiving — **except while it is the last
  unarchived one**. Every teacher view is scoped to a selection, so a school with no event series
  at all has a header offering nothing and a navigation bar pointing nowhere. Holding one template
  back is what puts that state out of reach, and provisioning creates it, so a school starts with
  one and can never get rid of it. Archiving a template does not count as keeping it, since an
  archived series is on no screen to be selected from.
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
  US-13 show today. That state is reachable only before a school has been provisioned: the last
  unarchived template cannot be deleted, so once there is one there is always one.
- A series that is archived or deleted by another teacher while it is selected leaves the
  selection empty rather than leaving a stale series on screen, and says so.
- Students never see either row. They manage no series and reach a registration through an
  invitation link (US-23).
- The tags are the application's one tag component, the same one the filter, field and saved
  report rows use.

### US-21: Master data belongs to the event series and is stored in its document

As a teacher, I maintain the events, classes, programs, skill levels, season pass options, bus
pickup points and food options of one event series, so that a Kulturwoche is not made to share
its lists with a Wintersportwoche.

**Acceptance criteria:**

- The seven maintained lists are fields of the event series document, stored as ordered arrays.
  None of them is a collection any more.
- **Only the storage moves.** The category definitions keep everything else they own: the menu
  order, which is the one order the report fields, the filter categories and the registration
  form all follow (US-14), the singular and answer labels each list is named by, and the field a
  registration stores its answer in. A list's document field is the collection name it had, so
  the definitions gain a field name where they carried a collection name and nothing else about
  them changes.
- **Events are one of those lists like any other.** They are maintained on the master data menu,
  for the selected series, on the same CRUD list every category uses — reaching them is no longer
  a step inside a series' row. They lead the menu, because they are the series divided into weeks
  and everything after them describes the students within it.
- **Nobody is asked which event they are in.** A teacher assigns it (US-12), so the events are the
  one list that supplies no question: the form does not offer it, completeness never counts it as
  missing, and a student sending one is refused like any server-owned field. What the category
  still owns is the word the report and the filter show, and the field the in-use guard matches
  on — which is what refuses to remove an event somebody is assigned to (US-24).
- An item's identity is its name. There is no id beside it, because the name is already unique
  within its list, and because the values registrations and saved reports hold are names.
- Which item a request means is therefore the name it carries, compared the one way the
  application compares names — trimmed and case-folded. That is what makes a stale request fail
  loudly rather than quietly: a name that has since been changed matches nothing and is refused,
  where a position would have matched whatever had moved into it.
- A name is not a path segment, since one may contain a slash. Where a URL has to name an item it
  does so in a search parameter, percent-encoded — which is reversible, so distinct names stay
  distinct and no name a teacher might type is refused for the sake of a tidy address.
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
- The in-use restriction of US-5 to US-10 **survives, narrowed twice over**: it now asks about one
  event series rather than every non-archived one, and about one item rather than a whole list.
  Adding and reordering are free at all times; renaming or removing is refused only for an item
  some registration of that series holds (US-24).
- That narrowing is the whole of what the move buys here. The rule was obstructive because the
  lists were global, so another season's registration froze this season's identically-named item.
  Scoped to one series, it bites only where this series' own students have already answered — and
  during setup, when mistakes are actually caught, nothing is in use and everything is editable.
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
  - **The filter offers no category whose list is empty**, which is what it already does with a
    category that has no options — including the food category's permanent "Sonstiges" tag, which
    goes with the list it is appended to rather than standing on its own (Q22). A category with no
    tag selected already restricts nothing (US-12), so nothing else is needed here.
  - **Opening a saved report waits for the document.** US-13 keeps its tolerance — a tag nothing
    offers any more restricts nothing — but its exception for a category offering no options at
    all is what one subscription per list forced: an empty list and a list still being read looked
    alike, so dropping against either would have shown every report as changed. One document has
    one loading flag, so the two can finally be told apart: the report scopes its filter once the
    document has arrived, and an empty list then means what US-21 says it means.
- Equipment rental was already conditional on the chosen program having required equipment
  (US-11); it now sits behind a second condition, since a series with no programs asks no program
  question and so can have no rental question either.
- A program's required equipment is unchanged in every other respect: a list on the program,
  capped at `MAX_EQUIPMENT_ITEMS`, ordered by dragging, rewritten whole.
- Because one subscription to one document now carries every list and every saved report, the six
  `useMasterData` subscriptions, the `useEvents` subscription and `useSavedReports` collapse into
  one.
- The roster's opt-in flags survive that, with one of their two reasons gone. They say which
  filter categories a view offers, which the board and the report still disagree about; they no
  longer say which lists are worth subscribing to, because there is one subscription and it
  carries all of them. `answerLists`, which existed to buy three subscriptions with one flag,
  therefore keeps its name only as long as it still names three categories a view asks for
  together.

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
- **A link holds a list value, so the same refusal covers it** (US-24): a class named by a link
  cannot be removed while a registration holds it, and a class whose links exist but whose
  registrations do not can still go — nobody used them, so nothing is lost, and the links are
  invalidated with it. What a link may never become is an enrolment into a class that is gone.
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

### US-24: An answer a student has given cannot be taken away from them

As a teacher, I can shape a list freely until students start answering from it, and after that
the application refuses the edits that would strand what they said — so that no registration is
ever left holding a value its event series no longer offers.

**Acceptance criteria:**

- **Adding an item is always allowed**, before and during registration. A new option strands
  nothing: every answer already given stays valid, and the question simply gains a choice. A
  teacher who notices a missing class after the invitations have gone out adds it.
- **Reordering is always allowed**, for the same reason: the order is how a teacher wants to read
  the list (see Ordering) and no stored value changes.
- **Renaming or removing an item some registration of that series holds is refused.** The row's
  controls are disabled with a hint saying why, and the server refuses it as well — the disabled
  control is a convenience, and a client is not a trust boundary.
- The refusal is **per item, not per list**: only the entries students have actually chosen are
  frozen. Everything else on the same list stays editable, which is what keeps the rule from
  becoming "the series is finished" the moment the first student answers.
- The refusal is **per event series**. An item of one series is never held back by another
  series' registrations, which is precisely what moving the lists into the document bought
  (US-21) — and it is the whole of the complaint this refactoring set out to fix.
- Required equipment follows the same rule one entry at a time: an entry a student still rents
  cannot be renamed away or removed, and a program cannot be deleted while one of its entries is
  rented, since deleting it would take that entry along (US-5).
- Removing an event is refused while a student is assigned to it. Unassigning them first is what
  makes it removable, which is a teacher's decision rather than a silent consequence.
- **Nothing is rewritten behind a student's back.** Renaming "Vegetarisch" to "Vegan" would
  change what a hundred students said they wanted, and no automatic rewrite can know whether
  they still mean it. Where an answer has to change, the answer is asked again.
- The invariant, stated so it can be tested: on any series, every list value on every
  registration is either unanswered or one the series currently offers. The refusal is what
  holds it, and US-27 is what stops a concurrent save slipping past.
- **What a teacher does when a list is genuinely wrong** is not a smaller edit but a larger
  decision: the answers already given were given against the old list, so correcting it means
  asking for them again. Deleting the series and running registration afresh is the honest
  version of that, and it is a decision only the school can take.

### US-25: Saved reports live with the lists they filter on

As a teacher, my saved reports keep meaning what I saved them as, so that opening one shows the
report rather than a report widened by tags that quietly stopped matching.

**Acceptance criteria:**

- Saved reports belong to one event series and are stored in its document, beside the lists they
  filter on: they are created in it, listed only while it is selected, deleted with it, and their
  order is the array's.
- A saved report is a selection that was remembered, and nothing else: a name, a filter and a set
  of field keys. It names nobody and records nothing about how it came to exist.
- The event filter tag holds the event's name rather than its id, so an event is the same kind of
  value as every other list entry. It was the only tag storing an id, and with it goes the
  `ReportFieldContext` that existed to translate ids back into names.
- **A tag can only be left stranded by a removal the lock allows**, which is an item no
  registration holds (US-24). Opening the report then stays as tolerant as US-13 requires: a tag
  nothing offers any more restricts nothing, and a field key nothing offers adds no detail line.
  That tolerance also keeps a report saved by an older release readable.
- The activated field tags are not master data and are never rewritten.
- The same pruning runs **when a report is copied into a new series** (US-22, Q10): a tag the
  copied lists do not offer is dropped there and then, so a copy is consistent with its own
  lists from the moment it exists rather than relying on the read-time tolerance later.

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
  `registrations` by the student's UPN. Collection group scope is not indexed automatically, so
  this is the one index the refactoring declares — as a `fieldOverrides` entry, not a composite.
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

### US-27: A concurrent registration cannot slip past the guard

As the system, I keep one event series consistent while several teachers and a class full of
students write to it at the same time.

**Acceptance criteria:**

- Every write to an event series' lists is a transaction on its document, so two edits to two
  different lists cannot lose one another and two edits to the same list are ordered. The saved
  reports are in that document, so a report and the lists it filters on can never disagree.
- **The in-use check runs inside the transaction that writes the list**, not before it. Asked
  beforehand its answer is already stale: a student choosing the value being removed in between
  would be left holding something the series no longer offers, and with no cascade nothing would
  repair it. A guard with that hole is worse than none, because it claims an invariant it does
  not hold.
- The check is a query for the registrations of that series holding **that one value**, so
  Firestore locks a narrow index range: a student answering anything else never conflicts, and
  the only save that does is one choosing the very item being edited — which is exactly the save
  that ought to conflict.
- **The student's save reads the event series inside its own transaction** and validates every
  list value against it. That closes the other direction: a teacher's edit writes that document,
  so a save which read the older one conflicts, retries, and is then refused rather than storing
  a value nothing offers.
- Either order is therefore safe. Whichever commits first invalidates the other's read, and the
  loser retries and sees the winner.
- **The student never pays for this.** A transaction retries by itself, so a save caught by a
  concurrent list edit re-reads, re-validates and commits without the student noticing. The one
  case they are refused is the case that deserves it: the option they chose has just been
  removed, and they are asked to reload and choose again.
- **The teacher pays**, which is the right way round: they are doing the rare and questionable
  thing — editing lists mid-registration — so theirs is the request that waits, and is told to
  try again if it cannot get through.
- The narrow queries filter on the series **and** the value, which is two equalities and so needs
  one composite index per answer a list supplies, plus one for the rentals. They are temporary:
  once a registration lives beneath the series it belongs to (US-26), the series is the path
  rather than a field, the query drops to a single equality, and every one of them goes.
- Nothing outlives the request. There is no lock left standing, no progress record, no attempt
  count and nothing to resume, because an edit either commits whole or does not commit.

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
- Deleting one registration can free the last hold on a list item, so an edit a teacher was
  refused a moment ago may be allowed afterwards (US-24). The guard is asked again on every
  write, so nothing has to be told that this changed.

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
  application's one tag component with `aria-pressed`, reading "Schüler:innen-Anmeldung offen" when
  the series is open and "Schüler:innen-Anmeldung geschlossen" when it is not — Q19's two labels
  with the noun they are about, since a bare "Offen" in a title line does not say what is.
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
| US-5 to US-10           | Kept as descriptions of the seven lists. The in-use restriction preceding them is narrowed to one series and one item (US-24). Storage moves (US-21).                                                                                                                                                                   |
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

**The events take `eventId` with them**, because an array entry has no id for a registration to
point at: `registration.eventId` becomes `registration.event`, holding the name like every other
list value. The event filter tag holds a name too, and `ReportFieldContext` — which existed only
to translate an id back into the name everything else already spoke — is deleted. That is work
US-25 and US-26 would otherwise have done later, and it is cheaper here than a slice spent
keeping a collection alive that nothing else wants.

It also removes a cost rather than adding one. Uniqueness within a list is a comparison over an
array the write already holds, so no query is made and no index range is locked — where a
transactional sibling query made two teachers editing two _different_ event series wait for one
another, which is the thing the reservation documents existed to avoid in the first place.

The pages follow the same reasoning as the scope does. The header selection that says which
series a teacher is working in is slice 5, so until then the six menu lists are the **active**
series' lists, and the events of any series stay where they already are — on that series' own
page, which is the one place in the application that already carries an event series id. They
join the menu as the seventh list in slice 5, once there is a selection for them to belong to.

What the category definitions own is the base this starts from and is carried through unchanged:
the menu order that the report fields, the filter categories and the registration form all
follow, the answer label each list is named by, and the field a registration stores its answer
in. The tests that pin those four lists to one another are what says the move preserved them, so
a slice that has to relax one of them has gone wrong somewhere else.

The in-use rule of US-5 to US-10 **stays**, rewritten against the new storage: it is now per
series rather than global, which is most of what made it obstructive. Making it sound under a
concurrent registration is slice 3.

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
  series asks for, the statistics leaving out what has no dimensions, and the filter offering no
  category whose list is empty. That last one is what finally lets a saved report be scoped
  against an empty list rather than excepted from it — one document has one loading flag, so a
  list nobody filled in and a list still being read stop looking alike.

### 3. Closing the race in the in-use rule, and the saved reports

US-24, US-25 and US-27 land together, and there is no cascade in any of them.

The in-use rule **stays** and is made sound. It moves inside the transaction that writes the
list, and it stops reading the whole series: the check is a query for the registrations holding
the one value being touched, so the locked index range is narrow. The student's save becomes a
transaction too, reading the event series and validating its answers against it, which closes
the other direction. Those two changes are the whole of US-27.

The narrow queries bring one composite index per answer a list supplies, plus one for the
rentals, because filtering on the series and the value is two equalities. They are temporary and
go again in slice 4, when a registration moves beneath its series and the series stops being a
field to filter by.

The saved reports move into the event series document in this slice, beside the lists they filter
on — one document, one transaction, so a report and its lists cannot disagree.

This is the slice that needs the concurrency tests, and the invariant of US-24 is the one worth
writing first: after any edit, every list value on every registration is either unanswered or one
the series currently offers. Both races are worth a test of their own, since neither is visible
in a single-threaded run.

### 4. Self-contained registrations

US-26: the name and e-mail fields, the `users` join deleted, and the `users` read rule narrowed
to a caller's own record. A registration becomes a document beneath the series it belongs to,
keyed by the student's UPN, so which series it is in is where it is stored rather than a field it
carries. The event it is assigned to is already held by name, which slice 2 had to settle when
the events lost their ids.

This is the slice where the deploy order matters: the collection group override on `studentUpn`
goes **first**, because provisioning queries by it, and the narrowed `users` rule goes **last**.
Deploying that rule early denies the release still running, whose roster still joins to `/users`.

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

The provisioning script follows in the same slice, because what production is seeded with is a
template and templates do not exist until now: `seed-students.mts` and `purge-environment.mts`
become one `seed-environment.mts` with the mapping of Q9, trading their closed lists of
environments for the typed-back project id.

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

**Q4 — They are snapshots after all, and US-11 was right. Reversed.** This question originally
decided the opposite: US-11 says a list value is stored "redundantly as plain text, not as a
foreign key" precisely so that "later changes to the maintained list do not alter already-stored
master data records", and the cascade of US-24 contradicted it, so US-11 was to be rewritten.

With the cascade gone (Q15), **nothing rewrites a stored answer**, and US-11's sentence is simply
true again. It is left exactly as it stands.

The invariant survives the reversal and is easier to hold: on any series, every list value on
every registration is either unanswered or one the series currently offers. What preserves it is
no longer a repair after the fact but a refusal before it — US-24 will not let an item a
registration holds be renamed or removed, and US-27 makes that refusal sound against a concurrent
save. A test can assert it outright after any edit.

It still sorts the registration's fields into three kinds, which is worth keeping straight
because each stays honest by a different means:

| Kind                                                            | Kept honest by            |
| --------------------------------------------------------------- | ------------------------- |
| Answers the student owns (birth date, phone, health, free text) | Nothing — they are theirs |
| List values (class, program, skill level, event, …)             | The refusal, US-24        |
| Identity copies (first name, last name, e-mail)                 | The next login, US-26     |

Archiving needs no rule of its own here either. An archived series has no tag in the header, so
it cannot be selected, and every editing view acts on the selected series — so there is no screen
from which its lists can be changed. Its values stop moving because nothing can reach them, not
because anything freezes them.

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

### Seeding and purging become one script, and the environment decides what it gets

`scripts/seed-students.mts` and `scripts/purge-environment.mts` become a single
**`scripts/seed-environment.mts`**: they were never two tasks. Seeding on top of whatever a
project already holds says nothing about whether the application put it there, and the point of a
seeded environment is that its contents are known — so the delete is half of the write. It stops
being about students, because nothing else builds a working state any more.

**It takes the environment and nothing else**, exactly as both did today, and what an environment
gets is fixed rather than chosen:

| Environment          | What it is left holding                               | Confirms first |
| -------------------- | ----------------------------------------------------- | -------------- |
| production           | the "Wintersportwochen" template, and nothing besides | yes            |
| development, staging | the whole test environment, that template included    | no             |

That is safer than a mode argument, and simpler: **there is no mode to get wrong.** The dangerous
case was ever seeding test data into production — which would fill it with invented students that
look like real ones — and it is now unreachable by construction rather than refused by a check,
because no argument can ask for it.

Emptying production is a legitimate admin task, dealt with below; filling it with lies is not.

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
- It is a **reset**: the project is emptied first, so what it holds afterwards is the template and
  nothing else. That is what makes running it twice mean the same thing as running it once.

#### Development and staging get a whole environment

Everything above plus enough to exercise the application by hand, on the same emptied project:

- the "Wintersportwochen" template, so the copy path of US-22 can be tried;
- at least one open event series with all seven lists filled, and one archived series beside it,
  so both states exist without anybody arranging them;
- an invitation link per class (US-23), since a series with no links cannot be open and a
  registration cannot exist without one;
- the roster it already writes, spread over those classes with the distributions it already uses,
  and assigned to events.

#### Emptying is an admin task, and production stops being fenced off from it

Purging excluded production by construction, and **that exclusion is withdrawn**. Q18's clean
break needs it, standing a project back up needs it, and the list was never as protective as it
looked: anyone holding credentials the script can use holds credentials the Firebase console will
accept. **It defended against a typo, not against a person** — and fencing off the legitimate path
only pushes an admin towards deleting collections by hand, which is slower and less complete.

So the closed list is replaced by a guard aimed at the thing that was actually being guarded
against: **resetting production asks for the project id to be typed back** — `htld-sportsweek` —
and does nothing until it matches. That is the ceremony the application already asks of a teacher
deleting an event series that holds registrations (US-19), reused rather than invented, and it is
not something a mistyped script name or a tab-completion can produce.

- Development and staging reset unceremoniously. There is nothing in either worth a confirmation.
- **What is written back still follows the environment.** Emptying production and filling it with
  invented students are not the same risk: the first is a deliberate reset, the second leaves
  records that
  look real and are not.

#### Rules and indexes reach production through the workflow, never from a laptop

The means already exists and is worth naming rather than adding a second one beside it.
`deploy-rules.yml` deploys `firestore.rules` and `firestore.indexes.json` — to staging from
`main`, to **production from the `production` branch** — and it can be run deliberately through
`workflow_dispatch`. It authenticates with a short-lived token from workload identity
federation, so no long-lived key exists anywhere to be provisioned or leaked.

That is why `package.json` carries `rules:development` and no staging or production counterpart:
development is a project a developer owns, and the other two are reached only through a branch
somebody reviewed. The asymmetry is deliberate and stays.

What this refactoring adds is an **ordering constraint**, because rules and indexes deploy on
their own schedule while the code depends on both:

- **A new index goes first** — the `registrations` collection group override on `studentUpn`
  (US-26) and the `savedReports` `fieldOverrides` (Q13) — because a build takes time and a query
  without its index fails.
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

#### The one index is a field override, not a composite

`firestore.indexes.json` ends this refactoring with an empty `indexes` array and a single
`fieldOverrides` entry. The distinction is worth stating, because getting it wrong fails in two
different ways and neither is caught by a test.

Firestore maintains a single-field index automatically for every field, but **only at collection
scope**. Collection group scope is not automatic: it has to be asked for. So of the queries left,
three are free and one is not:

| Query                                                             | Served by              |
| ----------------------------------------------------------------- | ---------------------- |
| `.../registrations` where a list field equals one value           | automatic, collection  |
| `.../registrations` where `rentedEquipment` array-contains a name | automatic array index  |
| a student's own registration, by document id                      | no index at all        |
| `collectionGroup("registrations").where("studentUpn", "==", upn)` | **the field override** |

The composite indexes of slice 3 were needed because those queries filtered on the series **and**
the value — two equalities. Moving a registration beneath its series turned the first equality
into the path, and the second stands alone, which is why they all go.

The one that remains cannot be declared in the `indexes` array. That array is for composite
indexes, and a single-field entry in it is refused outright:

```text
HTTP 400 — this index is not necessary, configure using single field index controls
```

"Single field index controls" means `fieldOverrides`, and that message reads like "you need
nothing here" — which is wrong, and fails later at the query instead:

```text
9 FAILED_PRECONDITION — The query requires a COLLECTION_GROUP_ASC index for
collection registrations and field studentUpn
```

The override names only the collection group scope, so `studentUpn` keeps no collection-scoped
index. Nothing queries it that way — a student's own registration is reached by document id — and
if something ever does, it fails loudly with the message above rather than quietly scanning.

**No test can catch either mistake.** The Firestore emulator does not enforce index requirements:
a missing index passes `npm run test:rules` and fails in a real project, and a superfluous one
passes too and fails the deploy. Index changes are verified by deploying and running the query
against a real project — for development, `npm run rules:development` and a reseed.

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

**Q15 — There is no cascade, so there is no trigger. Withdrawn.** This question originally decided
that the fan-out belonged in a Firestore trigger, and a `functions/` codebase was added for it.
Both are gone, because the thing they carried turned out not to be worth having.

The cascade existed to make an edit safe _after_ students had answered from the list. But renaming
"Vegetarisch" to "Vegan" rewrites what a hundred students said they wanted, and no automatic
rewrite can know whether they still mean it; removing an option leaves them holding nothing. The
honest outcome in both cases is that the answers are asked for again, which is an organisational
decision and not something a fan-out can paper over. **A cascade dresses a re-registration up as a
data migration.**

What made this affordable to drop is that the in-use rule stops being obstructive once the lists
belong to one series (US-21). The original complaint — a teacher who mistyped a class in October
cannot fix it in November — was a symptom of the lists being **global**: another season's
registration froze this season's identically-named item. Scoped per series, the rule bites only
where the same series' own students have already answered, which is the case where a rewrite would
have been wrong anyway. During setup, when mistakes are actually caught, nothing is in use and
everything is editable.

So the refusal replaces the repair (US-24), and it is narrow: per item rather than per list, and
adding and reordering stay free at all times.

**What this deletes.** `pendingCascade`, the revision counter, the batching, the attempt count, the
resume control, the lock that had to survive across processes — and with them the whole of the
`functions/` codebase: its own dependency tree and lockfile, a second install and test run in CI,
the functions and eventarc emulators beside the firestore one, a deploy workflow, and **a widening
of what the deploy identity may reach** — Cloud Build, Artifact Registry, Cloud Run and
service-account-user, where deploying rules needs almost none of it. That widening was named here
as the largest real cost of the trigger, and not paying it is the largest gain from dropping it.

**What replaces it is a guard that has to be sound**, which is US-27: the in-use check runs inside
the transaction that writes the list, and the student's save reads the series inside its own. A
check made before the write is stale by the time it lands, and with nothing to repair the result,
a guard with that hole would be worse than none — it would claim an invariant it does not hold.

**When the trigger would come back.** Not for retry — for **scale**. A series far larger than a
school's would stop fitting inside a request, and then the work has to outlive it. That is not
this application, and building for it now would cost the IAM widening today for a load that may
never arrive.

**Q16 — The class was the case that generalised. Subsumed into US-24.** This question originally
carved out one exception to the cascade: a class held by a registration could not be removed,
because unlike the other six values a class cannot be re-answered — US-23 takes it away from the
student and sets it from the invitation link, so clearing it would strand the registration outside
every class with no path back.

That reasoning stands, and it turned out to be the general case rather than the exception. Once
the cascade went (Q15), **every** list value is refused rather than rewritten, so classes need no
special pleading — they are simply the value where the harm was easiest to see.

The rule is now US-24, stated once for all seven lists: adding and reordering are always allowed;
renaming or removing an item some registration holds is refused, per item and per series.

What Q16 still contributes is why the refusal costs so little. **The class list is the one a
teacher is made to check before it is used**: an invitation link is generated per class (US-23),
so setting the links up means reading the list and picking from it. The review is built into the
ceremony that makes the classes matter, so a wrong class is caught before any registration can
exist — and until one does, every edit is free. The same holds more loosely for the other lists,
which are read in order to answer the questions they supply.

One consequence to keep: **the class list can be emptied only in a series with no registrations at
all**, so US-21's "an empty list asks no question" never fires for classes in a series that has
students. That is the right shape rather than a gap — a series with registrations is by definition
a series with classes.

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
  double negative, and it says nothing about who is shut out.

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

- **A template's lists are never locked**, since the refusal of US-24 turns on registrations and a
  template can hold none. Its items stay renameable and removable for as long as it exists, which
  is what a pattern to copy has to be.
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
exactly when its list has entries.** In code it is one condition wherever the permanent option is
appended — the registration form, which offers it as an answer, and the filter row, which offers
it as a tag — and the test worth writing is at both: an empty food list produces no question and
no food category, rather than either with a single option in it.
