/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
/**
 * When the people who may hand out permissions last signed in.
 *
 * Asked of the records rather than of a list kept here, so it answers for whoever holds
 * `editUsers` now: the administrators a school was seeded with, and anybody they have made one
 * since — minus anybody it has been taken back off.
 *
 * This is the only way to see that history at all: no client may read it, not even the person it
 * belongs to, so it is kept for an operator rather than for the application. Reading changes
 * nothing, which is why production needs none of the ceremony the seeding script asks for.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { LOGIN_TIME_FIELD, SCHOOL_TIME_ZONE } from "@/lib/auth/login-time";
import { permissionSchema } from "@/lib/auth/permissions";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { userSchema, type User } from "@/lib/schemas/user";
import { apphostingValue, ENVIRONMENTS, fail } from "./environment.mjs";

/** How far back one look goes. Enough to see a pattern, short enough to read at a glance. */
const HISTORY_LENGTH = 10;

/** The permission that makes somebody an administrator, and so puts them in this list. */
const ADMINISTERS = permissionSchema.enum.editUsers;

/**
 * How the school reads a date. Every part is a fixed width, so ten of them line up as a column,
 * and the weekday is there because "was that a school day?" is most of what this is looked at
 * for. Shown in the zone it was recorded in, which is what makes it the same wall clock.
 */
const WHEN = new Intl.DateTimeFormat("de-AT", {
  timeZone: SCHOOL_TIME_ZONE,
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Ordered by address, so two runs read the same way. */
async function administrators(db: Firestore): Promise<User[]> {
  const snapshot = await db
    .collection(COLLECTIONS.users)
    .where("permissions", "array-contains", ADMINISTERS)
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

  return snapshot.docs.map((login) => WHEN.format(new Date(String(login.get(LOGIN_TIME_FIELD)))));
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

  const people = await administrators(db);
  console.log(
    `The last ${HISTORY_LENGTH} sign-ins of everyone holding ${ADMINISTERS} in ${projectId}:`,
  );
  if (people.length === 0) console.log("\n  nobody holds it");

  // Asked for at once rather than one after the other, so the wait is one round trip and not one
  // per person; the array keeps them in the order they were sorted into.
  const histories = await Promise.all(
    people.map(async (person) => ({ person, logins: await lastLogins(db, person) })),
  );

  for (const { person, logins } of histories) {
    console.log(`\n${person.firstName} ${person.lastName} <${person.email}>`);
    if (logins.length === 0) console.log("  no sign-in recorded");
    for (const at of logins) console.log(`  ${at}`);
  }
}

await main();
