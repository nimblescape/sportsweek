<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Refactoring: Per-Event Categories and a Two-Step Registration

This document specifies one change with three faces: master data becomes a hierarchy an editor
can show, an event gains lists of its own that override the series', and — where events differ
in what they offer — a student registers in two steps instead of one.

It is a companion to `spec/requirements.md` and to `spec/refactoring-event-series.md`. The user
stories below are numbered on from the ones already there. Once this has landed, all three are
merged into `spec/requirements.md` and the two refactoring documents are deleted.

The user story numbers are stable, not positional. US-33 onwards are appended by number and
placed by topic when merged.

No data migrates. Every environment is purged and reseeded, so a stored shape may change freely.

## Why

**The lists describe the wrong thing.** An event series holds one set of programs, skill levels,
access cards, pickup points and catering options, and every event under it is made to offer that
same set. A series that runs one week in Montafon and one in Lech cannot say so: the two weeks
have different pickup points and different access cards, and the only way to express that today
is to put the union in one list and rely on the students to pick correctly.

**The editor hides the hierarchy it is editing.** The seven categories are seven sibling pages,
scoped by a selection made in the header — the same selection that scopes the registrations, the
assignment and the report. Nothing on the screen says that classes belong to a series while an
assignment belongs to a series' students; they look like seven global lists that happen to change
when a tag in the header is pressed.

**The header selection means two different things.** For registrations, assignments and reports it
is "which series am I looking at" — a filter over data. In Stammdaten it is "which series am I
editing" — a record being maintained. One control doing both is why editing master data feels
like changing a view setting.

**Registration asks a question that cannot yet be answered.** A student is asked which program
they want before anyone knows which event they are in. Where the events differ, that question has
no correct answer at the time it is put.

## What changes, in one page

| Today                                                                | After                                                                            |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| An event is a name in a list of strings                              | An event is a record: a name plus five lists of its own                          |
| Master data belongs to the series only                               | Five categories belong to a series **and** to each of its events                 |
| A student is offered the series' lists                               | A student is offered their event's lists, falling back to the series'            |
| `/app/{seriesId}/master-data/{category}`                             | `/app/event-series/{seriesId}/{category}` — no `master-data` segment left        |
| The header selection scopes Stammdaten too                           | The header rows are hidden in Stammdaten; the record being edited is the URL     |
| Seven sibling category pages                                         | A master list, a record page per series, a record page per event                 |
| Nav: Eventreihen · Events · Klassen · …                              | Nav: five fixed entries; the categories move onto the record page as a tag row   |
| Gender is male or female                                             | Gender is male, female or diverse                                                |
| Form: Registrierung · Persönliches · Notfallkontakt · … · Gesundheit | Form: Registrierung · Persönliches · Gesundheit · Notfallkontakt · Veranstaltung |
| One registration step, complete only when everything is answered     | Two steps where any event carries its own programs                               |

## The shape it moves to

All master data stays on the one event series document, as it does today. A per-event list is an
array property of the event object, exactly as a per-series list is an array property of the
series.

```jsonc
// eventSeries/{eventSeriesId}
{
  "name": "Wintersportwoche 2026/2027",
  // …archive, template, open-to-students and ordering fields as they are today…

  // Asked of every student of this series, whatever event they end up in.
  "classOptions": ["2aWI", "2bWI"],

  // The five overridable categories, at series level. These apply to any event that names none
  // of its own.
  "programs": [{ "name": "Ski", "requiredEquipment": ["Helm", "Stöcke"] }],
  "skillLevels": ["Keine Vorkenntnisse", "Fortgeschritten"],
  "seasonPassOptions": ["Montafon"],
  "busPickupPoints": ["Dornbirn"],
  "foodOptions": ["Vegetarisch"],

  "events": [
    {
      // The name is still the identity (US-21) — unique within this list, and what a
      // registration stores.
      "name": "Woche 1",
      // Empty means "take the series' list". A non-empty list replaces it outright; there is no
      // merging, and the two lists never mix.
      "programs": [],
      "skillLevels": [],
      "seasonPassOptions": [],
      "busPickupPoints": [],
      "foodOptions": [],
    },
    {
      "name": "Woche 2",
      // This event runs elsewhere, so it names its own programs — and with them their equipment,
      // because equipment belongs to the program that requires it and travels with it.
      "programs": [{ "name": "Ski", "requiredEquipment": ["Helm", "Stöcke", "Lawinenpiepser"] }],
      "skillLevels": [],
      "seasonPassOptions": ["Arlberg"],
      "busPickupPoints": [],
      "foodOptions": [],
    },
  ],
}
```

