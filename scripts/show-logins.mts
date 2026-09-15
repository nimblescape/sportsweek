/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
/**
 * When teachers last signed in.
 *
 * This is the only way to see that history at all: no client may read it, not even the person it
 * belongs to, so it is kept for an operator rather than for the application. Reading changes
 * nothing, which is why production needs none of the ceremony the seeding script asks for.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { formatLoginTime, LOGIN_TIME_FIELD } from "@/lib/auth/login-time";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { accountTypeSchema, userSchema, type User } from "@/lib/schemas/user";
import { apphostingValue, ENVIRONMENTS, fail } from "./environment.mjs";

/** How far back one look goes. Enough to see a pattern, short enough to read at a glance. */
const HISTORY_LENGTH = 10;

/** Ordered by address, so two runs read the same way. */
async function teachers(db: Firestore): Promise<User[]> {
  const snapshot = await db
    .collection(COLLECTIONS.users)
    .where("accountType", "==", accountTypeSchema.enum.teacher)
    .get();

  return snapshot.docs
    .map((person) => userSchema.parse({ id: person.id, ...person.data() }))
    .sort((one, other) => one.email.localeCompare(other.email));
}

/**
 * Newest first. The stored value carries the offset it was written in, so ordering it as text is
 * chronological apart from the one hour a daylight saving change repeats.
 */
async function lastLogins(db: Firestore, person: User): Promise<string[]> {
  const snapshot = await db
    .collection(COLLECTIONS.users)
    .doc(person.id)
    .collection(COLLECTIONS.logins)
    .orderBy(LOGIN_TIME_FIELD, "desc")
    .limit(HISTORY_LENGTH)
    .get();

  return snapshot.docs.map((login) => formatLoginTime(String(login.get(LOGIN_TIME_FIELD))));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const environment = ENVIRONMENTS.find((allowed) => args.includes(allowed));
  const unknown = args.filter((arg) => arg !== environment);
  if (environment === undefined || unknown.length > 0) {
    fail(
      `Usage: npm run logins:<environment>,`,
      `where <environment> is ${ENVIRONMENTS.join(", ")}.`,
    );
  }

  const projectId = apphostingValue(environment, "NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  // Its own app rather than @/lib/firebase/admin: that one addresses whichever project the
  // ambient environment names, and this must address the one just named and nothing else.
  const db = getFirestore(initializeApp({ projectId }));

  const people = await teachers(db);
  console.log(`The last ${HISTORY_LENGTH} sign-ins of every teacher in ${projectId}:`);

  // Asked for at once rather than one after the other, so the wait is one round trip and not one
  // per person; the array keeps them in the order they were sorted into.
  const histories = await Promise.all(
    people.map(async (person) => ({ person, logins: await lastLogins(db, person) })),
  );

  const signedIn = histories.filter(({ logins }) => logins.length > 0);
  if (signedIn.length === 0) console.log("\n  nobody has signed in");

  for (const { person, logins } of signedIn) {
    console.log(`\n${person.firstName} ${person.lastName} <${person.email}>`);
    for (const at of logins) console.log(`  ${at}`);
  }
}

await main();
