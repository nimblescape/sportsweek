---
description: "Environment configuration — one file per environment over a shared base, why a build with no environment fails, and why some variables are deliberately not injected."
applyTo: "apphosting*.yaml, next.config.ts, src/lib/apphosting-env.ts"
---

<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Environment Configuration

Three Firebase projects, one per environment: `htld-sportsweek` (production),
`htld-sportsweek-staging`, `htld-sportsweek-development`. They share nothing — separate data,
separate auth accounts, separate rules deployments.

## A shared base, one file per environment

- `apphosting.yaml` holds **only what every environment shares** — the Entra tenant, the run
  configuration. It names no Firebase project.
- `apphosting.<environment>.yaml` holds everything that differs, and is the only place an
  environment's values are written.

Because the base names no project, a build with no environment selected **fails** rather than
producing one addressed to `undefined` (`requireFirebaseProject`). That failure is the feature:
a backend left without an Environment name is caught at build time instead of at first use.

Locally, select one: `npm run dev` (development), `npm run dev:staging`, `npm run dev:production`.

## There are no `.env` files

Every value comes from an apphosting file. A second place to configure the same thing is a
second answer to the same question (see
[single-source-of-truth.instructions.md](single-source-of-truth.instructions.md)).

## Variable names live in `INJECTED_VARIABLES`

On a real deployment `APP_HOSTING_ENV` is unset: App Hosting merges the base and the
environment file itself and injects the result through `process.env`, so only the base is read
from disk and it names nothing environment-specific. The names have to come from somewhere that
is not a file — that list.

It doubles as the guest list. `next.config.ts` inlines the result, so a variable absent from the
list never reaches a build however it got into the environment.

**Adding a variable means adding it in two places**: the environment file that gives it a value,
and `INJECTED_VARIABLES`. Only the first, and deployments silently drop it.

## Some variables are deliberately absent from that list

`LOCAL_ONLY_VARIABLES` — currently `FIREBASE_SERVICE_ACCOUNT_ID` — is what no deployment ever
sets. Listing one as injected once put a laptop's service account into a production build,
because a value already in the ambient environment wins over the files, and a production build
reads no file that names it.

Before adding a variable to `INJECTED_VARIABLES`, ask whether every environment declares it. If
not, it belongs in the local-only list instead.

## Which sign-in an environment gets is not a variable alone

`resolveAuthMode` decides: production is pinned to Entra ID whatever the configuration says,
staging to the fake login, development reads `AUTH_MODE`, and any other project gets Entra ID.
A deployment that has not opted in does not merely disable the fake login — the modules behind
it are not in the build, and `npm run check:production-build` asserts as much against the
artifact.

## Rules and indexes are deployed per project

`npm run rules:development` deploys `firestore.rules`, the indexes and the storage rules to the
development project. A rule that exists in the repository but has not been deployed is not in
force, which reads exactly like a bug in the client.
