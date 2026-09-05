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

| Today                                                            | After                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| An event is a name in a list of strings                          | An event is a record: a name plus five lists of its own                        |
| Master data belongs to the series only                           | Five categories belong to a series **and** to each of its events               |
| A student is offered the series' lists                           | A student is offered their event's lists, falling back to the series'          |
| `/app/{seriesId}/master-data/{category}`                         | `/app/event-series/{seriesId}/{category}` — no `master-data` segment left      |
| The header selection scopes Stammdaten too                       | The header rows are hidden in Stammdaten; the record being edited is the URL   |
| Seven sibling category pages                                     | A master list, a record page per series, a record page per event               |
| Nav: Eventreihen · Events · Klassen · …                          | Nav: five fixed entries; the categories move onto the record page as a tag row |
| Gender is male or female                                         | Gender is male, female or diverse                                              |
| The form always asks Veranstaltung                               | Veranstaltung is left out of step one and appears once the event is known      |
| One registration step, complete only when everything is answered | Two steps where any event carries lists of its own                             |

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
  // of its own. Each equipment entry says whether the school lends it — see "Required equipment".
  "programs": [
    {
      "name": "Ski",
      "requiredEquipment": [
        { "name": "Helm", "isRentable": true },
        { "name": "Lange, wasserdichte Hose", "isRentable": false },
      ],
    },
  ],
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
      "programs": [
        {
          "name": "Ski",
          "requiredEquipment": [
            { "name": "Helm", "isRentable": true },
            { "name": "Lawinenpiepser", "isRentable": true },
          ],
        },
      ],
      "skillLevels": [],
      "seasonPassOptions": ["Arlberg"],
      "busPickupPoints": [],
      "foodOptions": [],
    },
  ],
}
```

### An event is a place as well as a week

Which five categories an event may override is not an arbitrary selection, and the reason is worth
stating because it decides what belongs in the list and what does not. In this application an
event names **where** the school goes as much as **when** it goes there — "Woche 2" is a week in
Lech, not merely the second week.

Everything that follows from the place is therefore the event's to say:

| Category                      | Why it moves with the event                                                      |
| ----------------------------- | -------------------------------------------------------------------------------- |
| "Zugangskarten"               | A lift pass is sold by the resort; another resort sells another pass             |
| "Zustiegsstellen"             | The coach picks up on the way to _this_ destination                              |
| "Programme"                   | A place offers what its terrain and its school offer                             |
| "Leistungsstufen"             | Follows the programs — different programs are graded differently                 |
| "Verpflegung"                 | Weakest of the five: catering is often identical everywhere, but need not be     |
| "Klassen" — **not** per event | A class is the school's own structure and has nothing to do with the destination |

Two of those are worth their own note. "Leistungsstufen" is per event because it follows the
programs rather than the place directly, so an event that names its own programs will usually want
its own levels too. "Verpflegung" earns its place by consistency rather than by need — a school
that caters the same everywhere simply never overrides it, which costs nothing.

And "Klassen" is the one that stays with the series precisely because it describes the school
rather than the trip. That is why it is not among the five, and why an event never has one.

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
    Eventreihen
    Stammdaten
    [Eventreihen ＋]
    ⠿ Wintersportwoche 2026/27 ›                    ✎  ὕ1

L2  /app/event-series/{series}/{category}
    Eventreihen › Wintersportwoche 2026/27
    Wintersportwoche 2026/27
    Klassen  [Events ＋]  Programme  Leistungsstufen  Zugangskarten
    Zustiegsstellen  Verpflegung
    ⠿ Woche 1 ›                                    ✎  ὕ1

L3  /app/event-series/{series}/events/{category}?event={event}
    Eventreihen › Wintersportwoche 2026/27 › Events › Woche 2
    Woche 2
    [Programme ＋]  Leistungsstufen  Zugangskarten  Zustiegsstellen  Verpflegung
    ⠿ Ski                          Ausrüstung ›    ✎  Ὕ1

L4  /app/event-series/{series}/events/programs?event={event}&equipment={program}
    Eventreihen › … › Woche 2 › Programme › Ski
    Ski
    [Benötigte Ausrüstung ＋]
    ⠿ Helm                                         ✎  Ὕ1
```

