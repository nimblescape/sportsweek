---
description: "Clean Code — names that carry intent, functions that do one thing, arguments that read at the call site, command-query separation, not reaching through chains, failure as a value, and tidying only what the change already touches."
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

A name answers why the thing exists, what it does and how it is used. If a comment is needed to
say what a name means, the name was the wrong one.

- **Name the concept, not the mechanism.** `activeMembers`, not `filtered`; `isNameTaken`, not
  `queryResult`.
- **No disinformation.** Do not call something a `list` when it is a map, or `accounts` when it
  holds one. A name that is nearly true is worse than one that says nothing at all.
- **Distinctions must mean something.** `record` and `recordData`, `a1` and `a2`, `Info` and
  `Data` are noise: a reader cannot choose between them, so eventually they will choose wrong.
- **Pronounceable and searchable.** Code is discussed aloud and grepped daily. A name of one or
  two characters can be neither said nor found.
- **No abbreviation** unless it is the word the domain itself uses. `registration`, not `reg`.
- **No type or scope in the name.** Not `itemArray`, not `strName`, not `m_count` — the type is
  already declared and the compiler already knows it.
- **One word per concept, across the whole codebase.** Pick `fetch` or `load` or `read` and keep
  it. Three words for one idea make the codebase unsearchable and imply a distinction that is
  not there.
- **No mental mapping.** A reader should never have to hold "in this loop, `n` is the current
  attempt" in their head. Say `attempt`.
- **Name length follows scope.** A two-line `map` may call its parameter `one`; something visible
  across a module earns a full name.
- **Things are nouns, what they do are verbs.** `PaymentGateway`, `charge()`, `isSettled`.
- **A boolean reads as an assertion**: `isArchived`, `hasEntries`, `mayEdit`.
- **Nothing cute.** A joke name is funny once and obstructive thereafter.

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
- **A long descriptive name beats a short enigmatic one.** Naming is where the design gets worked
  out, and a name that is hard to write is usually saying the function does too much.
- **Extract a condition worth a sentence.** `if (isStillAvailable(catalogue, choice))` says what
  `if (catalogue.entries.some(…) && !catalogue.isClosed)` makes the reader work out.
- **Handling failure is a thing of its own.** A function containing a `try` should contain little
  else, so the ordinary path is not buried inside a mechanism.
- **Prefer a lookup to a repeated branch.** A `switch` written once to choose a strategy is fine;
  the same `switch` appearing in four functions is a table waiting to be declared.

## Arguments read at the call site

The call site is what a reader sees first, and often all they see.

- **Fewer arguments is better.** Three is already a lot; beyond that, the arguments are usually a
  concept that has not been given a name yet.
- **No boolean flag parameter.** A flag announces that the function does two things — so write
  the two, or take an options object whose field name speaks at the call site.
- **No output parameters.** Return the value; do not fill in a caller's object.
- **Null is not an argument.** Passing null to mean "not applicable" makes every reader check
  the body. Give the case its own function, or a type that admits it honestly.
- **Order should read.** `writeField(name, value)` reads; `writeField(value, name)` has to be
  looked up every time.

```ts
// no — what is `true`?
saveDraft(document, true);

// yes
saveDraft(document, { closeAfterwards: true });
```

## A function commands or answers, never both

Either it changes something, or it tells the caller something. A getter that also writes and a
validator that also stores are the surprises that cost an afternoon.

Where both genuinely belong in one atomic step — a transaction that decides and then writes —
say so in the name: `claimName`, not `checkName`.

## Do not reach through a chain

A function should speak to what it was handed and what it owns, not to whatever it can reach
through them. `a.getB().getC().act()` couples the caller to three types where one was needed, and
every link is something that may be renamed, become absent, or acquire a rule of its own.

```ts
// no — the caller now knows about the profile and the address as well
const city = user.profile().address().city;

// yes — ask for what is actually wanted
const city = user.cityName();
```

**Tell, do not ask.** Where a caller pulls values out of something only to decide something and
hand the answer back, the decision belonged with the data.

This is a rule about objects, which hide their data behind behaviour. A plain data structure — a
parsed record, a response body — exists to be read, and reading `order.shippingAddress.postcode`
is the point of it rather than a violation. What to avoid is the hybrid: a type with public fields
**and** significant behaviour, which offers two ways to do everything and no reason to prefer
either.

