/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useEffect, useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { subscribeWithRecovery } from "@/lib/firebase/live-query";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { accountTypeSchema, userSchema } from "@/lib/schemas/user";
import type { Permission } from "@/lib/auth/permissions";

export type Teacher = {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  permissions: readonly Permission[];
};

const teacherSchema = userSchema.pick({
  firstName: true,
  lastName: true,
  email: true,
  permissions: true,
});

/**
 * The staff room, live. Only somebody holding `editUsers` may read it, which the rules enforce;
 * a student is filtered out by the query rather than hidden afterwards, since a permission is a
 * teacher's and there would be nothing to show against their name (US-2).
 */
export function useTeachers() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeWithRecovery<Teacher>({
        label: "teachers",
        buildQuery: () =>
          query(
            collection(db, COLLECTIONS.users),
            where("accountType", "==", accountTypeSchema.enum.teacher),
          ),
        parse: (id, data) => {
          const parsed = teacherSchema.safeParse(data);
          if (!parsed.success) {
            console.error(`User ${id} does not match the schema`, parsed.error);
            return null;
          }
          return { uid: id, ...parsed.data };
        },
        onData: (items) => {
          setTeachers([...items].sort(byName));
          setLoading(false);
        },
        onError: (message) => {
          setError(message);
          if (message !== null) setLoading(false);
        },
      }),
    [],
  );

  return { teachers, loading, error };
}

/** Surname first, as a staff list is read. */
function byName(a: Teacher, b: Teacher): number {
  return (
    a.lastName.localeCompare(b.lastName, "de-AT") || a.firstName.localeCompare(b.firstName, "de-AT")
  );
}
