/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { adminDb } from "@/lib/firebase/admin";
import { requireStudent } from "@/lib/auth/guards";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { userSchema } from "@/lib/schemas/user";
import { RegistrationView } from "@/components/registration/registration-view";

/**
 * Only the shared header sits above this page — no left-side navigation (US-15). The name comes
 * from the user record rather than the form, which shows it without letting it be edited (US-11).
 * Not from the registration, which carries one too (US-26): the header names the student before
 * they have registered, and there is no record to read it from until they have.
 */
export default async function RegistrationPage() {
  const user = await requireStudent();
  const studentUpn = (user.email ?? "").toLowerCase();

  const snapshot = await adminDb.collection(COLLECTIONS.users).doc(studentUpn).get();
  const stored = userSchema.safeParse({ id: snapshot.id, ...snapshot.data() });
  const studentName = stored.success
    ? `${stored.data.firstName} ${stored.data.lastName}`
    : (user.email ?? "");

  return (
    // Capped rather than stretched: the form is one column of short fields, and a line of
    // inputs the full width of a desktop screen is a long way from its own label.
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 md:p-6">
      <RegistrationView studentUpn={studentUpn} studentName={studentName} />
    </div>
  );
}