### The resolution rule

One function answers what a given event offers, and every caller asks it — the form, the
completeness check, the report, the filter and the server-side validation of a saved answer:

> For each of the five overridable categories: if the event names entries of its own, those are
> what applies. Otherwise the series' entries apply. An event that names none of its own is
> exactly the application as it behaves today.

Two consequences worth stating, because they are the ones that surprise:

- **Equipment is never overridden on its own.** It belongs to the program that requires it, so a
  per-event programs list replaces the series' programs _including_ their equipment. An event
  whose "Ski" requires nothing, under a series whose "Ski" requires three items, is expressed by
  the event naming a "Ski" with an empty equipment list — not by an equipment override.
- **A per-event entry may be spelled exactly like a per-series one**, and means whatever it means
  at its own level. Uniqueness, length and count are checked within one list, so the same
  constraints apply per event as per series, independently.

### The document's real limit, handled rather than guessed at

Everything above lives in one Firestore document, and Firestore caps a document at 1 MiB. The
caps the lists already declare multiply badly against that: a hundred events, each carrying five
lists of up to a hundred entries, is megabytes on paper.

**No new cap is introduced for it.** A number chosen to make the arithmetic safe would be a
number invented against a case nobody has met — a realistic series is a few tens of kilobytes,
and a cap tight enough to guarantee the worst case would be tight enough to obstruct the normal
one. If a school ever does reach the limit, that is the moment to change how the data is stored,
and the refactoring will be informed by a real shape rather than a guessed one.

What the limit gets instead is **an honest failure**. Firestore refuses a write that would exceed
it, and that refusal must reach the teacher as a sentence saying what happened and what to do,
not as a generic save error. The write path recognises that one refusal and answers with its own
message; every other fault keeps the sanitised message it has today.

### Concurrent edits: the last write wins

All the master data of one series is one document, so two teachers editing different categories
are still editing one record. The rule is the simple one: **the last write wins.** Nothing
versions the document, nothing refuses a write because somebody else got there first, and a
teacher is never shown a conflict to resolve.

This is a deliberate trade against a bounded audience. Master data is maintained by one or two
people who are in touch with each other, and for them a merge dialogue would be a cost paid on
every save to guard against something that does not happen. The consequence is real and
accepted: if two people do edit at the same time, one of them can silently lose an entry.

If that assumption stops holding — more maintainers, or edits that are not coordinated — the
answer is not to bolt locking on, but to revisit how the lists are stored, which is the same
refactoring the size limit would eventually force.

## The master data editor: drill-down record pages (Concept A)

The most common editor for a master-detail relationship, and the one this adopts: a master list
page; opening a row navigates to that record's page; the record's child collections are reached
from there; a breadcrumb names the trail back.

The event series id leaves the global scope segment, which is what takes Stammdaten out of the
header selection. `/app/event-series` is already a segment the selection ignores, so the whole
tree moves beneath it and the `master-data` segment disappears.

### Every level is a record with child collections

The hierarchy has one shape, repeated. A screen shows **one record**; its **child collections** are
offered as a row of tags, and the marked tag's entries are the list beneath.

| The record              | Its child collections                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| "Stammdaten" — the root | "Eventreihen"                                                                                          |
| One event series        | "Klassen", "Events", "Programme", "Leistungsstufen", "Zugangskarten", "Zustiegsstellen", "Verpflegung" |
| One event               | "Programme", "Leistungsstufen", "Zugangskarten", "Zustiegsstellen", "Verpflegung"                      |
| One program             | "Benötigte Ausrüstung"                                                                                 |

