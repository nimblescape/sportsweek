---
description: "Check the editor's reported problems before calling a change done, and fix what you introduced."
applyTo: "**/*"
---

<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Checking Your Work

## Read the problems, every time

After editing a file, look at the problems the editor reports for it, and fix the ones your
change introduced. Do this before saying the change is done — not after being asked.

These are not the same findings the command line gives you. `tsc`, `eslint` and Prettier each
see one layer; the editor also surfaces what the language services and plugins notice, such as
two Tailwind classes that set the same property. A change can be green in every script and
still be flagged in the file you just wrote.

## What to fix, and what to leave

- Fix what your change caused. A problem you introduced is part of the change, not a follow-up.
- Leave what was already there, unless it is what you were asked to work on. Cleaning up
  unrelated findings enlarges the diff and buries the change a reviewer came to read.
- If a finding is wrong, say so and explain why rather than silencing it. A suppression comment
  is a claim that the tool is mistaken, and it should read like one.

## The rest of the gate

The editor's problems are one check among several. Before a change is finished:

```bash
npx vitest run          # or `npm test`
npm run lint
npx tsc --noEmit
npx prettier --check .
npm run license:check
```

Security Rules have their own runner, against the emulator:

```bash
npm run test:rules
```

A red test is only acceptable while it is the deliberate first half of red-green-refactor (see
[test-driven-development.instructions.md](test-driven-development.instructions.md)).
