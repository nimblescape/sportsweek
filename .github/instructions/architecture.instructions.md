---
description: "Where logic belongs and how shared state is held — layering in a Backend-for-Frontend, declarative access rules versus guarded server code, and the three homes state may have."
applyTo: "**/*.ts, **/*.tsx"
---

<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Architecture

## Stack

Next.js (App Router) as a Backend-for-Frontend, Tailwind CSS with shadcn/ui, React Hook Form
with Zod resolvers, a document database read live from the browser, and privileged work behind
server-side handlers.

## Where logic belongs

| Use case                                                                   | Home                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| An API only this app calls                                                 | Route Handler                                                 |
| A write needing privileged credentials                                     | Route Handler                                                 |
| A form submission                                                          | Server Action or Route Handler                                |
| An API several clients call                                                | A standalone service, not the app's own handlers              |
| Reacting to a document change, an upload, a schedule, a queue or a webhook | An event-driven function                                      |
| Real-time data for a signed-in user                                        | Read straight from the database, governed by its access rules |
| A call carrying a confidential token                                       | Server-side only — such a token never reaches the browser     |

Two rules follow from the table and are worth stating on their own:

- **Privileged credentials never leave the server.** An admin SDK, a service credential or a
  third-party secret belongs to handlers and functions, never to a component.
- **Prefer a direct client read over a round trip** when the declarative access rules can
  express the authorization. Adding a server hop that only forwards a query buys nothing and
  costs the live updates.

## Declarative access rules cannot run queries

A database's declarative rules can usually fetch a document whose path they can name, but not
search for one. Any invariant that needs a search — is this name already taken, is at most one
record flagged, is this value still referenced elsewhere, does deleting this take its dependants
with it — is therefore inexpressible there.

Such invariants belong in a guarded server layer that holds them in a transaction. And once
they do, the declarative write path must be **closed**, not merely narrowed: a second way in
that does not enforce them makes the guarantee worthless. Rules then gate reads, and the server
owns writes.

State that decision where the rules live, so the closed path reads as a design and not as
unfinished work.

## Trust the session, not the request

Whose data an endpoint touches follows from the authenticated session, never from an id in the
body or the path. An endpoint acting on "my" record takes no identifier at all — there is then
nothing for a caller to point elsewhere.

Checks made in edge middleware are optimistic: they run where the session cannot be fully
verified. Re-verify in the handler that does the work.

## Shared state

There is no client-side store, and there should not be one. State has three kinds and each has
one home:

| Kind                               | Home                                                 |
| ---------------------------------- | ---------------------------------------------------- |
| Server data                        | The database, subscribed to through a hook           |
| Something a whole subtree may need | A context provider mounted where that subtree begins |
| One view's own concern             | Local component state                                |

- **Server state is subscribed to, never mirrored.** The write goes to the server and the
  subscription brings the result back. Copying that data into a store creates a second answer
  to a question the database is already answering.
- **Cross-cutting UI state goes in a context, scoped as narrowly as it can be**, and is reached
  through a hook so no consumer touches the raw value. A context two neighbouring components
  need is a prop instead.
- **Derive rather than store.** A value computed from others cannot disagree with them; a
  stored copy can, and eventually will.
- **No module-level mutable singletons.** They outlive a request on the server and a navigation
  in the browser, which makes them a cache nobody declared.
