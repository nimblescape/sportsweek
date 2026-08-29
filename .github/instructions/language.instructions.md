---
description: "Language rule for this repository — English everywhere project-side; German only where the word is a string the program actually shows."
applyTo: "**/*"
---

<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Language

The application speaks German to its users. Everything else about it is written in English.

## English, without exception

Commit messages, pull request titles and descriptions, issue text, branch names, code,
identifiers, comments, `spec/`, and these instruction files.

This holds **regardless of the language the conversation is being held in**. A request made
in German is still answered with an English commit and an English pull request. The language
of the discussion and the language of the repository are unrelated.

## German, only as a quoted program item

A German word belongs in project text only when it _is_ a string the program shows — a label,
a button caption, a validation or error message — and then it appears quoted, as the artefact
under discussion:

```text
Renames the first skill level from "Absoluter Anfänger" to "Keine Vorkenntnisse".
```

Never as prose. The sentence around the quote stays English, and German terms do not leak
into the explanation:

```text
Leistungsstufe is the vocabulary the Schulsportwoche uses, where students   <- no
are grouped by ability; the assignment produces a Gruppe, not a Stufe.

"Leistungsstufe" is the term already used for ability grouping on a school   <- yes
sports week; the assignment produces a group, this field states a level.
```

## German the interface speaks addresses everyone

A German noun for a person carries a gender, and the masculine form does not stand in for
everybody. Every such noun the interface shows names all of them.

Prefer a word that has no gender to begin with — it reads better than any punctuation:

| Instead of        | Write                      |
| ----------------- | -------------------------- |
| Neuer Benutzer    | Neue Person                |
| Der Lehrer        | Die Lehrperson             |
| Anzahl der Nutzer | Anzahl der Registrierungen |

Where the role has no neutral word, use the colon form — one word, screen readers pause at it,
and it is what the school itself writes:

```text
Schüler:innen, Benutzer:innen, Anfänger:in, Teilnehmer:innen
```

- One form throughout. Not `Schülerinnen und Schüler` in one dialog and `Schüler:innen` in
  the next, and never `SchülerInnen`, `Schüler/innen` or a bare `Schüler`.
- It applies to every string the program shows: labels, buttons, hints, validation and error
  messages, and the seeded master data a teacher starts from.
- It does not apply to the words for a gender itself. "Männlich" and "Weiblich" are the
  answers to a question about gender (US-11), not a way of addressing anyone.
- Identifiers stay English, so none of this reaches the code: the label is `Schüler:innen`,
  the type is still `RosterStudent`.

## Internals stay English behind a German label

Renaming what the user sees never renames what the code calls it:

| Visible label   | Route          | Collection    | Field        |
| --------------- | -------------- | ------------- | ------------ |
| Leistungsstufen | `skill-levels` | `skillLevels` | `skillLevel` |

A caption change is a caption change. Turning it into a collection rename would be a data
migration, which is a different decision with different consequences.

## Why

Reviewers, tooling and search work across one language. Commit history and pull requests are
read long after the conversation that produced them is forgotten, often by people who were
not part of it — and a description half in German is searchable in neither language.
