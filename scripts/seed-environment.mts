/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
/**
 * Resets a project to its defaults: everything is deleted, and what this script writes is then
 * all it holds.
 *
 * | production              | one event series with the lists that are the same every year |
 * | development, staging    | that series, filled in, plus a roster and its registrations  |
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
import { createInterface } from "node:readline/promises";
import { initializeApp } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore, type WriteBatch } from "firebase-admin/firestore";
import { buildEmail } from "@/lib/auth/fake/email-builder";
import { COLLECTIONS } from "@/lib/schemas/collections";
import type { Gender } from "@/lib/schemas/common";
import { FOOD_OPTION_OTHER, type Program } from "@/lib/schemas/master-data";
import type { EventSeries } from "@/lib/schemas/event-series";
import { registrationSchema, type RegistrationInput } from "@/lib/schemas/registration";
import { accountTypeSchema, userSchema } from "@/lib/schemas/user";
import { FULL_PERMISSIONS } from "@/lib/auth/permissions";
import { normalizeName } from "@/lib/firebase/name-key";
import { isRegistrationIncomplete } from "@/lib/registration/completeness";
import { questionsAsked } from "@/lib/master-data/categories";
import { EMPTY_REGISTRATION, registrationPath } from "@/lib/registration/registration";
import {
  apphostingValue,
  DEVELOPMENT,
  ENVIRONMENTS,
  fail,
  STAGING,
  type Environment,
} from "./environment.mjs";

/**
 * Where inventing people is allowed, and where a purge needs no ceremony. Production is absent
 * by construction rather than by a check: it gets the defaults and stops, because no argument
 * can ask for anything else.
 */
const TEST_ENVIRONMENTS: readonly Environment[] = [DEVELOPMENT, STAGING];

/**
 * Who a purged school starts out able to administer it, in every environment including
 * production. Signing in grants nothing on its own, so without these there would be nobody who
 * could hand out a permission and no way to become that person from inside the application.
 *
 * These are records rather than accounts: they sign in through Entra ID like anybody else, and
 * provisioning then fills in the name and the photo it finds. What it does not touch is what a
 * record already holds, which is what makes these survive their first login.
 *
 * Who administers a school later on is a question for the records — `npm run logins:<environment>`
 * asks it — since a permission granted or withdrawn since is not visible from here.
 */
const ADMINISTRATORS = [
  { firstName: "Hannes", lastName: "Stauss", email: "hannes.stauss@htldornbirn.at" },
  { firstName: "Julia", lastName: "Mathis", email: "julia.mathis@htldornbirn.at" },
  { firstName: "Norbert", lastName: "Lenz", email: "norbert.lenz@htldornbirn.at" },
] as const;

/** Asks one of them for the bare state instead, which is what a school's first day is. */
const BARE = "--bare";

/** Both listUsers and deleteUsers cap a single call at this many accounts. */
const USER_PAGE_SIZE = 1000;

/**
 * The lists a school configures once and every event series thereafter inherits by being made
 * from the template (US-22). Its own two — the events it runs and the classes it invites — are
 * not among them: those say which week it is rather than how the school works.
 */
const CATEGORY_DEFAULTS = {
  programs: [
    { name: "Ski", requiredEquipment: ["Ski", "Skischuhe", "Stöcke", "Helm"] },
    { name: "Snowboard", requiredEquipment: ["Board", "Boots", "Helm"] },
    { name: "Alternativ", requiredEquipment: [] },
  ],
  skillLevels: ["Keine Vorkenntnisse", "Anfänger:in", "Fortgeschritten", "Profi"],
  seasonPassOptions: [
    "Kein Skipass",
    "Vielleicht Skipass",
    "Golm-Bielerhöhe (Illwerke)",
    "Silvretta-Montafon",
  ],
  busPickupPoints: ["HTL Dornbirn", "Bahnhof Bregenz", "Bahnhof Feldkirch", "Heim Tschagguns"],
  foodOptions: ["Esse alles", "Vegetarisch", "Vegan", "Kein Schweinefleisch"],
} satisfies Pick<
  EventSeries,
  "programs" | "skillLevels" | "seasonPassOptions" | "busPickupPoints" | "foodOptions"
>;

/**
 * What a purged environment gets so there is somewhere to put students. The application seeds
 * nothing at all any more — it cannot know whether it is being asked for a Wintersportwoche or a
 * Kulturwoche — so a fresh project holds only what is written here.
 */
const DEFAULT_EVENT_SERIES_NAME = "Wintersportwochen 2026/2027";

/**
 * What production gets: the five lists that are the same every year, and nothing for the two that
 * are not. Which weeks there are and which classes go on them is what a teacher fills in.
 */