A series-level program's equipment is the same leaf one level up, at
`/app/event-series/{series}/programs?equipment={program}`.

`{category}` is a dynamic segment and `events` is a static one, because it is the only category
whose entries have children of their own and a static segment wins over a dynamic one. So the
category is a segment at both levels, and what moves into a search parameter is only the record's
identity — the event, alongside the program that equipment already names that way.

### An event is named by a search parameter, not by a segment

An event is the one record in the tree whose identity a teacher typed. That is a problem the rest
of the tree does not have: a program name was deliberately kept out of a segment for exactly this
reason, and an event name is no different — it is editable, it is the identity (US-21), and
nothing stops it holding a `/`, a `%` or a `#`.

Percent-encoding it into a segment is the obvious answer and it is not a reliable one. `%2F`
inside a path segment is normalised by proxies and frameworks at several points between the
browser and the page, and where it is decoded early the segment splits in two and the route stops
matching. It works until the day somebody names an event "Woche 1/2".

The existing segment is no precedent for it, which is easy to assume and wrong. The event series
id in `/app/event-series/{series}` is a Firestore auto-id, and `documentIdSchema` refuses a `/`
outright — so that segment has never carried an encoded slash and never can. Nothing in this
application has yet put teacher-typed text in a path segment, and where a name genuinely could
hold anything, the existing answer was a search parameter.

So the event joins it: `?event=`, beside the `?equipment=` that is already there. The address
stops reading as a hierarchy at that level, which is a real loss on the pages where the hierarchy
is the point — and the breadcrumb, not the address bar, is what the concept relies on to show it.

The asymmetry is not about the encoding but about what is re-normalised afterwards. A path is
structural, so routers and proxies resolve `.` and `..`, collapse `//`, and may decode `%2F` back
to a separator before matching — the encoding was right, and something downstream undid it. A
query string has no structure to normalise, so nothing between the browser and the handler
re-splits it, and the only parser is the application's own.

One trap remains on that side and it must not be forgotten: a query is read with
form-urlencoded semantics, where a **literal** `+` decodes as a space — so an event named
"Woche 1+2" would come back as "Woche 1 2". `encodeURIComponent` escapes it to `%2B`, which is
why the name survives. Every such link is therefore built by encoding the value, never by joining
strings.

The alternatives were weighed and set aside:

|       | What names the event                     | Why not                                                                                                                                                                                      |
| ----- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **a** | The percent-encoded name, in the segment | Fails on the characters a path cannot carry, and fails in a way that looks like a routing bug rather than a bad name.                                                                        |
| **c** | A stored id on the event                 | The clean answer, and the expensive one: an id that is worth having is a document id, which means collections and references — the model deliberately dropped in favour of the one document. |
| **d** | The event's array index                  | A position, not an identity: reordering or deleting silently re-points every link, bookmark and open tab at a different event.                                                               |

Option **c** is the one to come back to, and it is not a URL decision on its own. Giving events
real ids means giving them documents, and that is the same refactoring the document size limit
would eventually force. Until something forces it, paying for it to get a tidier address is a
poor trade — so readable paths wait for the day the storage changes for a reason of its own.

Slugging the name would be a worse version of **c**: a slug is safe in a path but two names can
produce one slug, so it needs a uniqueness rule of its own, and it has to be stored to survive a
rename — at which point it is an id that merely looks readable.

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
  Klasse" on the next; pressing it opens the dialog that names a new entry, the same one renaming
  uses. This is the tag row that already carries per-tag controls on the marked tag, applied to a
  second row.
- **A row with a record page of its own is opened by its name**, which carries the chevron and
  reads as the control it is — there is no separate control beside it. A row whose entry leads
  somewhere more particular says where instead, as a program's does for its equipment.
- **The breadcrumb names the whole path**, ending at the record the page is about — so its last
  step and the title beneath it say the same word, at every level including the root.
