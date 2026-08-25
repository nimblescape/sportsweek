---
description: "Use when deciding where to put new backend logic, API endpoints, or data access in this Firebase + Next.js app — choosing between Next.js Route Handlers, Server Actions, Cloud Functions, Cloud Run, or direct Firestore Client SDK access. Also covers the tech stack (Next.js, Tailwind CSS, shadcn/ui, React Hook Form, Zod) and Firebase Auth with Entra ID."
---

<!--
SPDX-License-Identifier: MIT
Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
Licensed under the MIT License. See LICENSE in the repository root for details.
-->

# Architecture & Stack Conventions

## Stack

- Framework: Next.js (App Router), used as Backend-for-Frontend (BFF)
- Styling: Tailwind CSS
- UI components: shadcn/ui
- Forms: React Hook Form
- Validation: Zod — use the RHF/Zod resolver for forms, and validate all Route Handler / Server Action inputs with Zod schemas
- Database: Firestore
- Auth: Firebase Authentication with Entra ID via `new OAuthProvider("microsoft.com")`
- Hosting: Firebase App Hosting (Next.js), Cloud Functions for event-driven/backend work

## Where does logic belong?

| Use case                                       | Recommendation                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| API used only by the Next.js web app           | Next.js Route Handler                                                              |
| CRUD with privileged server access             | Next.js Route Handler                                                              |
| Server Action triggered from a React form      | Next.js Server Action                                                              |
| Public API for multiple clients                | Cloud Function or Cloud Run                                                        |
| Firestore document created/changed             | Cloud Function (Firestore trigger)                                                 |
| File uploaded                                  | Cloud Function (Storage trigger)                                                   |
| Scheduled daily job                            | Cloud Function (Scheduler)                                                         |
| Queue, Pub/Sub, or Eventarc                    | Cloud Function                                                                     |
| Long-running background processing             | Cloud Function                                                                     |
| External webhook                               | Usually a Cloud Function                                                           |
| Real-time data for signed-in users             | Direct Firestore Client SDK access, governed by Security Rules                     |
| Microsoft Graph calls with confidential tokens | Next.js Route Handler or Cloud Function — never expose Graph tokens to the browser |

## Layers

```
Browser
├── Firebase Auth → Entra ID (OAuthProvider("microsoft.com"))
├── Firestore Client SDK → normal data reads/writes, governed by Security Rules
└── Next.js API → privileged synchronous operations

Next.js on App Hosting
├── Route Handlers
├── Server Actions
├── Session and role checks
└── Firebase Admin SDK

Cloud Functions
├── Firestore triggers
├── Storage triggers
├── Scheduler
├── Background processing
└── Auth Blocking Functions
```

## Rules

- Never call the Firebase Admin SDK or use service credentials from the browser — only from Route Handlers, Server Actions, or Cloud Functions.
- Use Cloud Functions (not Route Handlers) for anything triggered by Firestore/Storage events, schedules, queues, or external webhooks — Route Handlers only run in response to HTTP requests to the Next.js app.
- Prefer direct Firestore Client SDK reads for real-time UI data instead of round-tripping through Next.js, as long as Security Rules can express the authorization.
- Do session/role checks (Entra ID claims) server-side in Next.js Proxy (`src/proxy.ts`, formerly "Middleware" — renamed in Next.js 16), Route Handlers, or Server Actions — never trust role/permission data from client input. Treat Proxy checks as optimistic only; re-verify in the Route Handler/Server Action itself.
