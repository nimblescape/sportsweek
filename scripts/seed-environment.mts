/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
/**
 * Resets a project to its defaults: everything is deleted, and what this script writes is then
 * all it holds.
 *
 * | production              | one event series with the lists that are the same every year        |
 * | development, staging    | that series and a second one, both filled in with a roster and registrations |
 *
 * Seeding on top of what a project already holds says nothing about whether the application put
 * it there, so the point of a seeded environment — that its contents are known — needs the delete
 * as much as the write.
 *
 * `--bare` asks a test environment for what production gets, which is what a school's first day
 * looks like and the only way to see the empty states behind seeded data. It can only ever leave
 * a project holding less, so production receives no invented person whatever is passed — that
 * stays true by construction rather than by a check, because no argument adds anything anywhere.
 *
 * Emptying production is a legitimate admin task and is not fenced off, but it is the one thing
 * here that cannot be undone, so it asks for the project id to be typed back first.
 */
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { initializeApp } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore, type WriteBatch } from "firebase-admin/firestore";
import { buildEmail } from "@/lib/auth/fake/email-builder";
import { invitationKey } from "@/lib/auth/school-email";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { genderSchema, type Gender } from "@/lib/schemas/common";
import { FOOD_OPTION_OTHER, type OverridableLists, type Program } from "@/lib/schemas/master-data";
import type { EventSeries } from "@/lib/schemas/event-series";
import { MASTER_DATA_CATEGORIES } from "@/lib/master-data/categories";
import { registrationSchema, type RegistrationInput } from "@/lib/schemas/registration";
import { accountTypeSchema, userSchema } from "@/lib/schemas/user";
import { normalizeName } from "@/lib/firebase/name-key";
import { isRegistrationIncomplete } from "@/lib/registration/completeness";
import { questionsFor } from "@/lib/master-data/resolution";
import { EMPTY_REGISTRATION, registrationPath } from "@/lib/registration/registration";
import {
  apphostingValue,
  DEVELOPMENT,
  ENVIRONMENTS,
  fail,
  STAGING,
  type Environment,
} from "./environment.mjs";
import { loadSeedConfig, type SeedEventSeries, type SeedUser } from "./seed-config.mjs";

/**
 * Where inventing people is allowed, and where a purge needs no ceremony. Production is absent
 * by construction rather than by a check: it gets the defaults and stops, because no argument
 * can ask for anything else.
 */
const TEST_ENVIRONMENTS: readonly Environment[] = [DEVELOPMENT, STAGING];

/** Asks one of them for the bare state instead, which is what a school's first day is. */
const BARE = "--bare";

/** Both listUsers and deleteUsers cap a single call at this many accounts. */
const USER_PAGE_SIZE = 1000;

/**
 * What a purged environment gets so there is somewhere to put students. The application seeds
 * nothing at all any more — it cannot know whether it is being asked for a Wintersportwoche or a
 * Kulturwoche — so a fresh project holds only what `scripts/seed.yml` names, in the order it
 * lists them there. Only the first is bare-seeded (US-33): it is the one a school cannot be
 * without, and every series after it is invented only where students are invented too.
 */

/**
 * The categories an event may override (US-33), derived from the categories map rather than
 * named a second time — so a category that becomes overridable, or stops being one, changes
 * there and nothing here needs to catch up.
 */
const PER_EVENT_FIELDS = Object.values(MASTER_DATA_CATEGORIES)
  .filter((category) => category.perEvent)
  .map((category) => category.field);

/**
 * What production gets: those categories, and nothing for the two that describe this particular
 * year — which weeks there are and which classes go on them is what a teacher fills in.
 */
function bareEventSeriesOf(series: SeedEventSeries): SeedEventSeries {
  const overridable = Object.fromEntries(
    PER_EVENT_FIELDS.map((field) => [field, series[field]]),
  ) as OverridableLists;

  return { name: series.name, events: [], classOptions: [], ...overridable };
}

