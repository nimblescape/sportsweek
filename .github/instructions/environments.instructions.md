---
description: "Environment configuration — a shared base plus one file per environment, why a build with nothing selected should fail, and why some variables are deliberately not injected."
applyTo: "*.yaml, *.yml, next.config.ts"
---

<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Environment Configuration

Each environment is a separate project with its own data, its own accounts and its own
deployed rules. They share configuration, never state.

## A shared base, one file per environment

- The base file holds **only what every environment has in common**.
- One file per environment holds everything that differs, and is the only place those values
  are written.

Nothing appears in both. A value that differs per environment does not belong in the base, and
a value identical everywhere does not belong in three files.

## A build with no environment selected fails

Because the base names no target, a build that selected no environment has nothing to address —
and should stop rather than produce an artefact pointing at `undefined`. That failure is the
feature: a deployment left unconfigured is caught while building instead of on first use, when
the symptom is a broken page rather than a clear message.

## One list of variable names

A platform that merges the base and the environment file for you injects the result without
saying which file produced it, so at build time the names cannot be recovered from the files.
Keep a single list of them in code.

That list doubles as a guest list: if the build inlines configuration, a variable absent from it
never reaches the bundle however it got into the environment.

Adding a variable therefore means two edits — the environment file that gives it a value, and
the list. Only the first, and deployments silently drop it.

## Some variables belong on a deny list instead

Anything that no deployment sets must be kept **off** the injected list, and named somewhere as
local-only.

The reason is a trap worth stating: a value already present in the ambient environment usually
wins over the files, and a deployed build reads no file that names it. A developer machine's
credential can then be baked into a production artefact simply because the variable was listed.

Before adding a variable to the injected list, ask whether every environment declares it. If
not, it is local-only.

## Deploy configuration per environment

Access rules, indexes and other declarative configuration are deployed per project. A rule that
exists in the repository but has not been deployed is not in force — and reads exactly like a
bug in the client.

## No parallel mechanism

One mechanism configures the application. Introducing a second one — a dotfile beside the
environment files, an override read from somewhere else — creates two answers to the same
question and no way to tell which one a running system used.
