/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { adminDb } from "@/lib/firebase/admin";
import { requireStudent } from "@/lib/auth/guards";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { userSchema } from "@/lib/schemas/user";
import { MyRegistrationView } from "@/components/my-registration/my-registration-view";

/**
 * Only the shared header sits above this page — no left-side navigation (US-15). The name comes
 * from the user record rather than the form, which shows it without letting it be edited (US-11).
 * Not from the registration, which carries one too (US-26): the header names the student before
 * they have registered, and there is no record to read it from until they have.
 *
 * The class the link enrols into is resolved here for the same reason: on a first visit there is
 * no record yet to read it from, and it is a fact the form states rather than asks (US-23).
 */
export default async function RegistrationPage({
  params,
}: {
  params: Promise<{ eventSeriesId: string }>;
}) {
  const user = await requireStudent();
  const studentUid = user.uid;
  const { eventSeriesId } = await params;

  const snapshot = await adminDb.collection(COLLECTIONS.users).doc(studentUid).get();
  const stored = userSchema.safeParse({ id: snapshot.id, ...snapshot.data() });
  const studentName = stored.success
    ? `${stored.data.firstName} ${stored.data.lastName}`
    : (user.email ?? "");

  return (
    <MyRegistrationView
      eventSeriesId={eventSeriesId}
      studentUid={studentUid}
      studentName={studentName}
    />
  );
}
