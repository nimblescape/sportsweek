---
description: "Firestore Security Rules patterns for this app's role model (admin/teacher/student) — role lookup, ownership checks, and field-level locking for student records."
applyTo: "firestore.rules, **/firestore.rules"
---

# Firestore Security Rules — Role Model

## Role Storage

- Roles live in `/users/{uid}` as an array field: `roles: string[]`, values `"admin" | "teacher" | "student"`.
- A user can hold multiple roles (e.g. a teacher who is also an admin) — always check membership in the array, never equality against a single string.
- Never let a client write its own `/users/{uid}.roles` field. Role changes must go through a privileged Route Handler / Cloud Function using the Admin SDK (which bypasses rules). In rules, deny any update that touches `roles` unless the requester is already an admin.

## Helper Functions

```
function isSignedIn() {
  return request.auth != null;
}

function getRoles(uid) {
  return get(/databases/$(database)/documents/users/$(uid)).data.roles;
}

function hasRole(role) {
  return isSignedIn() && role in getRoles(request.auth.uid);
}

function isAdmin() { return hasRole('admin'); }
function isTeacher() { return hasRole('teacher'); }
function isStudent() { return hasRole('student'); }
function isSelf(uid) { return isSignedIn() && request.auth.uid == uid; }
```

`get()` calls count as a document read and add latency — call `getRoles()` once per rule (e.g. via `let`) instead of once per helper if a rule needs several role checks.

## Access Pattern for Student-Owned Records (Template)

This is a template, not a fixed field list — before applying it to a real collection, derive `lockedFields` from that collection's actual Zod schema instead of guessing or reusing another collection's fields:

1. Find the collection's schema, typically `lib/schemas/<collection>.ts` (e.g. `studentRecordSchema`).
2. Determine which schema fields are pre-populated / server-managed and must stay off-limits to students (e.g. `enrollmentDate`, `assignedTeacherId`, `gradeLevel`). If the schema doesn't already mark this, look for (or ask the user to define) a companion list/subset, e.g. `studentRecordSchema.pick({ enrollmentDate: true, assignedTeacherId: true })`, and treat its keys as the denylist.
3. Mirror exactly those keys into the rule's `lockedFields` array — Firestore rules can't import the Zod schema at runtime, so the list must be kept manually in sync. Add a comment in both the schema file and the rule pointing at each other so future field additions update both places.
4. Every field not in `lockedFields` is editable by the student by default — when a new field is added to the schema, explicitly decide whether it belongs in `lockedFields` before shipping, since it's open to student edits otherwise.

```
match /studentRecords/{studentId} {
  allow read: if isAdmin() || isTeacher() || isSelf(studentId);

  allow create: if isAdmin() || isTeacher();

  allow update: if isAdmin()
    || isTeacher()
    || (isSelf(studentId) && noLockedFieldsChanged());

  allow delete: if isAdmin();

  function noLockedFieldsChanged() {
    // Keep in sync with the server-managed fields of `studentRecordSchema` in lib/schemas/student-record.ts
    let lockedFields = [/* derived from that schema, not hardcoded here */];
    return !request.resource.data.diff(resource.data).affectedKeys().hasAny(lockedFields);
  }
}
```

- This is a **denylist**: a student update is rejected only if it touches a `lockedFields` key; any other field change is allowed. Since new fields default to editable, treat every schema change as a checkpoint to update `lockedFields` — don't rely on remembering to do it later.
- Admin/teacher branches intentionally allow all fields; only the student branch is field-restricted.
- Apply the same `isAdmin() || isTeacher() || isSelf(...)` + schema-derived-denylist shape to any other collection where students own most fields but a few must stay locked — re-deriving `lockedFields` from that collection's own schema each time, never copy-pasting another collection's field list.

## Rules

- Every `allow write`/`allow update` must be reachable by at least one role — don't rely on rules that are unreachable due to earlier broader `allow` statements.
- Write `create` and `update` rules separately when the allowed fields or roles differ between the two (e.g. only admin/teacher can `create`, but the owning student can `update` a subset of fields).
- Validate field types and required keys on `create` (`request.resource.data.keys().hasOnly([...])`, `is string`, `is timestamp`, etc.) — don't only check role/ownership.
- Before deploying, audit new rules with the `firebase-security-rules-auditor` skill for privilege escalation and create-vs-update gaps.