- **The title is the record.**

### The breadcrumb ends where the page does

A trail that stopped one step short would be a different trail on every screen: at the root it
would be empty, and a teacher reading down the hierarchy would watch the title jump up a row and
back down again. Naming the record at the end costs one repeated word and buys a row that is
always there, always the full address of the page, and never has to explain itself.

The last step is where the teacher already is, so it is the one that is not a link: it is plain
text, marked `aria-current="page"`, exactly as a breadcrumb is expected to be. Every step before
it is a link.

The trail begins at "Eventreihen" rather than at "Stammdaten": the navigation already says which
of its five entries the teacher is in, and a first step that never changes carries nothing. At the
root that leaves one step, which is the collection listed beneath — the only screen whose trail
does not end at a record, because the root has no record page under it.

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

## Required equipment says whether it can be borrowed

A program's required equipment is the list of what a student needs in order to take part. Today
that list means two things at once, because everything on it is also something the school lends —
so a teacher who wants to tell students to bring long waterproof trousers has no way to say it
without offering to supply them.

Each entry therefore carries a flag of its own:

```jsonc
"requiredEquipment": [
  { "name": "Helm", "isRentable": true },
  { "name": "Lange, wasserdichte Hose", "isRentable": false },
]
```

This is what an alternative program most needs. Its requirements are usually things a household
already has, and listing them is the point — a student has to know to pack them — while lending
them is not something the school does.

### Where it shows up

| Where                      | What changes                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The equipment leaf         | Each row gains the flag beside its name; the list still holds at most `MAX_EQUIPMENT_ITEMS` entries with unique names                                        |
| `rentsEquipment`           | Narrows from "some program requires anything" to "some program requires something **borrowable**" — it is what decides whether renting is asked about at all |
| The form's equipment block | Lists **every** required item, so the student sees the whole of what they need; only the borrowable ones can be ticked, and the rest read as theirs to bring |
| The form's rental question | "Musst du etwas ausleihen?" appears only when the chosen program has at least one borrowable item. A program with none shows a packing list and asks nothing |
| The measurements           | Unchanged, and still behind the rental answer — which now cannot be reached by a program that lends nothing                                                  |
| `scopeRentalToProgram`     | Scopes a student's rentals to the chosen program's **borrowable** names, and clears the rental answer when the program has none                              |
| The completeness check     | Unchanged in shape; the rental branch is simply unreachable where nothing is borrowable                                                                      |
| The report                 | Gains a second field, "Ausrüstung", beside the existing "Leihausrüstung" — see below                                                                         |
| The in-use guard           | Gains the flag: withdrawing it is refused while a student holds that item                                                                                    |

A student's `rentedEquipment` stays an array of names, so nothing about a stored registration
changes shape.

### The flag is set as a pair of tags, not a switch

The dialog that names an equipment item gains one more control: two tags, exactly one of which is
chosen.

```
Name  [ Lange, wasserdichte Hose        ]

      [Keine Leihausrüstung]  Leihausrüstung
```

Both words are already constants — the filter offers the same pair for whether a student needs to
borrow anything. The noun carries over cleanly: there, a student does or does not need rental
equipment; here, an item either is rental equipment or is not. One vocabulary, used of the two
things it can sensibly be used of.

Three things follow from it being one choice rather than two switches:

- **It is a radio group, not two pressed buttons.** Two independent `aria-pressed` tags would be
  heard as two unrelated toggles, either or neither of which might be on. A single choice reads as
  one, so the pair carries radio semantics and the tags are its options.
- **The shared list does not learn about it.** `CrudList` serves all seven categories and only
  equipment has a second field; teaching it a rental flag would be one module changing for one
  caller's reason. The equipment leaf supplies the extra control to the dialog instead.
- **A new item needs a side to start on.** Whichever it is, it is stated once and the seeded
  defaults follow it, rather than each caller assuming.

### Withdrawing the flag is refused while somebody holds the item