## Failure is a value the caller must handle

- **No sentinel returns.** Do not signal failure with `null`, `-1` or an empty string that also
  means something else; give the caller a result it cannot silently ignore.
- **Never return null for a collection.** An empty array is the empty case, and it needs no
  guard at every call site.
- **Define the normal flow.** Where every caller would otherwise test for absence, hand back
  something that behaves correctly and does nothing — the special case belongs behind the seam,
  not in front of each caller.
- **Exceptions are not control flow.** Throwing to leave a loop, or to report an outcome the
  caller expects, hides the ordinary path inside a mechanism meant for the extraordinary one.
- **Fail with context.** What was attempted, and on what — never a bare rethrow that loses the
  only information anyone will want.

## Keep together what is read together

Layout is a tool's job; _distance_ is a design decision, and no formatter has an opinion on it.

- **A variable is declared just above its first use**, not at the top of a function that uses it
  two screens below.
- **A caller sits above its callee**, so reading downwards follows the flow of control.
- **One thought is a block, and blocks are separated by a blank line.** A blank line in the
  middle of a single thought misleads as much as no line between two.

## Wrap what you do not own

Third-party code changes on somebody else's schedule. Reach it through a narrow surface of our
own, so a breaking change is a change in one file rather than in fifty call sites — and so there
is somewhere for the seam to live when the dependency is swapped or stubbed.

Where a third-party behaviour is not obvious, a small test pinning what it actually does is worth
more than reading the documentation twice: it states what the version in use really does, and it
fails when an upgrade changes it.

## Structure

- **One reason to change per module.** When a file is edited for two unrelated reasons, it is two
  files.
- **Cohesion.** A module whose parts are each used by a different caller is several modules
  sharing a filename.
- **Keep together what changes together**, and expose only what a caller needs; a helper nobody
  outside the file calls is not exported.
- **Depend on the shape you need, not the shape that exists.** A function taking the two fields
  it reads can be called from anywhere and tested with a literal; one taking the whole record
  drags everything behind it.
- **An abstraction with one implementation is not an abstraction.** A wrapper that only forwards
  is a level of indirection charged to every future reader.
- **Delete dead code.** Nothing is kept "in case", and nothing is commented out — version control
  already remembers, and it remembers accurately.

## Tests are code, held to the same standard

A test is read more often than the code it covers, because it is what a reader consults to learn
what that code is _for_. Messy tests rot until nobody trusts them, and untrusted tests get
deleted.

- **Fast** enough to run without thinking about it; **independent**, so none depends on another's
  leftovers or on the order they run in; **repeatable**, giving the same answer on any machine and
  offline; **self-validating**, passing or failing rather than printing something to be read.
- **One concept per test.** A test asserting four unrelated things reports one failure and hides
  three.
- **The name is a sentence about behaviour**, not about the function it happens to call.

## Tidy where you passed, and no further

Leave the code you touched better than you found it: a name clarified, a nested condition
flattened, a function split where the change made the seam obvious.

That licence stops at the edge of the change. Tidying code the change never touched enlarges the
diff and buries the thing a reviewer came to read — so it is a change of its own, made on its own
terms.

## Smells worth being able to name

| Smell                    | What it looks like                                                          |
| ------------------------ | --------------------------------------------------------------------------- |
| Feature envy             | A function reading more of another module's data than of its own            |
| Misplaced responsibility | Something put where it was convenient, not where a reader would look for it |
| Artificial coupling      | Two things bound together only because they were typed in the same sitting  |
| Selector argument        | A parameter whose sole job is to choose a branch inside                     |
| Obscured intent          | A dense expression, an unexplained constant, a name that hides what it does |
| Inconsistent convention  | Two spellings of one idea, or two shapes for one job                        |
| Fragility                | A change in one place that reliably breaks something unrelated              |

## The four rules, in order

Where two of these pull against each other, the earlier one wins. Code is finished when it

1. passes its tests,
2. reveals its intent,
3. contains no duplication, and
4. has the fewest parts that can do so.

## Why

Every rule here trades a moment of the writer's convenience for an hour of a reader's. The
codebase is the design; if it cannot be read, it cannot be reasoned about, and it cannot be
safely changed.
