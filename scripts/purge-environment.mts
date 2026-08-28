/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
/**
 * Empties a test environment: every Firestore document and every Firebase Auth account. Nothing
 * is written back, so what is left is the project as it was on the day it was created — which
 * includes having no event series at all, so `npm run seed:<environment>` is what makes it
 * usable again.
 *
 * The target is named on the command line and looked up in PURGEABLE_ENVIRONMENTS, which has no
 * production entry to disable. This deletes people's accounts, so the environments it can reach
 * are a closed list rather than whatever a variable happens to hold.
 */
import { initializeApp } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { apphostingValue, fail } from "./environment.mjs";

/** Where a purge is allowed. Production is absent by construction, not by a check. */
const PURGEABLE_ENVIRONMENTS = ["development", "staging"] as const;

/** Both listUsers and deleteUsers cap a single call at this many accounts. */
const USER_PAGE_SIZE = 1000;

/**
 * Collections are discovered rather than taken from COLLECTIONS: a purge that only removes the
 * names the code still knows about leaves the ones a rename or a deletion orphaned.
 */
async function purgeFirestore(db: Firestore): Promise<[string, number][]> {
  const collections = await db.listCollections();
  const counted = await Promise.all(
    collections.map(async (collection): Promise<[string, number]> => [
      collection.id,
      (await collection.count().get()).data().count,
    ]),
  );

  await Promise.all(collections.map((collection) => db.recursiveDelete(collection)));
  return counted;
}

/**
 * Re-lists from the front after every round instead of paging: the page just deleted is gone,
 * and a token taken before it points into a list that no longer exists.
 */
async function purgeAuth(auth: Auth): Promise<number> {
  let deleted = 0;

  for (;;) {
    const { users } = await auth.listUsers(USER_PAGE_SIZE);
    if (users.length === 0) return deleted;

    const { successCount, errors } = await auth.deleteUsers(users.map((user) => user.uid));
    // Without this the loop would re-list the same undeletable accounts for ever.
    if (successCount === 0) {
      fail(
        `Deleted ${deleted} account(s), then could not delete any of the remaining ${users.length}:`,
        ...errors.map(({ error }) => `  ${error.message}`),
      );
    }

    deleted += successCount;
  }
}

async function main(): Promise<void> {
  const [environment] = process.argv.slice(2);
  if (!PURGEABLE_ENVIRONMENTS.some((allowed) => allowed === environment)) {
    fail(
      `Usage: npm run purge:<environment>, where <environment> is ${PURGEABLE_ENVIRONMENTS.join(" or ")}.`,
      "Everything in the named project is deleted and nothing is written back, so no other",
      "environment is reachable from here — least of all one with real registrations in it.",
    );
  }

  const projectId = apphostingValue(environment, "NEXT_PUBLIC_FIREBASE_PROJECT_ID");

  // Its own app rather than @/lib/firebase/admin: that one addresses whichever project the
  // ambient environment names, and this must address the one just named and nothing else.
  const app = initializeApp({ projectId });

  const collections = await purgeFirestore(getFirestore(app));
  const accounts = await purgeAuth(getAuth(app));

  console.log(`Purged ${projectId}:`);
  for (const [name, count] of collections) console.log(`  ${name}: ${count} document(s)`);
  if (collections.length === 0) console.log("  no collections");
  console.log(`  ${accounts} account(s)`);
}

await main();