const BARE_LISTS = {
  events: [],
  classOptions: [],
  ...CATEGORY_DEFAULTS,
} satisfies Pick<EventSeries, "events" | "classOptions"> & typeof CATEGORY_DEFAULTS;

/** The seven maintained lists as a test environment wants them, filled in far enough to use. */
const MASTER_DATA_DEFAULTS = {
  events: ["Woche 1", "Woche 2", "Woche 3"],
  classOptions: ["2aWI", "2bWI", "2cWI"],
  ...CATEGORY_DEFAULTS,
} satisfies Pick<EventSeries, "events" | "classOptions"> & typeof CATEGORY_DEFAULTS;

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
const AGE_RANGE = { min: 15, max: 16 };

/**
 * Matched against the programs a teacher maintains (US-5), so a renamed one stops the run rather
 * than quietly changing the split. Whatever is left over goes to the programs not named here.
 */
const PROGRAM_SHARES = [
  ["Ski", 0.6],
  ["Snowboard", 0.3],
] as const;

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
 * They are spelling-alphabet words — NATO's, the German-language ones and the French one — and
 * each list holds those that read as that gender. A name is not what makes a student one gender
 * or the other, the field is; the split is only so that a seeded person does not read as a
 * mistake. Umlauts and accents are kept so the address transliteration is still exercised.
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
  "Musterfall", "Prüffall", "Testfall", "Beispielfall", "Übungsfall", "Demofall", "Modellfall",
  "Musterakte", "Prüfmuster", "Testmuster", "Blindprobe", "Nullprobe", "Großprobe", "Stichprobe",
  "Platzhalter", "Schablone", "Attrappe", "Vorlage", "Musterzeile", "Prüfstück", "Testreihe",
  "Fallbeispiel", "Musterbogen", "Prüfbogen",
];