/** The shape of the sports week as it is wanted in a test environment. */
const STUDENTS_PER_CLASS = { min: 20, max: 25 };
const ATTENDING_SHARE = { min: 0.7, max: 0.8 };
/**
 * How many registrations per class are left unfinished, so the report has both shapes of them to
 * show: some who followed the link and answered nothing, some who took part and left a field
 * blank. A count rather than a share — on a class of twenty a couple of per cent rounds to none.
 */
const INCOMPLETE_PER_CLASS = { min: 3, max: 6 };

/**
 * What a half-finished registration is missing. Never the program: the summary tallies by it,
 * and a student with no program is not taking part rather than being half-way through.
 */
const UNFINISHED_ANSWERS = [
  "skillLevel",
  "busPickupPoint",
  "seasonPassOption",
  "foodOption",
  "phoneNumber",
  "hasMedication",
] as const satisfies readonly (keyof RegistrationInput)[];
const FEMALE_SHARE = 1 / 3;
/** Small on purpose: enough that every run has some, few enough to stay a minority in the figures. */
const DIVERSE_SHARE = 1 / 20;
const AGE_RANGE = { min: 15, max: 16 };

/** How many attendees on a program that requires equipment rent it rather than bring their own. */
const RENTAL_SHARE = 0.4;
const OTHER_FOOD_SHARE = 0.08;
const HEALTH_NOTE_SHARE = 0.15;
const MEDICATION_SHARE = 0.1;

/**
 * Fixed, so a purge and a re-run bring the same students back under the same addresses — which
 * keeps any Firebase Auth accounts an earlier impersonation created pointing at real people.
 */
const RANDOM_SEED = 20260826;

/**
 * Deliberately synthetic. Plausible Vorarlberg names on the school's own domain would be
 * indistinguishable from real students at a glance — and with a pool that size, some of the
 * addresses would belong to actual ones. These cannot be mistaken for anybody.
 *
 * The first names are spelling-alphabet words — NATO's, the German-language ones and the French
 * one — and each list holds those that read as that gender. A name is not what makes a student
 * one gender or the other, the field is; the split is only so that a seeded person does not read
 * as a mistake. Umlauts and accents are kept so the address transliteration is still exercised.
 *
 * The surnames are ordinary Austrian ones on a stem that says what they are, the way
 * "Mustermann" does. An earlier set named specimens — Prüfstück, Attrappe, Blindprobe — which is
 * unmistakable but calls the person an object, and a teacher reading a class list should not
 * find that. A seeded student is a stand-in, not a sample.
 */
// prettier-ignore
const MALE_FIRST_NAMES = [
  "Albert", "Anton", "Cäsar", "Charlie", "Daniel", "David", "Emil", "Friedrich", "Gustav",
  "Heinrich", "Isidor", "Jakob", "Julius", "Konrad", "Leopold", "Ludwig", "Mike", "Moritz",
  "Nathan", "Niklaus", "Oscar", "Otto", "Richard", "Romeo", "Samuel", "Siegfried", "Theodor",
  "Ulrich", "Viktor", "Wilhelm", "Xaver", "Zacharias",
];

// prettier-ignore
const FEMALE_FIRST_NAMES = [
  "Anna", "Berta", "Dora", "Ida", "India", "Irma", "Juliett", "Marie", "Martha", "Paula", "Rosa",
  "Sierra", "Sophie", "Suzanne", "Thérèse", "Ursule", "Xanthippe", "Yvonne", "Zoé",
];

// prettier-ignore
const LAST_NAMES = [
  "Musterhofer", "Musteregger", "Mustergruber", "Mustermüller", "Musterbauer", "Musterlechner",
  "Musterwinkler", "Musterjäger", "Musterberger", "Musterwalder", "Musterfelder", "Musterkrämer",
  "Beispielhofer", "Beispielegger", "Beispielgruber", "Beispielmüller", "Beispielbauer",
  "Beispielsteiner", "Beispielwinkler", "Beispieljäger", "Beispielberger", "Beispielwalder",
  "Beispielreiter", "Beispielkrämer",
];

