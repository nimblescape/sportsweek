---
description: "Clean Code — names that carry intent, functions that do one thing, arguments that read at the call site, command-query separation, and tidying only what the change already touches."
applyTo: "**/*.ts, **/*.tsx, **/*.mjs"
---

<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Clean Code

Code is read far more often than it is written, and almost always by someone who was not there
when it was written. Everything below follows from that one fact.

## A name carries the intent

A name answers why the thing exists and what it is for. If a comment is needed to say what a
name means, the name was the wrong one.

- **Name the concept, not the mechanism.** `attendingStudents`, not `filtered`; `isNameTaken`,
  not `queryResult`.
- **No abbreviation** unless it is the word the domain itself uses. `registration`, not `reg`.
- **No type or scope in the name.** Not `studentArray`, not `strName`, not `m_count` — the type
  is already declared and the compiler already knows it.
- **One word per concept, across the whole codebase.** Pick `fetch` or `load` or `read` and keep
  it; three words for one idea make the codebase unsearchable.
- **Name length follows scope.** A two-line `map` may call its parameter `one`; something visible
  across a module earns a full name.
- **A boolean reads as an assertion**: `isArchived`, `hasRegistrations`, `mayEdit`.

```ts
// no — every name asks the reader to go and look
function check(list: Item[], f: string): Item[] {
  return list.filter((x) => x.n === f);
}

// yes — the signature is the explanation
function itemsNamed(items: readonly Item[], name: string): Item[] {
  return items.filter((item) => item.name === name);
}
```

## A function does one thing

The test is mechanical: if a section can be extracted into a function whose name is not simply a
restatement of its body, then the original was doing more than one thing.

- **One level of abstraction per function.** Deciding a policy and formatting a string are two
  levels; a function that does both makes the reader change altitude mid-paragraph.
- **The file reads top-down.** A function is followed by the ones it calls, each a level lower,
  so the file can be read as prose from its first line rather than assembled from its last.
- **Extract a condition worth a sentence.** `if (isStillOffered(series, answer))` says what
  `if (series.programs.some(…) && !series.isArchived)` makes the reader work out.

## Arguments read at the call site

The call site is what a reader sees first, and often all they see.

- **Fewer arguments is better.** Three is already a lot; beyond that, the arguments are usually a
  concept that has not been given a name yet.
- **No boolean flag parameter.** A flag announces that the function does two things — so write
  the two, or take an options object whose field name speaks at the call site.
- **No output parameters.** Return the value; do not fill in a caller's object.
- **Null is not an argument.** Passing null to mean "not applicable" makes every reader check
  the body. Give the case its own function, or a type that admits it honestly.

```ts
// no — what is `true`?
saveRegistration(input, true);

// yes
saveRegistration(input, { closeAfterwards: true });
```

## A function commands or answers, never both

Either it changes something, or it tells the caller something. A getter that also writes and a
validator that also stores are the surprises that cost an afternoon.

Where both genuinely belong in one atomic step — a transaction that decides and then writes —
say so in the name: `claimName`, not `checkName`.

## Failure is a value the caller must handle

- **No sentinel returns.** Do not signal failure with `null`, `-1` or an empty string that also
  means something else; give the caller a result it cannot silently ignore.
- **Never return null for a collection.** An empty array is the empty case, and it needs no
  guard at every call site.
- **Fail with context.** What was attempted, and on what — never a bare rethrow that loses the
  only information anyone will want.

## Structure

- **One reason to change per module.** When a file is edited for two unrelated reasons, it is two
  files.
- **Keep together what changes together**, and expose only what a caller needs; a helper nobody
  outside the file calls is not exported.
- **Delete dead code.** Nothing is kept "in case", and nothing is commented out — version control
  already remembers, and it remembers accurately.

## Tidy where you passed, and no further

Leave the code you touched better than you found it: a name clarified, a nested condition
flattened, a function split where the change made the seam obvious.

That licence stops at the edge of the change. Tidying code the change never touched enlarges the
diff and buries the thing a reviewer came to read — so it is a change of its own, made on its own
terms.

## Why

Every rule here trades a moment of the writer's convenience for an hour of a reader's. The
codebase is the design; if it cannot be read, it cannot be reasoned about, and it cannot be
safely changed.
