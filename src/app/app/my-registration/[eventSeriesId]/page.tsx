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
 * `closed` is the one fact the join route knows that this page otherwise could not: a live link
 * to a class that is currently shut, followed by a student who holds no registration for it yet
 * (US-45). Reading it from the query string rather than deciding it again here keeps that
 * decision where it was already made.
 */
export default async function RegistrationPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventSeriesId: string }>;
  searchParams: Promise<{ closed?: string }>;
}) {
  const user = await requireStudent();
  const studentUid = user.uid;
  const { eventSeriesId } = await params;
  const { closed } = await searchParams;

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
      linkClosed={closed === "1"}
    />
  );
}