const OTHER_RELATIONSHIPS = ["Tante", "Onkel", "Schwester", "Bruder", "Großmutter", "Stiefvater"];
const HEALTH_NOTES = ["Asthma", "Heuschnupfen", "Pollenallergie", "Knieprobleme", "Kurzsichtig"];
const FOOD_INTOLERANCES = ["Nussallergie", "Laktoseintoleranz", "Glutenfrei", "Kein Fisch"];
// Austria's assigned mobile codes start at 0650 (US-11 shape), so these read as Austrian without
// being able to reach an actual subscriber.
const MOBILE_PREFIXES = ["600", "610", "620", "630", "640"];

const BATCH_LIMIT = 500;

/** Seeded on purpose — see RANDOM_SEED. mulberry32, which is short enough to read. */
function createRandom(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = createRandom(RANDOM_SEED);

const between = (min: number, max: number) => min + random() * (max - min);
const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1));
const chance = (share: number) => random() < share;

function pick<T>(values: readonly T[]): T {
  return values[intBetween(0, values.length - 1)];
}

function shuffle<T>(values: readonly T[]): T[] {
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = intBetween(0, index);
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }

  return shuffled;
}

/**
 * Turns shares into exact counts, with the remainder as one final bucket — so `split(22, [1/3])`
 * is female and male. Twenty-odd students are far too few for a share to come out right by
 * coin-flipping each one, and rounding cumulatively keeps every bucket non-negative.
 */
function split(total: number, shares: readonly number[]): number[] {
  let placed = 0;
  let cumulative = 0;

  const counts = shares.map((share) => {
    cumulative += share;
    const upTo = Math.round(total * cumulative);
    const count = upTo - placed;
    placed = upTo;
    return count;
  });

  return [...counts, total - placed];
}

/** One value per student, in the counts asked for, in no particular order. */
function deal<T>(values: readonly T[], counts: readonly number[]): T[] {
  return shuffle(values.flatMap((value, index) => Array<T>(counts[index]).fill(value)));
}

/** Ages 15 and 16 on the day of the run; a day either side of the window is 14 or 17. */
function dateOfBirth(): string {
  const oldest = new Date();
  oldest.setFullYear(oldest.getFullYear() - AGE_RANGE.max - 1);
  oldest.setDate(oldest.getDate() + 1);

  const youngest = new Date();
  youngest.setFullYear(youngest.getFullYear() - AGE_RANGE.min);

  const born = new Date(between(oldest.getTime(), youngest.getTime()));
  return born.toISOString().slice(0, 10);
}

function phoneNumber(): string {
  const digits = Array.from({ length: 7 }, () => intBetween(0, 9)).join("");
  return `+43 ${pick(MOBILE_PREFIXES)} ${digits}`;
}

type Person = { firstName: string; lastName: string; email: string; gender: Gender };

/**
 * Two students may not share an address: the Auth account is looked up by it, so a repeat would
 * hand back one uid for both and the second would silently overwrite the first. A second surname
 * is the way out that stays an address the tenant could have issued — a digit would not be.
 */
function createPerson(gender: Gender, taken: Set<string>): Person {
  // The two pools are given names sorted by the gender they read as, and a third gender is not a
  // third way of reading one — so it draws from both rather than from a pool invented for it.
  const firstNames =
    gender === "male"
      ? MALE_FIRST_NAMES
      : gender === "female"
        ? FEMALE_FIRST_NAMES
        : [...MALE_FIRST_NAMES, ...FEMALE_FIRST_NAMES];

  for (let attempt = 0; ; attempt += 1) {
    const firstName = pick(firstNames);
    const lastName = attempt < 20 ? pick(LAST_NAMES) : `${pick(LAST_NAMES)}-${pick(LAST_NAMES)}`;
    const email = buildEmail(firstName, lastName, accountTypeSchema.enum.student);

    if (email && !taken.has(email)) {
      taken.add(email);
      return { firstName, lastName, email, gender };
    }
  }
}