A student who has ticked "Helm" gave an answer that only meant anything while "Helm" was
borrowable. Taking the flag away is therefore the same act as renaming or removing an entry a
student has chosen, which the in-use guard already refuses, and it is refused on the same terms:
not while a registration of this series names it.

The consistency is the point. Three different ways of invalidating the same answer — renaming the
entry, deleting it, and withdrawing its flag — should not have three different outcomes, and a
teacher should not have to learn which of them is the one that quietly changes what a student
said.

### The report names both halves of the list

The two halves answer different questions, so they are two fields rather than one with a
qualifier, and a teacher switches on whichever they need — or both:

| Field            | Shows                                                     |
| ---------------- | --------------------------------------------------------- |
| "Ausrüstung"     | The student's program's **non-borrowable** required items |
| "Leihausrüstung" | What the student actually asked to **borrow**             |

"Ausrüstung" comes first in the field selector and in the printed lines, because a student packs
their own things before collecting anything from the school.

**The form does not split the same way.** It keeps one block, headed "Benötigte Ausrüstung", with
every required item in it and only the borrowable ones tickable. A student is answering one
question — what do I need, and what can I borrow — while a teacher is reading two, so the split
earns its place in the report and not in the form.

The two are different in kind, and the difference is deliberate rather than an oversight to be
tidied away later. "Leihausrüstung" is the student's own answer and differs from student to
student. "Ausrüstung" is their **program's** data, read through their choice of program — so every
student on the same program shows the same list. That is what makes it useful for packing a coach,
and it is why it is offered whenever any program requires something non-borrowable, mirroring the
way `rentsEquipment` offers the rental field.

With per-event programs, both resolve the program list from the student's event and fall back to
the series, exactly as every other program-dependent answer does.

## Registration

### The form keeps its cards where they are

Cards in this order, which is also the order the schema declares the fields in, so the record
reads the way the form asks:

1. **Registrierung** — name, class, attendance
2. **Persönliches** — gender, then date of birth, then phone number
3. **Notfallkontakt**
4. **Veranstaltung** — the answers drawn from the five overridable lists
5. **Gesundheit**

This is the order the form already has, and it stays. A student says who they are, who to call,
what they are coming for, and what somebody would need to know if it went wrong — which reads in
the order the questions matter, and puts the one card a school might have to act on last, where
it is not buried between two others.

What step one does is leave **Veranstaltung** out. The cards around it close up rather than
moving, so the form a student meets twice is the same form both times, with one card more the
second time.

Within the cards, two orders move. Gender is asked before date of birth in **Persönliches**. And
the measurements a rental asks for in **Veranstaltung** are weight, then height, then shoe size,
which is the reverse of the order the form uses today.

### Gender gains a third value

`"male" | "female"` becomes `"male" | "female" | "diverse"`, labelled `"Divers"`. It is a value
like the other two, not a fallback: the report prints it, the filter offers it as a tag, and the
figures table counts it in a column of its own beside `"Männlich"` and `"Weiblich"`.

The three are always in that order — `male`, `female`, `diverse` — in the enum, in the labels, in
the form's options, in the filter's tags and in the figures table, whose columns become
`"Männlich" | "Weiblich" | "Divers" | "Gesamt" | "Teilnahme"`.

## One order, everywhere

Three orders change in this refactoring, and each of them is copied in several places that a test
already pins. They are written out here in full so an implementation has one thing to compare
against rather than several to reconcile.

### The master data menu, which everything else follows

```
Klassen · Events · Programme · Leistungsstufen · Zugangskarten · Zustiegsstellen · Verpflegung
```

Klassen and Events swap; the rest is unchanged. This is the tag row's order on an event series
record, and an event's row is the same list without Klassen and Events.

### The report's field row

Class moves ahead of event, following the menu. Nothing else moves, because the form's cards do
not:

```
attendance · class · event · gender · dateOfBirth · contact · program ·
ownEquipment · rentedEquipment · measurements · skillLevel · seasonPassOption ·
busPickupPoint · food · health · completeness
```

