/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
/**
 * Fills a test database with a student body worth planning against: every class gets a roster, so
 * the assignment board and the report (US-12, US-13) have more than a handful of rows to show.
 * Every student is deleted first, which is what makes running it twice safe.
 *
 * The target is named on the command line and looked up in SEEDABLE_ENVIRONMENTS, which has no
 * production entry to disable. This invents people and deletes real ones, so the environments it
 * can reach are a closed list rather than whatever a variable happens to hold.
 */
import { initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore, type WriteBatch } from "firebase-admin/firestore";
import { buildUpn } from "@/lib/auth/fake/upn-builder";
import { COLLECTIONS } from "@/lib/schemas/collections";
import type { Gender } from "@/lib/schemas/common";
import { FOOD_OPTION_OTHER, type Program } from "@/lib/schemas/master-data";
import { eventSeriesSchema, type EventSeries } from "@/lib/schemas/event-series";
import { registrationSchema, type RegistrationInput } from "@/lib/schemas/registration";
import { userRoleSchema, userSchema } from "@/lib/schemas/user";
import { activeEventSeriesOf } from "@/lib/event-series/event-series-state";
import { normalizeName } from "@/lib/firebase/name-key";
import { isRegistrationIncomplete } from "@/lib/registration/completeness";
import { EMPTY_REGISTRATION, recordIdFor } from "@/lib/registration/registration";
import { apphostingValue, fail } from "./environment.mjs";

/** Where invented students are allowed. Production is absent by construction, not by a check. */
const SEEDABLE_ENVIRONMENTS = ["development", "staging"] as const;

/**
 * What a purged environment gets so there is somewhere to put students. The application seeds
 * nothing at all any more — it cannot know whether it is being asked for a Wintersportwoche or a
 * Kulturwoche — so a fresh project holds only what is written here.
 */
const DEFAULT_EVENT_SERIES_NAME = "2026/2027";

/**
 * The seven maintained lists of that event series: its events, then the six the master data menu
 * shows, in the order it shows them.
 */
const MASTER_DATA_DEFAULTS = {
  events: ["Woche 1", "Woche 2", "Woche 3"],
  classOptions: ["2aWI", "2bWI", "2cWI"],
  programs: [
    { name: "Ski", requiredEquipment: ["Ski", "Skischuhe", "Stöcke", "Helm"] },
    { name: "Snowboard", requiredEquipment: ["Board", "Boots", "Helm"] },
    { name: "Alternativ", requiredEquipment: [] },
  ],
  skillLevels: ["Keine Vorkenntnisse", "Anfänger:in", "Fortgeschritten", "Profi"],
  seasonPassOptions: ["Keine", "Vielleicht", "Golm-Bielerhöhe (Illwerke)", "Silvretta-Montafon"],
  busPickupPoints: ["HTL Dornbirn", "Bahnhof Bregenz", "Bahnhof Feldkirch", "Unterkunft"],
  foodOptions: ["Alles", "Vegetarisch", "Vegan", "Kein Schweinefleisch"],
} satisfies Pick<
  EventSeries,
  | "events"
  | "classOptions"
  | "programs"
  | "skillLevels"
  | "seasonPassOptions"
  | "busPickupPoints"
  | "foodOptions"
>;

/** The shape of the sports week as it is wanted in a test environment. */
const STUDENTS_PER_CLASS = { min: 20, max: 25 };
const ATTENDING_SHARE = { min: 0.7, max: 0.8 };
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

// prettier-ignore
const MALE_FIRST_NAMES = [
  "Lukas", "Maximilian", "Tobias", "Fabian", "David", "Jonas", "Simon", "Elias", "Felix",
  "Julian", "Moritz", "Paul", "Samuel", "Noah", "Jakob", "Leon", "Matthias", "Philipp",
  "Sebastian", "Andreas", "Michael", "Thomas", "Stefan", "Daniel", "Florian", "Christoph",
  "Manuel", "Marcel", "Patrick", "Dominik", "Raphael", "Benjamin", "Alexander", "Valentin",
];

