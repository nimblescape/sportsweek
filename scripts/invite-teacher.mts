/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
/**
 * Leaves an invitation at a teacher's address, for their first sign-in to claim (US-2, US-31).
 *
 * An operator's tool, and the only way into a school that has nobody who may hand out
 * permissions yet — the rights page needs somebody holding `editUsers` to open it, so a school
 * whose last administrator has left cannot let anyone back in from inside the application.
 *
 * Not an Auth account and not a `users` record: the account is the directory's to create, and
 * one made here would hold the address under a credential Entra never issued, which is exactly
 * what a real sign-in then collides with. There is no uid to key a record by until somebody
 * arrives, so the invitation waits at the address and provisioning claims it once.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { checkbox, confirm, input } from "@inquirer/prompts";
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  permissionsInputSchema,
  type Permission,
} from "@/lib/auth/permissions";
import { accountTypeFromEmail, TEACHER_DOMAIN } from "@/lib/auth/school-email";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { userSchema } from "@/lib/schemas/user";
import { apphostingValue, ENVIRONMENTS, fail, type Environment } from "./environment.mjs";

type Invitation = { firstName: string; lastName: string; permissions: Permission[] };

/** A name the record will accept, so the invitation cannot store one the application refuses. */
function askName(label: string, shape: typeof userSchema.shape.firstName): Promise<string> {
  return input({
    message: `${label}:`,
    validate: (value) => shape.safeParse(value).error?.issues[0]?.message ?? true,
  });
}

/**
 * Space picks one, `a` picks or clears them all, `i` inverts. The exclusive pair is refused
 * here rather than on the way out, so it is corrected while the list is still open.
 */
function askPermissions(held: readonly Permission[]): Promise<Permission[]> {
  return checkbox({
    message: "Berechtigungen (Leertaste wählt, a alle, i umgekehrt, Enter bestätigt):",
    choices: PERMISSIONS.map((permission) => ({
      name: PERMISSION_LABELS[permission],
      value: permission,
      checked: held.includes(permission),
    })),
    validate: (chosen) => {
      const parsed = permissionsInputSchema.safeParse(chosen.map((one) => one.value));
      return (
        parsed.success || (parsed.error.issues[0]?.message ?? "Diese Rechte gibt es so nicht.")
      );
    },
  });
}

/**
 * Somebody already provisioned holds a record, and provisioning reads an invitation only when it
 * finds none — so one left for them would wait for a first sign-in that has already happened.
 */
async function alreadyProvisioned(db: Firestore, email: string): Promise<boolean> {
  const held = await db.collection(COLLECTIONS.users).where("email", "==", email).limit(1).get();
  return !held.empty;
}

async function existingInvitation(db: Firestore, email: string): Promise<Invitation | null> {
  const stored = await db.collection(COLLECTIONS.invitedTeachers).doc(email).get();
  if (!stored.exists) return null;

  const permissions = permissionsInputSchema.safeParse(stored.data()?.permissions);
  return {
    firstName: String(stored.data()?.firstName ?? ""),
    lastName: String(stored.data()?.lastName ?? ""),
    permissions: permissions.success ? [...permissions.data] : [],
  };
}

function describe(permissions: readonly Permission[]): string {
  return permissions.length === 0
    ? "keine"
    : permissions.map((permission) => PERMISSION_LABELS[permission]).join(", ");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const environment = ENVIRONMENTS.find((allowed): allowed is Environment =>
    args.includes(allowed),
  );
  const unknown = args.filter((arg) => arg !== environment);
  if (environment === undefined || unknown.length > 0) {
    fail(`Usage: npm run invite:<environment>, where <environment> is ${ENVIRONMENTS.join(", ")}.`);
  }

  const projectId = apphostingValue(environment, "NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  // Its own app rather than @/lib/firebase/admin: that one addresses whichever project the
  // ambient environment names, and this must address the one just named and nothing else.
  const db = getFirestore(initializeApp({ projectId }));

  console.log(`Inviting into ${projectId}.\n`);

  const email = (
    await input({
      message: "E-Mail-Adresse der Lehrperson:",
      validate: (value) =>
        accountTypeFromEmail(value) === "teacher" ||
        `Nur eine Adresse auf @${TEACHER_DOMAIN} kann eingeladen werden.`,
    })
  )
    .trim()
    .toLowerCase();

  if (await alreadyProvisioned(db, email)) {
    fail(
      `${email} has signed in before and holds a record.`,
      "An invitation is only read when there is none, so this one would never be claimed.",
      "Grant the permissions on the rights page instead.",
    );
  }

  const waiting = await existingInvitation(db, email);
  if (waiting !== null) {
    console.log(
      `An invitation is already waiting for ${waiting.firstName} ${waiting.lastName}: ` +
        `${describe(waiting.permissions)}.\n`,
    );
  }

  const firstName = await askName("Vorname", userSchema.shape.firstName);
  const lastName = await askName("Nachname", userSchema.shape.lastName);
  const permissions = await askPermissions(waiting?.permissions ?? []);

  console.log(
    `\n${firstName} ${lastName} <${email}>\n` +
      `  Projekt:       ${projectId}\n` +
      `  Berechtigungen: ${describe(permissions)}\n`,
  );

  if (!(await confirm({ message: "Einladung so speichern?", default: false }))) {
    fail("Nothing written.");
  }

  await db
    .collection(COLLECTIONS.invitedTeachers)
    .doc(email)
    .set({ firstName, lastName, permissions });

  console.log(`Invitation written. ${email} claims it at their first sign-in.`);
}

// A cancelled prompt is Ctrl-C, which is an answer rather than a fault: say nothing and stop.
await main().catch((error: unknown) => {
  if (error instanceof Error && error.name === "ExitPromptError") process.exit(130);
  throw error;
});