function emergencyContact(person: Person): RegistrationInput["emergencyContact"] {
  const relationship = pick(["mother", "father", "other"] as const);
  const firstName = relationship === "father" ? pick(MALE_FIRST_NAMES) : pick(FEMALE_FIRST_NAMES);

  return {
    firstName,
    // Usually the family name, occasionally not — a remarried parent or a guardian.
    lastName: chance(0.85) ? person.lastName : pick(LAST_NAMES),
    relationship,
    relationshipOtherText: relationship === "other" ? pick(OTHER_RELATIONSHIPS) : null,
    phoneNumber: phoneNumber(),
  };
}

type Lists = {
  skillLevels: string[];
  busPickupPoints: string[];
  foodOptions: string[];
  seasonPassOptions: string[];
};

/** How far a seeded registration got: answered whole, left half-done, or never opened. */
type Progress = "answered" | "unfinished" | "unanswered";

function registrationOf(
  person: Person,
  program: Program | null,
  lists: Lists,
  progress: Progress,
): RegistrationInput {
  // Followed the link and never came back to it. Attendance stays null, which is what makes the
  // record incomplete — the exception a teacher is left chasing (US-13, US-23).
  if (progress === "unanswered") return { ...EMPTY_REGISTRATION };

  // Gender belongs to the person rather than to the sports week, so it is answered either way;
  // everything the form hides behind "Nimmst du teil?" stays unanswered for the rest.
  if (program === null) {
    return {
      ...EMPTY_REGISTRATION,
      isAttendingSportsWeek: false,
      gender: person.gender,
      dateOfBirth: dateOfBirth(),
    };
  }

  // Only what the school lends can be asked for, so a program that lends nothing asks nothing.
  const rentable = program.requiredEquipment
    .filter((item) => item.isRentable)
    .map((item) => item.name);
  const rents = rentable.length > 0 && chance(RENTAL_SHARE);
  const wantsOtherFood = chance(OTHER_FOOD_SHARE);

  const answers: RegistrationInput = {
    isAttendingSportsWeek: true,
    program: program.name,
    skillLevel: pick(lists.skillLevels),
    busPickupPoint: pick(lists.busPickupPoints),
    foodOption: wantsOtherFood ? FOOD_OPTION_OTHER : pick(lists.foodOptions),
    foodOtherText: wantsOtherFood ? pick(FOOD_INTOLERANCES) : null,
    // Unlike the other lists, this one is legitimately empty (a summer series asks no such
    // question), and `pick` on an empty list answers undefined rather than null.
    seasonPassOption: lists.seasonPassOptions.length > 0 ? pick(lists.seasonPassOptions) : null,
    dateOfBirth: dateOfBirth(),
    gender: person.gender,
    phoneNumber: phoneNumber(),
    emergencyContact: emergencyContact(person),
    healthNotes: chance(HEALTH_NOTE_SHARE) ? pick(HEALTH_NOTES) : null,
    hasMedication: chance(MEDICATION_SHARE),
    equipmentRentalNeeded: rentable.length > 0 ? rents : null,
    rentedEquipment: rents ? rentable.filter(() => chance(0.75)).slice(0, 4) : [],
    shoeSize: rents ? String(intBetween(36, 47)) : null,
    heightCm: rents ? intBetween(155, 192) : null,
    weightKg: rents ? intBetween(45, 92) : null,
  };

  if (progress === "answered") return answers;

  // One blank is enough to be chased for, and leaves the rest of the row worth reading.
  const blank = pick([...UNFINISHED_ANSWERS]);
  return { ...answers, [blank]: null, ...(blank === "foodOption" ? { foodOtherText: null } : {}) };
}

async function inBatches(
  db: Firestore,
  writes: readonly ((batch: WriteBatch) => void)[],
): Promise<void> {
  for (let index = 0; index < writes.length; index += BATCH_LIMIT) {
    const batch = db.batch();
    for (const write of writes.slice(index, index + BATCH_LIMIT)) write(batch);
    await batch.commit();
  }
}