const OTHER_RELATIONSHIPS = ["Tante", "Onkel", "Schwester", "Bruder", "Großmutter", "Stiefvater"];
const HEALTH_NOTES = ["Asthma", "Heuschnupfen", "Pollenallergie", "Knieprobleme", "Kurzsichtig"];
const FOOD_INTOLERANCES = ["Nussallergie", "Laktoseintoleranz", "Glutenfrei", "Kein Fisch"];
const MOBILE_PREFIXES = ["650", "660", "664", "676", "677", "699"];

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
  const firstNames = gender === "male" ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES;

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

  const rents = program.requiredEquipment.length > 0 && chance(RENTAL_SHARE);
  const wantsOtherFood = chance(OTHER_FOOD_SHARE);

  const answers: RegistrationInput = {
    isAttendingSportsWeek: true,
    program: program.name,
    skillLevel: pick(lists.skillLevels),
    busPickupPoint: pick(lists.busPickupPoints),
    foodOption: wantsOtherFood ? FOOD_OPTION_OTHER : pick(lists.foodOptions),
    foodOtherText: wantsOtherFood ? pick(FOOD_INTOLERANCES) : null,
    seasonPassOption: pick(lists.seasonPassOptions),
    dateOfBirth: dateOfBirth(),
    gender: person.gender,
    phoneNumber: phoneNumber(),
    emergencyContact: emergencyContact(person),
    healthNotes: chance(HEALTH_NOTE_SHARE) ? pick(HEALTH_NOTES) : null,
    hasMedication: chance(MEDICATION_SHARE),
    equipmentRentalNeeded: program.requiredEquipment.length > 0 ? rents : null,
    rentedEquipment: rents ? program.requiredEquipment.filter(() => chance(0.75)).slice(0, 4) : [],
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
  lists: typeof BARE_LISTS | typeof MASTER_DATA_DEFAULTS,
  isOpenToStudents: boolean,
): Promise<EventSeries> {
  // The lists live in this document (US-21), so seeding them is part of creating it.
  const data = {
    name: DEFAULT_EVENT_SERIES_NAME,
    nameKey: normalizeName(DEFAULT_EVENT_SERIES_NAME),
    isArchived: false,
    isOpenToStudents,
    hasRegistrations: false,
    position: 0,
    ...lists,
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

/**
 * The account behind a seeded record, because a record is keyed by the uid and only Firebase can
 * mint one (US-31). Purging deletes these along with everything else, so a re-run creates them
 * again rather than finding them — the lookup is for a re-run over a tree that was not purged.
 */
async function uidFor(auth: Auth, email: string, displayName: string): Promise<string> {
  try {
    return (await auth.getUserByEmail(email)).uid;
  } catch {
    return (await auth.createUser({ email, displayName, emailVerified: true })).uid;
  }
}

/**
 * Leaves an invitation at each administrator's address, for the first sign-in to claim (US-2).
 *
 * Not a `users` record, and deliberately not an Auth account either: their accounts are the
 * directory's to create, and one made here would hold the address under a credential Entra did
 * not issue — which is what a real sign-in then collides with. There is therefore no uid to key
 * a record by until somebody actually arrives.
 */
async function inviteAdministrators(db: Firestore): Promise<void> {
  await Promise.all(
    ADMINISTRATORS.map((person) =>
      db
        .collection(COLLECTIONS.invitedTeachers)
        .doc(person.email)
        .set({
          firstName: person.firstName,
          lastName: person.lastName,
          permissions: [...FULL_PERMISSIONS],
        }),
    ),
  );
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
  // exists — and creating it is what seeds them, since the application no longer does.
  const eventSeries = await createEventSeries(
    db,
    seedsStudents ? MASTER_DATA_DEFAULTS : BARE_LISTS,
    seedsStudents,
  );
  console.log(`Created the event series "${eventSeries.name}".`);

  await inviteAdministrators(db);
  console.log(`Invited ${ADMINISTRATORS.map((one) => one.email).join(", ")}.`);

  // Production is done here, and so is a test environment asked for the same bare state.
  if (!seedsStudents) return;

  const programs = eventSeries.programs;
  const named = PROGRAM_SHARES.map(([name]) => programs.find((program) => program.name === name));
  const others = programs.filter((program) => !PROGRAM_SHARES.some(([n]) => n === program.name));

  if (named.some((program) => program === undefined) || others.length === 0) {
    fail(
      `The programs of "${eventSeries.name}" in ${projectId} do not match the split this script seeds.`,
      `  wanted: ${PROGRAM_SHARES.map(([name, share]) => `${name} ${share * 100}%`).join(", ")}, plus at least one more for the rest`,
      `  found:  ${programs.map((program) => program.name).join(", ") || "none"}`,
    );
  }

  const ordered = [...(named as Program[]), ...others];
  const restShare = 1 - PROGRAM_SHARES.reduce((sum, [, share]) => sum + share, 0);
  const programShares = [
    ...PROGRAM_SHARES.map(([, share]) => share),
    ...others.slice(0, -1).map(() => restShare / others.length),
  ];

  const lists: Lists = {
    skillLevels: eventSeries.skillLevels,
    busPickupPoints: eventSeries.busPickupPoints,
    foodOptions: eventSeries.foodOptions,
    seasonPassOptions: eventSeries.seasonPassOptions,
  };

  const classNames = eventSeries.classOptions;
  if (classNames.length === 0) {
    fail(`"${eventSeries.name}" in ${projectId} has no classes to register students into.`);
  }

  const taken = new Set<string>();
  const writes: ((batch: WriteBatch) => void)[] = [];
  const summary: string[] = [];

  for (const className of classNames) {
    const size = intBetween(STUDENTS_PER_CLASS.min, STUDENTS_PER_CLASS.max);
    const [attending, absent] = split(size, [between(ATTENDING_SHARE.min, ATTENDING_SHARE.max)]);
    const genders = deal(["female", "male"] as const, split(size, [FEMALE_SHARE]));
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
      ...deal<Program | null>(ordered, split(attending, programShares)),
      ...Array<Program | null>(absent).fill(null),
    ]);

    for (let index = 0; index < size; index += 1) {
      const person = createPerson(genders[index], taken);
      const registration = registrationOf(person, chosen[index], lists, progress[index]);
      if (registration.isAttendingSportsWeek === true) written.attending += 1;

      const uid = await uidFor(auth, person.email, `${person.firstName} ${person.lastName}`);
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
        isIncomplete: isRegistrationIncomplete(registration, questionsAsked(eventSeries)),
        ...registration,
      });
      if (record.isIncomplete) written.incomplete += 1;

      const { id: userId, ...userFields } = user;
      const { id: recordId, ...recordFields } = record;
      writes.push((batch) => batch.set(db.collection(COLLECTIONS.users).doc(userId), userFields));
      writes.push((batch) =>
        batch.set(db.collection(registrationPath(eventSeries.id)).doc(recordId), recordFields),
      );
    }

    const female = genders.filter((gender) => gender === "female").length;
    const perProgram = ordered
      .map((program) => `${program.name} ${chosen.filter((c) => c === program).length}`)
      .join(", ");
    summary.push(
      `  ${className}: ${size} students, ${written.attending} attending, ` +
        `${written.incomplete} incomplete, ` +
        `${size - female} male / ${female} female, ${perProgram}`,
    );
  }

  // Mirrors what a student's own save does, so the event series view knows it may no longer be deleted.
  writes.push((batch) =>
    batch.update(db.collection(COLLECTIONS.eventSeries).doc(eventSeries.id), {
      hasRegistrations: true,
    }),
  );

  await inBatches(db, writes);

  console.log(`Seeded ${taken.size} students into "${eventSeries.name}":`);
  for (const line of summary) console.log(line);
}

await main();