// prettier-ignore
const FEMALE_FIRST_NAMES = [
  "Anna", "Lena", "Sarah", "Julia", "Laura", "Magdalena", "Hannah", "Sophie", "Lisa", "Marie",
  "Elena", "Katharina", "Johanna", "Theresa", "Verena", "Nina", "Vanessa", "Melanie", "Carina",
  "Selina", "Jasmin", "Larissa", "Isabella", "Valentina", "Emma", "Nora", "Clara", "Elisa",
  "Franziska", "Alina", "Chiara", "Leonie", "Amelie", "Victoria",
];

// prettier-ignore
const LAST_NAMES = [
  "Gruber", "Huber", "Bauer", "Wagner", "Müller", "Pichler", "Steiner", "Moser", "Mayer",
  "Hofer", "Leitner", "Berger", "Fuchs", "Eder", "Fischer", "Schmid", "Winkler", "Weber",
  "Schwarz", "Maier", "Schneider", "Reiter", "Wimmer", "Egger", "Brunner", "Lang", "Auer",
  "Binder", "Lechner", "Wolf", "Wallner", "Aigner", "Ebner", "Koller", "Lehner", "Haas",
  "Schuster", "Riedl", "Höller", "Sailer", "Kaufmann", "Feurstein", "Bösch", "Fessler",
  "Amann", "Nachbaur", "Konzett", "Vonbank", "Sutterlüty", "Metzler", "Rüscher", "Ströhle",
  "Bertsch", "Hämmerle", "Bilgeri", "Ölz", "Baumgartner", "Dür", "Fritsch", "Rhomberg",
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

type Person = { firstName: string; lastName: string; upn: string; gender: Gender };

/**
 * Two students may not share an address, since the UPN is the user's document id. A second
 * surname is the way out that stays a UPN the tenant could have issued — a digit would not be.
 */
function createPerson(gender: Gender, taken: Set<string>): Person {
  const firstNames = gender === "male" ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES;

  for (let attempt = 0; ; attempt += 1) {
    const firstName = pick(firstNames);
    const lastName = attempt < 20 ? pick(LAST_NAMES) : `${pick(LAST_NAMES)}-${pick(LAST_NAMES)}`;
    const upn = buildUpn(firstName, lastName, userRoleSchema.enum.student);

    if (upn && !taken.has(upn)) {
      taken.add(upn);
      return { firstName, lastName, upn, gender };
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

function registrationOf(
  person: Person,
  className: string,
  program: Program | null,
  lists: Lists,
): RegistrationInput {
  // Gender belongs to the person rather than to the sports week, so it is answered either way;
  // everything the form hides behind "Nimmst du teil?" stays unanswered for the rest.
  if (program === null) {
    return {
      ...EMPTY_REGISTRATION,
      class: className,
      gender: person.gender,
      dateOfBirth: dateOfBirth(),
    };
  }

  const rents = program.requiredEquipment.length > 0 && chance(RENTAL_SHARE);
  const wantsOtherFood = chance(OTHER_FOOD_SHARE);

  return {
    isAttendingSportsWeek: true,
    class: className,
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
 * Firestore only — the Firebase Auth accounts impersonation creates on demand are left alone,
 * since the fixed seed hands the same addresses back to the same people on the next run.
 */
async function purgeStudents(db: Firestore): Promise<{ records: number; users: number }> {
  const records = await db.collection(COLLECTIONS.registrations).get();
  const users = await db
    .collection(COLLECTIONS.users)
    .where("role", "==", userRoleSchema.enum.student)
    .get();

  const doomed = [...records.docs, ...users.docs];
  await inBatches(
    db,
    doomed.map((doc) => (batch: WriteBatch) => batch.delete(doc.ref)),
  );

  return { records: records.size, users: users.size };
}

/**
 * Writes a record and the reservation that claims its name in one commit, which is what the
 * services do — a record whose name nobody reserved would let a teacher create it a second time.
 * The reservation is `create`d rather than `set`, so a name already taken fails the whole commit
 * instead of quietly stealing it.
 */
/** Activating an existing one rather than adding a second: names are unique across event series. */
async function ensureActiveEventSeries(db: Firestore): Promise<EventSeries> {
  const eventSeries = (await db.collection(COLLECTIONS.eventSeries).get()).docs.map((doc) =>
    eventSeriesSchema.parse({ id: doc.id, ...doc.data() }),
  );

  const active = activeEventSeriesOf(eventSeries);
  if (active) return active;

  const existing = eventSeries.find(
    (eventSeries) => eventSeries.name === DEFAULT_EVENT_SERIES_NAME && !eventSeries.isArchived,
  );
  if (existing) {
    await db.collection(COLLECTIONS.eventSeries).doc(existing.id).update({ isActive: true });
    return { ...existing, isActive: true };
  }

  // The lists live in this document (US-21), so seeding them is part of creating it.
  const data = {
    name: DEFAULT_EVENT_SERIES_NAME,
    nameKey: normalizeName(DEFAULT_EVENT_SERIES_NAME),
    isActive: true,
    isArchived: false,
    hasRegistrations: false,
    position: eventSeries.length,
    ...MASTER_DATA_DEFAULTS,
  };
  const reference = db.collection(COLLECTIONS.eventSeries).doc();
  await reference.set(data);

  return { id: reference.id, ...data };
}

async function main(): Promise<void> {
  const [environment] = process.argv.slice(2);
  if (!SEEDABLE_ENVIRONMENTS.some((allowed) => allowed === environment)) {
    fail(
      `Usage: npm run seed:<environment>, where <environment> is ${SEEDABLE_ENVIRONMENTS.join(" or ")}.`,
      "Every student in the named project is deleted and replaced, so no other environment is",
      "reachable from here — least of all one with real registrations in it.",
    );
  }

  const projectId = apphostingValue(environment, "NEXT_PUBLIC_FIREBASE_PROJECT_ID");

  // Its own app rather than @/lib/firebase/admin: that one addresses whichever project the
  // ambient environment names, and this must address the one just named and nothing else.
  const db = getFirestore(initializeApp({ projectId }));

  // The lists are fields of the event series (US-21), so there is nothing to read until it
  // exists — and creating it is what seeds them, since the application no longer does.
  const eventSeries = await ensureActiveEventSeries(db);

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

  const purged = await purgeStudents(db);
  console.log(
    `Purged ${purged.records} registration(s) and ${purged.users} student(s) from ${projectId}.`,
  );

  const taken = new Set<string>();
  const writes: ((batch: WriteBatch) => void)[] = [];
  const summary: string[] = [];

  for (const className of classNames) {
    const size = intBetween(STUDENTS_PER_CLASS.min, STUDENTS_PER_CLASS.max);
    const [attending, absent] = split(size, [between(ATTENDING_SHARE.min, ATTENDING_SHARE.max)]);
    const genders = deal(["female", "male"] as const, split(size, [FEMALE_SHARE]));
    // Null is the absentee's "no program", which is why it is dealt alongside the real ones.
    const chosen = shuffle([
      ...deal<Program | null>(ordered, split(attending, programShares)),
      ...Array<Program | null>(absent).fill(null),
    ]);

    for (let index = 0; index < size; index += 1) {
      const person = createPerson(genders[index], taken);
      const registration = registrationOf(person, className, chosen[index], lists);

      const user = userSchema.parse({ id: person.upn, ...person, email: person.upn, role: "student" }); // prettier-ignore
      const record = registrationSchema.parse({
        id: recordIdFor(eventSeries.id, person.upn),
        userId: person.upn,
        eventSeriesId: eventSeries.id,
        // Unassigned on purpose: putting students into events is what the board is for (US-12).
        event: null,
        isIncomplete: isRegistrationIncomplete(registration),
        ...registration,
      });

      const { id: userId, ...userFields } = user;
      const { id: recordId, ...recordFields } = record;
      writes.push((batch) => batch.set(db.collection(COLLECTIONS.users).doc(userId), userFields));
      writes.push((batch) =>
        batch.set(db.collection(COLLECTIONS.registrations).doc(recordId), recordFields),
      );
    }

    const female = genders.filter((gender) => gender === "female").length;
    const perProgram = ordered
      .map((program) => `${program.name} ${chosen.filter((c) => c === program).length}`)
      .join(", ");
    summary.push(
      `  ${className}: ${size} students, ${attending} attending, ` +
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