/**
 * Collections are discovered rather than taken from COLLECTIONS: a purge that only removes the
 * names the code still knows about leaves the ones a rename or a deletion orphaned.
 *
 * `recursiveDelete` takes each collection's subcollections with it, which a document delete does
 * not — so the counts below are of top-level documents and undercount what actually goes.
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

/**
 * The one event series a school cannot be without: every teacher view is scoped to a selection,
 * so with none at all the header offers nothing and the navigation bar points nowhere. Deleting
 * the last unarchived one is refused, so once this has run that state is out of reach.
 *
 * Open only where the students are invented too: seeding stands in for the invitation link a
 * teacher would hand out (US-23), and production has nobody to let in yet.
 */
async function createEventSeries(
  db: Firestore,
  series: SeedEventSeries,
  position: number,
  isOpenToStudents: boolean,
): Promise<EventSeries> {
  // The lists live in this document (US-21), so seeding them is part of creating it.
  const data = {
    ...series,
    nameKey: normalizeName(series.name),
    isArchived: false,
    isOpenToStudents,
    hasRegistrations: false,
    position,
  };
  const reference = db.collection(COLLECTIONS.eventSeries).doc();
  await reference.set(data);

  return { id: reference.id, ...data };
}

/**
 * The one thing here that cannot be undone. Typing the project id back is the ceremony the
 * application already asks of a teacher deleting an event series that holds registrations
 * (US-19) — and it is not something a mistyped script name or a tab-completion can produce.
 */
async function confirmed(projectId: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const typed = await rl.question(
      `This deletes everything in ${projectId}, including real registrations.\n` +
        `Type the project id to continue: `,
    );
    return typed.trim() === projectId;
  } finally {
    rl.close();
  }
}

type SeededAccount = { uid: string; email: string; displayName: string };

/**
 * Every account a series' students need, made in one Admin SDK call per `BATCH_LIMIT` of them
 * rather than one call per student (US-31). `main` always purges Auth first, so there is never
 * an existing account to look up — a per-student `getUserByEmail` would only ever fail before
 * falling back to `createUser`, paying for two round trips where one bulk call does the lot.
 */
async function importAccounts(auth: Auth, accounts: readonly SeededAccount[]): Promise<void> {
  for (let index = 0; index < accounts.length; index += BATCH_LIMIT) {
    const chunk = accounts.slice(index, index + BATCH_LIMIT);
    const { failureCount, errors } = await auth.importUsers(
      chunk.map(({ uid, email, displayName }) => ({
        uid,
        email,
        displayName,
        emailVerified: true,
      })),
    );

    if (failureCount > 0) {
      fail(
        `Could not create ${failureCount} of ${chunk.length} account(s):`,
        ...errors.map(({ error }) => `  ${error.message}`),
      );
    }
  }
}

/**
 * Leaves an invitation at each configured teacher's address, for their first sign-in to claim
 * (US-2). Permissions come from `scripts/seed.yml`, one person at a time, rather than a shared
 * default — the roster names class teachers alongside administrators, and not everybody holds
 * every permission.
 *
 * Not a `users` record, and deliberately not an Auth account either: their accounts are the
 * directory's to create, and one made here would hold the address under a credential Entra did
 * not issue — which is what a real sign-in then collides with. There is therefore no uid to key
 * a record by until somebody actually arrives.
 *
 * `classTeacherOf` names classes (US-40), matched against every series seeded so far rather than
 * one named in advance — the same class name in two series is two different classes, and a name
 * held by both leaves the teacher assigned to both.
 */
async function inviteTeachers(
  db: Firestore,
  teachers: readonly SeedUser[],
  eventSeries: readonly EventSeries[],
): Promise<void> {
  await Promise.all(
    teachers.map((person) => {
      const classNames = new Set(person.classTeacherOf ?? []);
      const classAssignments = eventSeries.flatMap((series) =>
        series.classOptions
          .filter((option) => classNames.has(option.name))
          .map((option) => ({ eventSeriesId: series.id, class: option.name })),
      );

      return db.collection(COLLECTIONS.invitedTeachers).doc(invitationKey(person.email)).set({
        firstName: person.firstName,
        lastName: person.lastName,
        permissions: person.permissions,
        classAssignments,
      });
    }),
  );
}