`ownEquipment` is the new one, labelled "Ausrüstung", and it sits ahead of `rentedEquipment`
("Leihausrüstung"). Both stay beside the program they are drawn from, and the measurements stay
behind them, because a shoe size is asked for in order to borrow.

The order runs inside a tag as well as between them, because a tag that gathers several fields is
still read as one run of lines:

| Tag            | Its fields, in order                                                                 |
| -------------- | ------------------------------------------------------------------------------------ |
| `contact`      | the student's own number, then the emergency contact's name, relationship and number |
| `health`       | the illness note, then whether medication is carried                                 |
| `measurements` | **weight, then height, then shoe size**                                              |

`measurements` is the one that actually moves, and it moves in the **form** rather than the
report: the form asks shoe size, height, weight today, and is reordered to agree with the report.
The other two already agree.

### The filter's category row

Follows the field row, skipping what nothing filters on:

```
attendance · class · event · gender · program · equipmentRental · skillLevel ·
seasonPassOption · busPickupPoint · foodOption · health · completeness
```

### The registration form and its schema

The schema declares its fields in the form's order, so the stored record reads the way the
student was asked. Cards, and the fields within them, exactly as the form section above states.

### The three rows say the same thing

Put side by side, the form, the field row and the filter row run in one order, and the tag that
used to make that impossible no longer does.

| The form asks  | The report shows                       |
| -------------- | -------------------------------------- |
| Registrierung  | `attendance`, and class and event      |
| Persönliches   | `gender`, `dateOfBirth` ┐              |
| Notfallkontakt | ┘ `contact`                            |
| Veranstaltung  | the list-backed answers, in menu order |
| Gesundheit     | `health`                               |

`contact` is what forced the earlier compromise: it bundles the student's own `phoneNumber`,
asked in Persönliches, with the three emergency contact fields asked in Notfallkontakt. Those two
cards are adjacent and always were, so the bundle straddles nothing — one tag spans them both and
the row still reads in the form's order. Nothing has to be split, and neither row has to apologise
for the other.

What keeps them tied is the part with one source: the six list-backed fields follow the master data
menu, and the filter row follows the field row. Those are the invariants tests pin.

### Two steps, when the events differ

The steering condition is per series and derived, never stored:

> If **any** event of the series names **any** list of its own, this series registers in two
> steps. Otherwise it registers in one, exactly as today.

It is deliberately not "names programs of its own", though programs are what the case that
prompted this looks like. Any of the five carries the same problem: an event with its own access
cards, under a series that registers in one step, would ask a student for an access card before
anybody knows which event they are in — and then, on assignment, their answer turns out not to be
one their event offers. That is precisely what two steps exist to prevent, so the trigger is the
condition itself rather than one instance of it.

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

Assigning is what begins step two, so it carries three rules of its own — all of them enforced
where the write happens, none of them a wizard or a prompt.

**A series open to students cannot be assigned in.** Assigning, reassigning and un-assigning all
require the series to be closed first. While it is open a student may be answering Veranstaltung
at the moment a teacher moves them, and neither of them would ever know.

Closing is the teacher's own act, and the application never does it on their behalf. An
assignment that closed the series as a side effect would shut students out of a registration they
were in the middle of, decided by somebody who was doing something else entirely — so the write
is refused, and the teacher closes the series and tries again.

**A student may only be assigned once their registration is complete** — in whichever sense
applies: everything answered in a one-step series, everything outside Veranstaltung in a two-step
one. Assigning somebody who has not finished answering produces a registration that is incomplete
for two unrelated reasons at once, and a teacher cannot tell from the board which one they are
looking at. Today the board's rule is only that the student is attending; this narrows it.

**A student who has answered anything drawn from their event's own list cannot be reassigned.**
That answer came from the event rather than from the series, so moving the student elsewhere, or
taking their event away, would leave an answer sourced from an event they are no longer in. The
write is refused rather than the answer quietly cleared, which is the same shape as the rule that
already refuses to rename a list entry a student has chosen.

