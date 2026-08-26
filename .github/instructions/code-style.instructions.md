---
description: "TypeScript and formatting conventions — types over interfaces, named exports, Prettier as the only arbiter of layout, and comments that say what the code cannot."
applyTo: "**/*.ts, **/*.tsx, **/*.mjs"
---

<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Code Style

## TypeScript

- **`type`, not `interface`.** The codebase has no interfaces; declaration merging is not
  wanted, and one keyword for one job keeps the shapes searchable.
- **No `any`.** `unknown` at a boundary, narrowed by a Zod parse or a type guard. `strict` is
  on and stays on.
- **Types are inferred from schemas**, never written twice — see
  [single-source-of-truth.instructions.md](single-source-of-truth.instructions.md).
- **`as const satisfies T`** for a registry or a lookup table: the literal types survive, and
  the shape is still checked. Plain `as const` where nothing needs checking.
- **Named exports.** A default export appears only where a framework demands one — a Next.js
  `page.tsx`, `layout.tsx` or `route.ts`.
- **Imports use the `@/` alias** for anything outside the current folder; relative paths stay
  within a folder (`./categories`).
- **`readonly` for parameters a function does not modify**, especially arrays: it says the
  caller's data is safe.

## Naming

- Identifiers, types, files and comments are English, whatever language the UI speaks (see
  [language.instructions.md](language.instructions.md)).
- Files are kebab-case; a component file is named after the component it exports
  (`equipment-checklist.tsx` → `EquipmentChecklist`).
- Hooks read as questions or nouns (`useSeasons`, `useRowAction`), predicates start with `is`
  or `has` (`isRegistrationIncomplete`, `hasUniqueNames`).

## Formatting is Prettier's job

The configuration lives in `package.json`: 100 columns, two spaces, semicolons, double quotes,
trailing commas, plus `prettier-plugin-tailwindcss`.

- Never hand-format, and never hand-sort Tailwind classes — the plugin orders them, and a
  manual order is a diff waiting to be reverted.
- `npx prettier --check .` is part of the gate; `npx prettier --write .` before committing.
- Do not add a formatting-related ESLint rule. One tool owns layout.

## Comments

Write a comment for what the code cannot say for itself: why this way and not the obvious way,
what breaks if the order changes, which requirement forced it.

```ts
// no — restates the line beneath it
// Sort the items by position
items.sort(byPosition);

// yes — says what the reader cannot see
// Sorted here rather than in the query: Firestore's orderBy silently omits documents that
// lack the field, which would hide any item stored before ordering existed.
```

Reference a requirement by its number (`US-11`) rather than describing it, so the spec stays
the place it is written down. Do not narrate a change for a reviewer — the commit message and
the pull request do that, and the comment outlives both.
