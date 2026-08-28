/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
/**
 * Fills a project with what its environment is meant to hold, and takes the environment as its
 * only argument — there is no mode to get wrong.
 *
 * | production           | the "Wintersportwochen" template, and nothing besides |
 * | development, staging | the whole test environment, that template included    |
 *
 * Production therefore never receives invented students. That is true by construction rather than
 * by a check: no argument asks for it, so there is nothing to pass by mistake.
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
import { normalizeName } from "@/lib/firebase/name-key";
import { isRegistrationIncomplete } from "@/lib/registration/completeness";
import { questionsAsked } from "@/lib/master-data/categories";
import { EMPTY_REGISTRATION, registrationPath } from "@/lib/registration/registration";
import { apphostingValue, fail } from "./environment.mjs";

const ENVIRONMENTS = ["development", "staging", "production"] as const;

/** Where invented students are allowed. Production is absent by construction, not by a check. */
const SEEDABLE_ENVIRONMENTS = ["development", "staging"] as const;

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
 * Plural on purpose: a template is the pattern behind every Wintersportwoche the school runs,
 * not one of them. What a teacher makes from it is singular and dated, so the two cannot collide
 * under the uniqueness rule (Q14).
 */
const TEMPLATE_NAME = "Wintersportwochen";

/**
 * What a purged environment gets so there is somewhere to put students. The application seeds
 * nothing at all any more — it cannot know whether it is being asked for a Wintersportwoche or a
 * Kulturwoche — so a fresh project holds only what is written here.
 */
const DEFAULT_EVENT_SERIES_NAME = "Wintersportwochen 2026/2027";

/**
 * The seven maintained lists of that event series: its own two, then the five the template hands
 * on, taken from the same place production takes them.
 */
const MASTER_DATA_DEFAULTS = {
  events: ["Woche 1", "Woche 2", "Woche 3"],
  classOptions: ["2aWI", "2bWI", "2cWI"],
  ...CATEGORY_DEFAULTS,
} satisfies Pick<EventSeries, "events" | "classOptions"> & typeof CATEGORY_DEFAULTS;

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

function registrationOf(person: Person, program: Program | null, lists: Lists): RegistrationInput {
  // Gender belongs to the person rather than to the sports week, so it is answered either way;
  // everything the form hides behind "Nimmst du teil?" stays unanswered for the rest.
  if (program === null) {
    return {
      ...EMPTY_REGISTRATION,
      gender: person.gender,
      dateOfBirth: dateOfBirth(),
    };
  }

  const rents = program.requiredEquipment.length > 0 && chance(RENTAL_SHARE);
  const wantsOtherFood = chance(OTHER_FOOD_SHARE);

  return {
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
  // Across every event series, since a registration lives beneath the one it belongs to (US-26).
  const records = await db.collectionGroup(COLLECTIONS.registrations).get();
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
 * The one event series a school cannot be without: every teacher view is scoped to a selection,
 * so with none at all the header offers nothing and the navigation bar points nowhere. Deleting
 * the last unarchived template is refused, so once this has run that state is out of reach.
 *
 * Any unarchived template will do — a school that renamed theirs has not lost one — so a second
 * is added only where there is none, which is what makes running this again harmless.
 */
async function ensureTemplate(db: Firestore): Promise<{ name: string; created: boolean }> {
  const templates = await db
    .collection(COLLECTIONS.eventSeries)
    .where("isTemplate", "==", true)
    .where("isArchived", "==", false)
    .limit(1)
    .get();

  const found = templates.docs[0];
  if (found) return { name: String(found.data().name), created: false };

  const clash = await db
    .collection(COLLECTIONS.eventSeries)
    .where("nameKey", "==", normalizeName(TEMPLATE_NAME))
    .limit(1)
    .get();
  if (!clash.empty) {
    fail(
      `"${TEMPLATE_NAME}" is already taken by an event series that is not an unarchived template.`,
      "Event series names are unique (Q14), so rename that one or make it the template.",
    );
  }

  const total = (await db.collection(COLLECTIONS.eventSeries).count().get()).data().count;
  await db.collection(COLLECTIONS.eventSeries).add({
    name: TEMPLATE_NAME,
    nameKey: normalizeName(TEMPLATE_NAME),
    isTemplate: true,
    isArchived: false,
    isOpenToStudents: false,
    hasRegistrations: false,
    position: total,
    // What differs every year, and what a teacher fills in for the series they make from this.
    events: [],
    classOptions: [],
    ...CATEGORY_DEFAULTS,
  });

  return { name: TEMPLATE_NAME, created: true };
}

/** Opening the one it finds rather than adding a second: names are unique across event series. */
async function ensureOpenEventSeries(db: Firestore): Promise<EventSeries> {
  const eventSeries = (await db.collection(COLLECTIONS.eventSeries).get()).docs.map((doc) =>
    eventSeriesSchema.parse({ id: doc.id, ...doc.data() }),
  );

  const existing = eventSeries.find(
    (eventSeries) => eventSeries.name === DEFAULT_EVENT_SERIES_NAME && !eventSeries.isArchived,
  );
  if (existing) {
    // Seeding stands in for the invitation link the teacher would otherwise hand out (US-23).
    await db
      .collection(COLLECTIONS.eventSeries)
      .doc(existing.id)
      .update({ isOpenToStudents: true });
    return { ...existing, isOpenToStudents: true };
  }

  // The lists live in this document (US-21), so seeding them is part of creating it.
  const data = {
    name: DEFAULT_EVENT_SERIES_NAME,
    nameKey: normalizeName(DEFAULT_EVENT_SERIES_NAME),
    isTemplate: false,
    isArchived: false,
    isOpenToStudents: true,
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
  if (!ENVIRONMENTS.some((allowed) => allowed === environment)) {
    fail(`Usage: npm run seed:<environment>, where <environment> is ${ENVIRONMENTS.join(", ")}.`);
  }

  const projectId = apphostingValue(environment, "NEXT_PUBLIC_FIREBASE_PROJECT_ID");

  // Its own app rather than @/lib/firebase/admin: that one addresses whichever project the
  // ambient environment names, and this must address the one just named and nothing else.
  const db = getFirestore(initializeApp({ projectId }));

  // A test environment gets what production gets and then some, so the template comes first —
  // both because a school starts from one and because it takes position 0 in the teacher's order.
  const template = await ensureTemplate(db);
  console.log(
    template.created
      ? `Created the template "${template.name}" in ${projectId}.`
      : `${projectId} already has the template "${template.name}".`,
  );

  // Production is done here: it adds, and it never invents a person or deletes one.
  if (!SEEDABLE_ENVIRONMENTS.some((allowed) => allowed === environment)) return;

  // The lists are fields of the event series (US-21), so there is nothing to read until it
  // exists — and creating it is what seeds them, since the application no longer does.
  const eventSeries = await ensureOpenEventSeries(db);

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
      const registration = registrationOf(person, chosen[index], lists);

      const user = userSchema.parse({ id: person.upn, ...person, email: person.upn, role: "student" }); // prettier-ignore
      const record = registrationSchema.parse({
        id: person.upn,
        studentUpn: person.upn,
        // Copied onto the record, which is what a reader takes the name from (US-26).
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.upn,
        // Set by the invitation link a student joins through rather than answered (US-23).
        class: className,
        // Unassigned on purpose: putting students into events is what the board is for (US-12).
        event: null,
        isIncomplete: isRegistrationIncomplete(registration, questionsAsked(eventSeries)),
        ...registration,
      });

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