Reading the root as a record is what makes the rule hold everywhere. A tag row with one tag — at
the root, and at the equipment leaf — is the same screen as one with seven, with fewer tags.

### The four screens

```
L1  /app/event-series
    ┈ breadcrumb row, empty ┈
    Stammdaten
    [Eventreihen ＋]
    ⠿ Wintersportwoche 2026/27     Öffnen ›        ✎  Ὕ1

L2  /app/event-series/{series}/{category}
    Stammdaten › Eventreihen
    Wintersportwoche 2026/27
    Klassen  [Events ＋]  Programme  Leistungsstufen  Zugangskarten
    Zustiegsstellen  Verpflegung
    ⠿ Woche 1                      Öffnen ›        ✎  Ὕ1

L3  /app/event-series/{series}/events/{event}/{category}
    Stammdaten › Eventreihen › Wintersportwoche 2026/27 › Events
    Woche 2
    [Programme ＋]  Leistungsstufen  Zugangskarten  Zustiegsstellen  Verpflegung
    ⠿ Ski                          Ausrüstung ›    ✎  Ὕ1

L4  /app/event-series/{series}/events/{event}/programs?equipment={program}
    Stammdaten › … › Woche 2 › Programme
    Ski
    [Benötigte Ausrüstung ＋]
    ⠿ Helm                                         ✎  Ὕ1
```

A series-level program's equipment is the same leaf one level up, at
`/app/event-series/{series}/programs?equipment={program}`.

`{category}` is a dynamic segment and `events` is a static one, because it is the only category
whose entries have children of their own and a static segment wins over a dynamic one. Equipment
keeps the `?equipment=` search parameter rather than a segment, because a program name is its
identity and may hold characters a segment cannot carry.

### An event needs something a URL can carry — open, see Q5

`{event}` is the one segment naming a record a teacher typed. That is a problem the rest of the
tree does not have: a program name was deliberately kept out of a segment for exactly this reason,
and an event name is no different — it is editable, it is the identity (US-21), and nothing stops
it holding a `/`, a `%` or a `#`.

Percent-encoding it is the obvious answer and it is not a reliable one. `%2F` inside a path
segment is normalised by proxies and frameworks at several points between the browser and the
page, and where it is decoded early the segment splits in two and the route stops matching. It
works until the day somebody names an event "Woche 1/2".

|       | What names the event                     | What it costs                                                                                                                                                                                     |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **a** | The percent-encoded name, in the segment | Reads well and needs no stored change. Fails on the characters a path cannot carry, and fails in a way that looks like a routing bug rather than a bad name.                                      |
| **b** | The name, in a search parameter          | Cannot fail, and it is the precedent equipment already sets. The address stops reading as a hierarchy at the level where the hierarchy is the point.                                              |
| **c** | A stored id on the event                 | Safe, opaque, survives a rename — and a rename becomes free, because nothing points at the name any more. Costs a generated id per event, and forces a decision about what a registration stores. |
| **d** | The event's array index                  | **A trap.** An index is a position, not an identity: reordering or deleting silently re-points every link, bookmark and open tab at a different event. Do not use it.                             |
|       |                                          |                                                                                                                                                                                                   |

Option **c** carries a second decision with it, which is why it is not simply the best answer. A
registration stores `event` as a name today, so an id would mean either registrations start
storing the id — after which renaming an event no longer has to be refused while students are
assigned to it, because nothing needs rewriting — or they keep the name, and the event then has
two identities, which is the thing this codebase most consistently refuses.

Slugging the name is a fifth option and a worse version of **c**: a slug is safe in a path but two
names can produce one slug, so it needs a uniqueness rule of its own, and it has to be stored to
survive a rename — at which point it is an id that merely looks readable.

### What the four screens share

- **The side navigation never changes.** Five entries: "Registrierungen", "Zuteilungen" and
  "Berichte", which the header scopes; then "Stammdaten" and "Benutzerrechte", which nothing
  scopes. "Stammdaten" is the marked entry at every depth beneath it, and the rights page is
  reached and rendered exactly as it is today.
