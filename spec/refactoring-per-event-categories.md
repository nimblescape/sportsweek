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
| Nav: Eventreihen · Events · Klassen · …                              | Nav: Eventreihen · Klassen · Events · … , the categories indented under it       |
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

## The master data editor: drill-down record pages (Concept A)

The most common editor for a master-detail relationship, and the one this adopts: a master list
page; opening a row navigates to that record's page; the record's child collections are reached
from there; a breadcrumb names the trail back.

The event series id leaves the global scope segment, which is what takes Stammdaten out of the
header selection. `/app/event-series` is already a segment the selection ignores, so the whole
tree moves beneath it and the `master-data` segment disappears:

```
/app/event-series                                   Eventreihen — the master list
/app/event-series/{series}                          → redirects to classes
/app/event-series/{series}/classes                  ┐
/app/event-series/{series}/events                   │ the Eventreihe's own lists
/app/event-series/{series}/programs      ?equipment=│
/app/event-series/{series}/skill-levels             │
/app/event-series/{series}/season-pass-options      │
/app/event-series/{series}/bus-pickup-points        │
/app/event-series/{series}/food-options             ┘
/app/event-series/{series}/events/{event}           → redirects to programs
/app/event-series/{series}/events/{event}/programs  ?equipment=   ┐ the five overridable
/app/event-series/{series}/events/{event}/skill-levels            │ lists, at event level
/app/event-series/{series}/events/{event}/season-pass-options     │
/app/event-series/{series}/events/{event}/bus-pickup-points       │
/app/event-series/{series}/events/{event}/food-options            ┘
/app/users                                          Benutzerrechte
```

The header's event series rows are **not rendered** anywhere under `/app/event-series`. What is
being edited is named by the page and by the breadcrumb, which is a place the reader is already
looking, and which can name an archived series the header would not offer.

Equipment keeps the `?equipment=` search parameter rather than a path segment, because a program
name is its identity and may hold characters a segment cannot carry.

### Navigation — open, see Q1

The requested order and indentation is settled at the series level:

```
Registrierungen                 ┐
Zuteilungen                     │ scoped by the header selection
Berichte                        ┘
Stammdaten
  Eventreihen                   ← the master list
    Klassen
    Events
    Programme
    Leistungsstufen
    Zugangskarten
    Zustiegsstellen
    Verpflegung
  Benutzerrechte
```

Where the **per-event** lists belong is the open question. The nav cannot list them per event —
there are as many sets as there are events, and data does not go in a navigation. Q1 states the
candidates.

**Reordering the menu is not local.** The master data menu is the single source of answer order:
the report fields, the filter categories and the registration form's card all follow it, each
pinned by a test. Putting Klassen before Events moves class ahead of event in all four.

### Inherited state — open, see Q2

A per-event list page has to show that an empty list is not "nothing offered" but "whatever the
series offers". Q2 states the candidates.

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

## User stories

### US-33: Teacher maintains master data as a hierarchy

- Stammdaten opens on the list of Eventreihen. Opening one shows what that series is made of.
- The lists of one series are reached from that series' record, never from a header selection;
  the header's series rows are not shown anywhere in Stammdaten.
- A breadcrumb names the trail and every step of it is a link.
- Menu order is Eventreihen, then Klassen, Events, Programme, Leistungsstufen, Zugangskarten,
  Zustiegsstellen, Verpflegung; the categories are indented under Eventreihen, and Benutzerrechte
  sits beside Eventreihen rather than under it.

### US-34: An event carries master data of its own

- An event is a record with a name and five lists: programs (with their equipment), skill levels,
  access cards, pickup points and catering options.
- Each list is maintained exactly as its series-level counterpart, under the same constraints:
  the same maximum count, the same maximum name length, uniqueness within the list.
- A per-event name may equal a per-series name.
- A list left empty is inherited from the series; a list with entries replaces the series' list
  outright.
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
- A student may amend either step at any time while the series is open to them.

## Sequencing