/**
 * Registers a class list of students into one event series, split evenly across whatever
 * programs it has (US-21) — a name-matched split would stop the run over a rename this script
 * has no reason to care about. `taken` is shared across every series seeded in the same run, so
 * the same generated name is never handed to two different students under two different series.
 */
async function seedRegistrations(
  db: Firestore,
  auth: Auth,
  eventSeries: EventSeries,
  taken: Set<string>,
): Promise<void> {
  const programs = eventSeries.programs;
  if (programs.length === 0) {
    fail(`"${eventSeries.name}" has no programs to register students into.`);
  }

  // One share per program but the last, whose share `split` derives as the remainder.
  const shares = programs.slice(0, -1).map(() => 1 / programs.length);

  const lists: Lists = {
    skillLevels: eventSeries.skillLevels,
    busPickupPoints: eventSeries.busPickupPoints,
    foodOptions: eventSeries.foodOptions,
    seasonPassOptions: eventSeries.seasonPassOptions,
  };

  const classNames = eventSeries.classOptions.map((option) => option.name);
  if (classNames.length === 0) {
    fail(`"${eventSeries.name}" has no classes to register students into.`);
  }

  const writes: ((batch: WriteBatch) => void)[] = [];
  const accounts: SeededAccount[] = [];
  const summary: string[] = [];
  let seeded = 0;

  for (const className of classNames) {
    const size = intBetween(STUDENTS_PER_CLASS.min, STUDENTS_PER_CLASS.max);
    const [attending, absent] = split(size, [between(ATTENDING_SHARE.min, ATTENDING_SHARE.max)]);
    const genders = deal(
      ["female", "diverse", "male"] as const,
      split(size, [FEMALE_SHARE, DIVERSE_SHARE]),
    );
    // Alternated rather than rolled, so a class always gets both kinds rather than three of one.
    const unfinished = Math.min(
      intBetween(INCOMPLETE_PER_CLASS.min, INCOMPLETE_PER_CLASS.max),
      size,
    );
    const progress = shuffle<Progress>([
      ...Array.from({ length: unfinished }, (_, at) =>
        at % 2 === 0 ? "unanswered" : ("unfinished" as Progress),
      ),
      ...Array<Progress>(size - unfinished).fill("answered"),
    ]);
    // Counted from what was written rather than from `attending`: a student the plan meant to
    // take part may have been left unanswered instead, and a summary that says otherwise lies.
    const written = { attending: 0, incomplete: 0 };
    // Null is the absentee's "no program", which is why it is dealt alongside the real ones.
    const chosen = shuffle([
      ...deal<Program | null>(programs, split(attending, shares)),
      ...Array<Program | null>(absent).fill(null),
    ]);

    for (let index = 0; index < size; index += 1) {
      const person = createPerson(genders[index], taken);
      const registration = registrationOf(person, chosen[index], lists, progress[index]);
      if (registration.isAttendingSportsWeek === true) written.attending += 1;

      const uid = randomUUID();
      console.log(`  ${eventSeries.name} / ${className}: ${person.firstName} ${person.lastName}`);
      const user = userSchema.parse({ id: uid, ...person, accountType: "student" });
      const record = registrationSchema.parse({
        id: uid,
        studentUid: uid,
        // Copied onto the record, which is what a reader takes the name from (US-26).
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        // Set by the invitation link a student joins through rather than answered (US-23).
        class: className,
        // Unassigned on purpose: putting students into events is what the board is for (US-12).
        event: null,
        ...registration,
      });
      // Nobody has an event yet, so a two-step series asks nothing an event could answer
      // differently here either (US-36) — the same rule a real registration is read under.
      if (isRegistrationIncomplete(record, questionsFor(eventSeries, null))) {
        written.incomplete += 1;
      }

      const { id: userId, ...userFields } = user;
      const { id: recordId, ...recordFields } = record;
      accounts.push({
        uid,
        email: person.email,
        displayName: `${person.firstName} ${person.lastName}`,
      });
      writes.push((batch) => batch.set(db.collection(COLLECTIONS.users).doc(userId), userFields));
      writes.push((batch) =>
        batch.set(db.collection(registrationPath(eventSeries.id)).doc(recordId), recordFields),
      );
    }

    seeded += size;
    const counted = genderSchema.options
      .map((gender) => `${genders.filter((one) => one === gender).length} ${gender}`)
      .join(" / ");
    const perProgram = programs
      .map((program) => `${program.name} ${chosen.filter((c) => c === program).length}`)
      .join(", ");
    summary.push(
      `  ${className}: ${size} students, ${written.attending} attending, ` +
        `${written.incomplete} incomplete, ` +
        `${counted}, ${perProgram}`,
    );
  }

  // Mirrors what a student's own save does, so the event series view knows it may no longer be deleted.
  writes.push((batch) =>
    batch.update(db.collection(COLLECTIONS.eventSeries).doc(eventSeries.id), {
      hasRegistrations: true,
    }),
  );

  await importAccounts(auth, accounts);
  await inBatches(db, writes);

  console.log(`Seeded ${seeded} students into "${eventSeries.name}":`);
  for (const line of summary) console.log(line);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const environment = ENVIRONMENTS.find((allowed) => args.includes(allowed));
  const unknown = args.filter((arg) => arg !== environment && arg !== BARE);
  if (environment === undefined || unknown.length > 0) {
    fail(
      `Usage: npm run seed:<environment> [-- ${BARE}],`,
      `where <environment> is ${ENVIRONMENTS.join(", ")}.`,
      `${BARE} leaves a test environment as bare as production.`,
    );
  }

  const projectId = apphostingValue(environment, "NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const isTest = TEST_ENVIRONMENTS.includes(environment);
  // Production is bare whatever is asked, so the flag changes nothing there and is not refused.
  const seedsStudents = isTest && !args.includes(BARE);

  if (!isTest && !(await confirmed(projectId))) fail("That is not the project id. Nothing done.");

  const config = loadSeedConfig();
  if (config.eventSeries.length === 0) fail("scripts/seed.yml names no event series.");

  // Its own app rather than @/lib/firebase/admin: that one addresses whichever project the
  // ambient environment names, and this must address the one just named and nothing else.
  const app = initializeApp({ projectId });
  const db = getFirestore(app);
  const auth = getAuth(app);

  const collections = await purgeFirestore(db);
  const accounts = await purgeAuth(auth);

  console.log(`Purged ${projectId}:`);
  for (const [name, count] of collections) console.log(`  ${name}: ${count} document(s)`);
  if (collections.length === 0) console.log("  no collections");
  console.log(`  ${accounts} account(s)`);

  // The lists are fields of the event series (US-21), so there is nothing to read until it
  // exists — and creating it is what seeds them, since the application no longer does. Only the
  // first is bare-seeded: production gets the one a school cannot be without, and every series
  // after it is invented only where students are invented too.
  //
  // All of them are created before anybody is invited, so a class held by more than one series
  // is matched into every one of them (US-40) — an invitation left for only the first would
  // otherwise never see that the rest exist.
  const created: EventSeries[] = [];
  for (const [index, series] of config.eventSeries.entries()) {
    if (index > 0 && !seedsStudents) continue;

    const data = index === 0 && !seedsStudents ? bareEventSeriesOf(series) : series;
    const one = await createEventSeries(db, data, index, seedsStudents);
    console.log(`Created the event series "${one.name}".`);
    created.push(one);
  }

  await inviteTeachers(db, config.users, created);
  console.log(`Invited ${config.users.map((one) => one.email).join(", ")}.`);

  // Production is done here, and so is a test environment asked for the same bare state.
  if (!seedsStudents) return;

  const taken = new Set<string>();
  for (const series of created) {
    await seedRegistrations(db, auth, series, taken);
  }
}

await main();