- **The header's event series rows are not rendered under `/app/event-series`.** What is being
  edited is named by the title and the breadcrumb — which can also name an archived series, where
  the header would offer none.
- **One tag row per screen, and only the marked tag carries its add control.** The control's
  accessible name is that category's own wording, so it reads "Neues Event" on one tag and "Neue
  Klasse" on the next; pressing it opens a name form below the row. This is the tag row that
  already carries per-tag controls on the marked tag, applied to a second row.
- **The breadcrumb names the ancestors only**, stopping at the collection the record was reached
  through — never at the record itself, which the title beneath already names.
- **The title is the record.**

### The breadcrumb's row is reserved even when it is empty

The root has no ancestors and so draws no breadcrumb. Left at that, its title would sit a row
higher than every other title and jump as a teacher moved down the hierarchy. So the breadcrumb
occupies a row with a floor under its height, and at the root that row is simply empty — the same
trick that already keeps a page with buttons and a page without them at one height.

It has to be reserved height rather than a hidden element: a screen-reader-only class is
absolutely positioned and contributes none.

One consequence is worth having deliberately. Whether the trail also names the record it ends at
becomes a single decision in a single component — so if the empty root row proves worse than
saying the record's name twice, that is a one-place change.

**The tag order is the master data menu order, and reordering it is not local.** That order is the
single source of answer order: the report fields, the filter categories and the registration form's
card all follow it, each pinned by a test. Putting Klassen before Events moves class ahead of event
in all four.

### An inherited list says so where its entries would be

An empty per-event list does not mean "nothing offered", it means "whatever the series offers",
and the page has to say which. It says it in the plainest way available: the list area shows its
ordinary empty state, and beneath it one sentence naming what applies instead.

```
[Programme ＋]  Leistungsstufen  Zugangskarten  Zustiegsstellen  Verpflegung

Es gibt noch kein Programm.
Dieses Event verwendet die Programme der Eventreihe.
```

The sentence carries **no link**. Where the series' entries are maintained is one breadcrumb away
and a teacher who wants them is going there anyway; a link inside an empty state invites a detour
from the page they meant to fill in.

One template serves all five categories, built from the category's own title — "die Programme",
"die Leistungsstufen", "die Zugangskarten", "die Zustiegsstellen", "die Verpflegung" — so a
relabelled category cannot leave a stale sentence behind.

**There is no override control, because none is needed.** Adding the first entry is what makes the
event stop inheriting, and removing the last is what makes it start again. The add control on the
marked tag and the row delete already do both, so the state is a consequence of the list rather
than a switch that could disagree with it.

The cost, accepted deliberately: this page does not show _which_ entries are currently in effect,
only that the series supplies them.

### Empty means inherit in exactly one place

The sentence belongs to the five lists an event may override, and nowhere else. An empty list
means something different at every other level, and saying "inherited" at any of them would be
wrong:

| An empty list            | Means                                                           |
| ------------------------ | --------------------------------------------------------------- |
| Eventreihen, at the root | The school has no event series yet                              |
| One of a series' lists   | The students of that series are never asked that question       |
| One of an event's five   | The series' list applies — the only place the sentence is shown |
| A program's equipment    | **That program requires no equipment**                          |

The last is the one to be careful of. Equipment is not a sixth overridable category: it belongs to
the program that requires it and travels with it, so a per-event programs list carries its own
programs' equipment already. A per-event "Ski" with nothing in its equipment list is a deliberate
statement that this event's Ski needs nothing — not a request to fall back on the series' Ski,
which the event stopped using the moment it named a program of its own.

So the equipment leaf keeps the empty state it has today, which says exactly that and needs no
second sentence beneath it:

```
[Benötigte Ausrüstung ＋]

Dieses Programm benötigt keine Ausrüstung.
```

### An event may add, and never take away

The two meanings of "empty" leave one thing unsayable: an event cannot refuse a question its
series asks. An array carries two states, inheritance uses both of them, and there is no third
for "asked nothing here".