Each slice is a pull request of its own, and each is green on the whole gate before the next
starts — tests, lint, types, formatting, licence headers, and the rules tests against the
emulator. Test-driven throughout: the failing test that states the new behaviour comes first.

| Slice | What lands                                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1** | The editor concept: the route tree moves under `/app/event-series/{id}`, the nav is reordered and indented, the breadcrumb arrives, the header rows are hidden in Stammdaten. No stored shape changes. |
| **2** | An event becomes a record — `events` goes from `string[]` to objects with a name. Registrations still store the event's name.                                                                          |
| **3** | The five per-event lists, the resolution rule, and the per-event editor pages.                                                                                                                         |
| **4** | The registration form order, the schema field order, and `"diverse"`.                                                                                                                                  |
| **5** | The two-step registration and its steering condition.                                                                                                                                                  |
| **6** | Merge this document and `spec/refactoring-event-series.md` into `spec/requirements.md`, and delete both.                                                                                               |

Environments are purged and reseeded after slices 2, 3 and 4.

## Open questions

### Q1 — Where do the per-event lists live in the navigation?

The nav is three levels deep already (Stammdaten › Eventreihen › Klassen), it collapses to an
icon rail on a wide screen and to a strip across the top on a narrow one, and it may not contain
data rows.

|       | Option                                                                                                                                                   | Consequence                                                                                                                      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **a** | Nav stops at the Eventreihe. Per-event lists are reached by opening an event; the breadcrumb carries the trail.                                          | Three levels, unchanged shape. While editing an event's programs the nav marks only "Events".                                    |
| **b** | Nav grows a fourth, contextual level under Events while an event is open, headed by the event name.                                                      | The whole trail is visible, but the nav's contents change as you navigate, and a fourth level cannot survive the collapsed rail. |
| **c** | Drop "Stammdaten" as a level: Eventreihen and Benutzerrechte become top-level items with icons of their own. Option b then costs three levels, not four. | Buys back the level option b needs; costs the grouping that tells the two apart from the header-scoped pages.                    |
| **d** | Nav lists only Eventreihen and Benutzerrechte; every category becomes a tab on its record page.                                                          | Purest Concept A and it scales to any depth, but it drops the indented category list that was asked for.                         |

### Q2 — How is an inherited list shown on a per-event page?

|       | Option                                                                                                                                                                         | Consequence                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **a** | The series' entries are listed **greyed** — muted text, no drag handle, no rename or delete — under a strip naming where they come from, with one button to start an own list. | The teacher sees what students of this event will actually be offered without leaving the page. A greyed row that ignores a drag needs the strip to explain why.                                 |
| **b** | The normal empty state, plus a sentence naming the series the list falls back to and a link to it.                                                                             | Simplest, and nothing looks editable that is not. What is currently in effect can only be seen by navigating away.                                                                               |
| **c** | Starting an override copies the series' entries in as real, editable rows.                                                                                                     | Familiar, but it severs inheritance at the first press: a later change to the series list never reaches the event, and "not overridden" becomes indistinguishable from "overridden identically". |
| **d** | An explicit switch per category — "own entries for this event" — off by default, with option a's greyed list beneath it while off.                                             | Makes the state a control rather than an inference. One more control per page.                                                                                                                   |

### Q3 — What bounds the document?

All of this lives in one event series document, and Firestore caps a document at 1 MiB. At the
caps the schema allows today — 100 events, each with five lists of up to 100 entries of up to 120
characters, programs carrying up to 10 equipment items — the worst case is several megabytes, so
the document can be made unwritable through the UI alone. A realistic series is a few tens of
kilobytes.

Candidates: cap the number of events far lower than the number of list entries; cap a per-event
list lower than a per-series one; or validate the encoded size of the whole document on write and
refuse with a message that says what to remove. This must be settled before slice 3.

### Q4 — Does the answer order follow the menu?

Putting Klassen before Events reorders the report's field row, the filter's category row and the
registration form's card, because all three are pinned to the menu order by tests. Confirm that
this is wanted, or the menu stops being the single source of that order.
