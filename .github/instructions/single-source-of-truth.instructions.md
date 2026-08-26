---
description: "Single source of truth — constants instead of repeated literals, types and schemas derived rather than restated, and a module that owns any answer more than one caller needs."
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

## Constants, not literals

A string that names something — a collection, a route, a status code, a field, a limit — is
declared once and imported. It is never typed out at the point of use.

```ts
// no
const doc = await db.collection("customerOrders").doc(id).get();

// yes
const doc = await db.collection(COLLECTIONS.customerOrders).doc(id).get();
```

The same holds for text the interface shows in more than one place, and for numbers that bound
more than one thing. Where two lists must agree on a limit, they share one constant, so they
cannot drift into contradicting each other.

Keep a stored value apart from the label shown for it. One constant for what is written to the
database, another for what the user reads — so display text can never become a stored value,
and a rewording never becomes a data migration.

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
