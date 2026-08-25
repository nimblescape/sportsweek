---
description: "Firestore Security Rules patterns for this app's role model (teacher/student) — role lookup, ownership checks, and field-level locking for student records."
applyTo: "firestore.rules, **/firestore.rules"
---

# Firestore Security Rules — Role Model

## Role Storage

- Each `/users/{uid}` document has a single `role` field: `role: "teacher" | "student"`. There is no admin role and no array of roles — a user has exactly one role.
- Roles are hierarchical: a teacher has all the rights of a student, so `isTeacher()` implies student-level access too; there's no separate "teacher AND student" combination to check for.
- The role is assigned once, at account creation, based on the Entra ID UPN domain (`htldornbirn.at` → teacher, `student.htldornbirn.at` → student). It is never writable by any client, at any role — not even by a teacher. Deny every `update` that touches `role`, full stop. Correcting a wrong role requires direct database access (e.g. by IT staff), not an app code path.

## Helper Functions

```
function isSignedIn() {
  return request.auth != null;
}

function getRole(uid) {
  return get(/databases/$(database)/documents/users/$(uid)).data.role;
}

function isTeacher() {
  return isSignedIn() && getRole(request.auth.uid) == 'teacher';
}

function isStudent() {
  return isSignedIn() && getRole(request.auth.uid) == 'student';
}

function isSelf(uid) {
  return isSignedIn() && request.auth.uid == uid;
}
```

`get()` calls count as a document read and add latency — call `getRole()` once per rule (e.g. via `let`) instead of once per helper if a rule needs several role checks.

## Access Pattern for Student-Owned Records (Template)

This is a template, not a fixed field list — before applying it to a real collection, derive `lockedFields` from that collection's actual Zod schema instead of guessing or reusing another collection's fields:

1. Find the collection's schema, typically `lib/schemas/<collection>.ts` (e.g. `studentRecordSchema`).
2. Determine which schema fields are pre-populated / server-managed and must stay off-limits to students (e.g. `enrollmentDate`, `assignedTeacherId`, `gradeLevel`). If the schema doesn't already mark this, look for (or ask the user to define) a companion list/subset, e.g. `studentRecordSchema.pick({ enrollmentDate: true, assignedTeacherId: true })`, and treat its keys as the denylist.
3. Mirror exactly those keys into the rule's `lockedFields` array — Firestore rules can't import the Zod schema at runtime, so the list must be kept manually in sync. Add a comment in both the schema file and the rule pointing at each other so future field additions update both places.
4. Every field not in `lockedFields` is editable by the student by default — when a new field is added to the schema, explicitly decide whether it belongs in `lockedFields` before shipping, since it's open to student edits otherwise.

```
match /studentRecords/{studentId} {
  allow read: if isTeacher() || isSelf(studentId);

  allow create: if isTeacher();

  allow update: if isTeacher()
    || (isSelf(studentId) && noLockedFieldsChanged());

  allow delete: if isTeacher();

  function noLockedFieldsChanged() {
    // Keep in sync with the server-managed fields of `studentRecordSchema` in lib/schemas/student-record.ts
    let lockedFields = [/* derived from that schema, not hardcoded here */];
    return !request.resource.data.diff(resource.data).affectedKeys().hasAny(lockedFields);
  }
}
```

- This is a **denylist**: a student update is rejected only if it touches a `lockedFields` key; any other field change is allowed. Since new fields default to editable, treat every schema change as a checkpoint to update `lockedFields` — don't rely on remembering to do it later.
- The teacher branch intentionally allows all fields; only the student branch is field-restricted.
- Apply the same `isTeacher() || isSelf(...)` + schema-derived-denylist shape to any other collection where students own most fields but a few must stay locked — re-deriving `lockedFields` from that collection's own schema each time, never copy-pasting another collection's field list.

## Rules

- Every `allow write`/`allow update` must be reachable by at least one role — don't rely on rules that are unreachable due to earlier broader `allow` statements.
- Write `create` and `update` rules separately when the allowed fields or roles differ between the two (e.g. only the teacher can `create`, but the owning student can `update` a subset of fields).
- Validate field types and required keys on `create` (`request.resource.data.keys().hasOnly([...])`, `is string`, `is timestamp`, etc.) — don't only check role/ownership.
- Before deploying, audit new rules with the `firebase-security-rules-auditor` skill for privilege escalation and create-vs-update gaps.
