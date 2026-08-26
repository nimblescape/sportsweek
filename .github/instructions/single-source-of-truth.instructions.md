---
description: "Single source of truth — which literals earn a constant and which stay readable, types and schemas derived rather than restated, and a module that owns any answer more than one caller needs."
applyTo: "**/*"
---

<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Single Source of Truth

Every fact the system relies on is written down once. A second copy is not redundancy — it is
a copy that will disagree with the first, at a time nobody is looking.

## Which literals earn a constant

Not every string in the code is a fact the system relies on. Three kinds are.

An **identifier** is a string the program matches on rather than shows: a collection name, a
document field, a stored status value, a custom claim, a cookie name, an error code. Nothing
about it is legible on its own — `"customerOrders"` is right only because the same spelling was
used when the document was written, and a misspelling fails silently instead of loudly.

```ts
// no
const doc = await db.collection("customerOrders").doc(id).get();

// yes
const doc = await db.collection(COLLECTIONS.customerOrders).doc(id).get();
```

A **constraint** is a bound the behaviour depends on: a maximum length, a page size, a retry
count, a timeout. Where two places have to agree on one — a schema and the form that feeds it,
two lists that may not outgrow each other — they share the constant, so they cannot drift into
contradicting each other.

**Text the program shows** earns one as soon as a second caller needs the same sentence, and an
error message almost always does: the wording a server refuses with is the wording a client
renders and a test asserts on. Three copies of a sentence are three sentences, and a rewording
will only ever find two of them.

Keep a stored value apart from the label shown for it. One constant for what is written to the
database, another for what the user reads — so display text can never become a stored value,
and a rewording never becomes a data migration.

## Paths are written where they are read

A route or a link target is none of the three, and reads better spelled out.
`href="/app/master-data/programs"` says where it goes; `href={ROUTES.masterData.programs}` says
only that somebody decided, and leaves the reader to go and find out where. Nor is a path a
name the code invented: the router ties it to a file on disk, so moving the page is what changes
it, and that is a change with tooling behind it.

A path earns a constant when something other than the spelling asks for one — a prefix a guard
tests, a list a navigation is built from, a destination chosen by role. The constant then exists
for the decision, and the pages it names still spell their own links out.

## Derive, do not restate

Where one fact implies another, compute it:

- **Types come from schemas.** Infer the type from the validator; never hand-write a type
  beside a schema describing the same shape.
- **Schemas come from schemas.** An input schema is the stored shape minus the fields the
  server owns, so a field added to one cannot be forgotten in the other.
- **Lists come from lists.** Map over the keys of an existing definition rather than naming
  every field a second time.

When a copy genuinely cannot be avoided — a declarative rules language cannot import
application code, a generated client cannot import its own source — say so at both ends, and
name the other end. A comment that points one way only is half a link.

## A module owns what more than one caller needs

If two callers need the same answer, neither works it out. A module owns the question and both
ask it.

That module is the place to put the wording of the rule, the comparison it depends on, and the
edge cases someone has already thought about. Two implementations of one rule are two rules,
and they will diverge on the case nobody wrote a test for.

The symptom to watch for: a client re-implementing a decision the server also makes — whether
two names count as the same name, whether a record is complete, which item is currently
selected. When they disagree, both are right by their own lights, and the bug is unreachable
from either side alone. Compute it once, and pass the answer.

## Configuration too

One place configures one thing. Where a base file and an environment-specific file both exist,
the base holds only what every environment shares and nothing appears twice. A second mechanism
for setting the same value is a second answer to the same question.
