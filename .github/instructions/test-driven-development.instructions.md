---
description: "Use when implementing any new feature, bug fix, Route Handler, Server Action, Cloud Function, or Firestore Security Rule change in this repo — enforces test-driven development (red-green-refactor) with Vitest, Playwright, and Firestore Rules Unit Testing."
applyTo: "src/**/*.ts, src/**/*.tsx, firestore.rules"
---

<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Test-Driven Development

## Rule: Red → Green → Refactor

- Before writing any implementation code, write a failing test that captures the desired behavior.
- Run the test and confirm it fails for the expected reason (not a typo/import/syntax error).
- Write the minimum code needed to make the test pass.
- Refactor only once the test is green — never add new behavior and refactor in the same step.
- Never write implementation code first and add tests afterward. If this happens, delete the implementation and restart from a failing test.

## Test Stack

- Unit/component: Vitest + React Testing Library, colocated as `*.test.ts` / `*.test.tsx` next to the file under test.
- End-to-end: Playwright, under `e2e/` at the repo root, named `*.spec.ts`.
- Firestore Security Rules: `@firebase/rules-unit-testing` against the Firebase emulator, under `firestore-tests/`, named `*.rules.test.ts`.

## First-Time Setup

No test runner is configured yet. Before writing the first test, set up:

- `npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom` — add a `test` script (`"test": "vitest run"`) to `package.json`.
- `npm install -D @playwright/test && npx playwright install` for e2e — add a `test:e2e` script (`"test:e2e": "playwright test"`).
- `npm install -D @firebase/rules-unit-testing` for Security Rules tests, run against `firebase emulators:exec`.

## What to Test Where

| Change                                    | Test type                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `lib/` utility, Zod schema, pure function | Vitest unit test                                                       |
| Route Handler / Server Action             | Vitest test invoking the handler directly, mocking Admin SDK/Firestore |
| React component / form                    | Vitest + React Testing Library                                         |
| Cloud Function                            | Vitest unit test with mocked triggers/Admin SDK                        |
| `firestore.rules` change                  | Rules Unit Testing against the Firebase emulator                       |
| Full user flow across pages               | Playwright e2e                                                         |

## Rules

- Every new/changed Route Handler, Server Action, or Cloud Function must have a test for the success path and a test for a validation/error path — assert against the error envelope in [route-handlers.instructions.md](route-handlers.instructions.md).
- Every `firestore.rules` change (allow/deny logic, role checks, field locks) must have a corresponding rules test asserting both an allowed and a denied case.
- Never mark a task complete while a test is red, unless the red state is the intended step before implementation.
- Mock the Firebase Admin SDK and other network calls in unit tests — never hit real Firestore/Auth from Vitest.