It follows the steering condition rather than naming one category, for the reason an event is a
place: a lift pass bought for one resort is worthless at the other, and a pickup point on the way
to Montafon is not on the way to Lech. Naming only the program would let through exactly the
moves the change of place makes wrong — and would need a reason why a program invalidates a move
while an access card does not, which there is not one of.

The rule is still bounded by where the answer came from, not by what it is. It does not fire on an
answer the series supplied, which survives any move; and it does not fire before the student has
answered anything the event owns, when there is nothing yet to invalidate. In a one-step series no
event owns a list at all, so it never fires there.

### An event that students have answered against cannot be removed

The refusals compose into a dead end, and it is the intended one. Removing an event is already
refused while a registration names it, and un-assigning is now refused once the student has
answered something that event owns — so an event whose students have answered against it cannot
be taken away at all.

That is the right answer rather than a gap to be patched. Removing an event mid-series is not a
correction, it is a change of plan: the students assigned to it answered questions that only that
event asked, and there is no state to put them back into that is not simply a different plan. The
means for a change of that size is to archive the series and create the next one from a copy of
it — which keeps what the students already said where it belongs, in a series that still describes
what happened.

Deleting the whole series remains possible, and takes its registrations with it. That is the only
way out, and it says what it is doing.

## User stories

### US-33: Teacher maintains master data as a hierarchy

- Stammdaten opens on the list of Eventreihen. Opening one shows what that series is made of.
- The lists of one series are reached from that series' record, never from a header selection;
  the header's series rows are not shown anywhere in Stammdaten.
- A breadcrumb names the whole path down to what is open, ending at the record itself; every step
  but the last is a link, and the title beneath repeats that last step.
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

- A series in which any event names any list of its own registers in two steps.
- Step one is everything but Veranstaltung, and a registration that has it all reads complete.
- Assignment to an event begins step two: Veranstaltung appears and the registration reads
  incomplete until it is answered.
- Assigning, reassigning and un-assigning are refused while the series is open to students.
- A student may only be assigned once their registration is complete in the sense that applies to
  their series.
- A student who has answered anything drawn from their event's own list may not be reassigned or
  un-assigned; the attempt is refused, and nothing is cleared on their behalf.
- A student may amend either step at any time while the series is open to them.

### US-37: Teacher says which required equipment the school lends

- Every entry of a program's required equipment is either borrowable or the student's own to
  bring, chosen in the dialog that names it as one of two tags.
- A student is shown everything their program requires, and may tick only what is borrowable.
- The rental question, and the measurements behind it, are asked only where the chosen program
  has something borrowable; a program that lends nothing shows a packing list and asks nothing.
- Making an entry non-borrowable is refused while a student of this series has borrowed it, on
  the same terms as renaming or removing it.
- The report offers the two halves as separate fields, "Ausrüstung" for what the student brings
  and "Leihausrüstung" for what they borrow, either or both.

## Sequencing

Each slice is a pull request of its own, and each is green on the whole gate before the next
starts — tests, lint, types, formatting, licence headers, and the rules tests against the
emulator. Test-driven throughout: the failing test that states the new behaviour comes first.

| Slice | What lands                                                                                                                                                                                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1** | The editor concept: the route tree moves under `/app/event-series/{id}`, the navigation shrinks to its five fixed entries, the category tag row and the breadcrumb arrive, the header rows are hidden in Stammdaten. No stored shape changes. |
| **2** | An event becomes a record — `events` goes from `string[]` to objects with a name. Registrations still store the event's name.                                                                                                                 |
| **3** | The five per-event lists, the resolution rule, the per-event editor pages, and the borrowable flag on required equipment.                                                                                                                     |
| **4** | The order of the fields within the form's cards, the schema field order, and `"diverse"`.                                                                                                                                                     |
| **5** | The two-step registration and its steering condition.                                                                                                                                                                                         |
| **6** | Merge this document and `spec/refactoring-event-series.md` into `spec/requirements.md`, and delete both.                                                                                                                                      |

Environments are purged and reseeded after slices 2, 3 and 4.