That is accepted rather than worked around. Expressing it would need absence and emptiness to say
different things — the field missing meaning "inherit", `[]` meaning "asked nothing" — and with
it a control to move between two states that look identical on screen. The cost lands on every
category of every event to serve the one case that wanted it.

**So the rule for a teacher is: put a list on the series only when every event asks it.** Where
the events disagree, the series leaves that list empty and each event that wants the question
names its own entries:

| The school wants                         | Where the list goes                                |
| ---------------------------------------- | -------------------------------------------------- |
| Every event asks the same access cards   | On the series; no event names any                  |
| Every event asks, but two of them differ | On the series, and those two name their own        |
| Only some events ask at all              | Nowhere on the series; only on the events that ask |

The price is that two events wanting the same list type it twice. The alternative price was a
third state on all five lists of every event, and a switch whose two positions render the same.

## Registration

### The form, reordered

Cards in this order, which is also the order the schema declares the fields in, so the record
reads the way the form asks:

1. **Registrierung** — name, class, attendance
2. **Persönliches** — gender, then date of birth, then phone number
3. **Gesundheit**
4. **Notfallkontakt**
5. **Veranstaltung** — the answers drawn from the five overridable lists

Gender moves above date of birth, and Gesundheit moves above Notfallkontakt.

### Gender gains a third value

`"male" | "female"` becomes `"male" | "female" | "diverse"`, labelled `"Divers"`. It is a value
like the other two, not a fallback: the report prints it, the filter offers it as a tag, and the
figures table counts it in a column of its own beside `"Männlich"` and `"Weiblich"`.

### Two steps, when the events differ

The steering condition is per series and derived, never stored:

> If **any** event of the series names programs of its own, this series registers in two steps.
> Otherwise it registers in one, exactly as today.

|                                | One step (today)   | Two steps                                                                  |
| ------------------------------ | ------------------ | -------------------------------------------------------------------------- |
| What the invitation link opens | The whole form     | The form without **Veranstaltung**                                         |
| What is asked                  | Everything         | Everything but the event's own questions                                   |
| Complete when                  | Nothing is missing | Nothing outside Veranstaltung is missing                                   |
| Then                           | —                  | A teacher assigns the student to an event                                  |
| After the assignment           | —                  | Veranstaltung appears; the registration is incomplete until it is answered |

So a student pre-registers, says whether they are coming and answers everything that does not
depend on which event they land in. Their registration reads complete. A teacher assigns them.
The registration becomes incomplete again, the student opens the same link, and the Veranstaltung
card is now there — filled from their event's lists, or the series' where the event names none.

Nothing about Veranstaltung is stored during the first step.

### Assignment is a step forward, and it does not go back

Assigning is what begins step two, so it needs its own preconditions and one refusal.

**A student may only be assigned once their registration is complete** — in whichever sense
applies: everything answered in a one-step series, everything outside Veranstaltung in a two-step
one. Assigning somebody who has not finished answering produces a registration that is incomplete
for two unrelated reasons at once, and a teacher cannot tell from the board which one they are
looking at. Today the board's rule is only that the student is attending; this narrows it.

**A student whose Veranstaltung answers are complete may not be un-assigned, and may not be moved
to another event.** Their answers were drawn from that event's lists, and taking the event away
would leave answers that came from nowhere, while moving them to another event would leave
answers that came from the wrong place. Both are refused rather than silently cleared — clearing
is a decision about somebody else's data, made by the person least likely to notice it happened.
Un-assigning a student who has not yet answered Veranstaltung is free, because there is nothing
to lose.

What that means for the teacher is a running order rather than a rule to remember: close the
series to students, then assign. A series still open is one where a student can be answering
Veranstaltung at the moment the teacher moves them. The teachers who do this are the skilled
users of the application and the order is theirs to keep — whether the application should enforce
it rather than rely on it is Q6.

## User stories

### US-33: Teacher maintains master data as a hierarchy

- Stammdaten opens on the list of Eventreihen. Opening one shows what that series is made of.
- The lists of one series are reached from that series' record, never from a header selection;
  the header's series rows are not shown anywhere in Stammdaten.
- A breadcrumb names the ancestors of what is open and every step of it is a link; the title names
  the record itself.
- A record's categories are offered as one row of tags, in the master data menu order — Klassen,
  Events, Programme, Leistungsstufen, Zugangskarten, Zustiegsstellen, Verpflegung. Only the marked
  tag offers to add an entry.
- The side navigation holds five fixed entries and names no category, so it can never claim a
  scope the page is not in. "Benutzerrechte" sits beside "Stammdaten" rather than under it.

### US-34: An event carries master data of its own

- An event is a record with a name and five lists: programs (with their equipment), skill levels,
  access cards, pickup points and catering options.
- Each list is maintained exactly as its series-level counterpart, under the same constraints:
  the same maximum count, the same maximum name length, uniqueness within the list.
- A per-event name may equal a per-series name.
- A list left empty is inherited from the series and says so where its entries would be; a list
  with entries replaces the series' list outright. Adding the first entry is what overrides, and
  removing the last is what returns to inheriting — there is no separate control.
- An event may add to what its series asks, never take away: a question the series asks is asked
  of every event. A category only some events need is left off the series and named on those.
- An event whose program is renamed or removed is refused while a student of that event has
  chosen it, on the same terms as the series-level rule.

### US-35: A student is offered their event's lists

- The questions a student is asked, the answers offered for each, and what counts as a complete
  registration are resolved from the student's event, falling back to the series.
- A student with no event yet is offered the series' lists in a one-step series, and is not asked
  the Veranstaltung questions at all in a two-step one.
- Changing a student's event re-resolves the questions; an answer the new event does not offer is
  reported as missing rather than silently kept.

### US-36: Registering in two steps

- A series in which any event names its own programs registers in two steps.
- Step one is everything but Veranstaltung, and a registration that has it all reads complete.
- Assignment to an event begins step two: Veranstaltung appears and the registration reads
  incomplete until it is answered.
- A student may only be assigned once their registration is complete in the sense that applies to
  their series.
- A student whose Veranstaltung answers are complete may be neither un-assigned nor moved to
  another event; the attempt is refused, and nothing is cleared on their behalf.
- A student may amend either step at any time while the series is open to them.

## Sequencing

Each slice is a pull request of its own, and each is green on the whole gate before the next
starts — tests, lint, types, formatting, licence headers, and the rules tests against the
emulator. Test-driven throughout: the failing test that states the new behaviour comes first.

| Slice | What lands                                                                                                                                                                                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | The editor concept: the route tree moves under `/app/event-series/{id}`, the navigation shrinks to its five fixed entries, the category tag row and the breadcrumb arrive, the header rows are hidden in Stammdaten. No stored shape changes. |
| **2** | An event becomes a record — `events` goes from `string[]` to objects with a name. Registrations still store the event's name.                                                                                                                 |
| **3** | The five per-event lists, the resolution rule, and the per-event editor pages.                                                                                                                                                                |
| **4** | The registration form order, the schema field order, and `"diverse"`.                                                                                                                                                                         |
| **5** | The two-step registration and its steering condition.                                                                                                                                                                                         |
| **6** | Merge this document and `spec/refactoring-event-series.md` into `spec/requirements.md`, and delete both.                                                                                                                                      |

Environments are purged and reseeded after slices 2, 3 and 4.

## Open questions

### Q5 — What names an event in a URL?

See "An event needs something a URL can carry" above. The four candidates and what each costs are
stated there; what is open is which of them the events get.

### Q6 — Should assignment be refused while the series is open to students?

The order that keeps a teacher out of trouble is: close the series, then assign. The question is
whether the application enforces it or merely relies on it.

Enforcing it makes a race impossible — a student cannot be answering Veranstaltung at the moment
their event changes underneath them. It also makes assignment unavailable during the window a
teacher may reasonably want it, since a series is opened by generating its invitation link and
is not closed again as a matter of course.

Relying on it keeps the workflow open and leaves the two refusals above as the only guard, which
is what the skilled users this page is built for would expect.
