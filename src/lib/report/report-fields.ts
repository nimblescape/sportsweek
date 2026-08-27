/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */

import { FOOD_OPTION_OTHER, FOOD_OPTION_OTHER_LABEL } from "@/lib/schemas/master-data";
import type { StudentMasterData } from "@/lib/schemas/student-master-data";
import {
  COMPLETENESS_LABELS,
  GENDER_LABELS,
  RELATIONSHIP_LABELS,
  yesNo,
} from "@/lib/student-master-data/answer-labels";

/** A field a student has not answered is said to be unanswered, never left as a blank line. */
export const NO_ANSWER = "keine Angabe";

/**
 * What a field needs beyond the registration itself. Only the event does: a record points at
 * one by id, because unlike the teacher-maintained lists it is a genuine reference (US-11).
 */
export type ReportFieldContext = { eventNames: ReadonlyMap<string, string> };

export type ReportField = {
  key: string;
  label: string;
  /** Null is "not answered"; the placeholder is the reader's business, not the field's. */
  valueOf: (record: StudentMasterData, context: ReportFieldContext) => string | null;
};

/**
 * One tag in the fields tag list. Most stand for a single detail line; contact data, body
 * measurements and health each stand for a group, which US-13 asks to be activated together
 * while still producing a detail line per field.
 */
export type ReportFieldTag = {
  key: string;
  label: string;
  fields: readonly ReportField[];
};

/** Reformatted rather than passed through `Date`, whose ISO parsing is UTC and shifts the day. */
function germanDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

function contactName(record: StudentMasterData): string | null {
  const { firstName, lastName } = record.emergencyContact;
  const name = [firstName, lastName].filter((part) => part !== null).join(" ");
  return name === "" ? null : name;
}

function relationshipOf(record: StudentMasterData): string | null {
  const { relationship, relationshipOtherText } = record.emergencyContact;
  if (relationship === null) return null;
  // What the student typed is the answer; "Sonstiges" only stands in until they have typed it.
  if (relationship === "other") return relationshipOtherText ?? RELATIONSHIP_LABELS.other;
  return RELATIONSHIP_LABELS[relationship];
}

function foodOf(record: StudentMasterData): string | null {
  if (record.foodOption === null) return null;
  if (record.foodOption !== FOOD_OPTION_OTHER) return record.foodOption;

  const text = record.foodOtherText;
  return text === null ? FOOD_OPTION_OTHER_LABEL : `${FOOD_OPTION_OTHER_LABEL}: ${text}`;
}

const field = (key: string, label: string, valueOf: ReportField["valueOf"]): ReportField => ({
  key,
  label,
  valueOf,
});

/** A tag standing for a single field, which is what all but the three groups below are. */
const answer = (key: string, label: string, valueOf: ReportField["valueOf"]): ReportFieldTag => ({
  key,
  label,
  fields: [field(key, label, valueOf)],
});

/**
 * The data fields a teacher can activate, in the order US-13 lists them. Every one of them is a
 * detail line under the master line of the student it belongs to; the first name, the last name
 * and the e-mail address are not here, because the master line always carries them.
 */
export const REPORT_FIELD_TAGS: readonly ReportFieldTag[] = [
  answer("attendance", "Teilnahme", (record) => yesNo(record.isAttendingSportsWeek)),
  // An event a teacher has since deleted reads as unanswered, which is what the student is.
  answer("event", "Event", (record, { eventNames }) =>
    record.eventId === null ? null : (eventNames.get(record.eventId) ?? null),
  ),
  answer("class", "Klasse", (record) => record.class),
  answer("gender", "Geschlecht", (record) =>
    record.gender === null ? null : GENDER_LABELS[record.gender],
  ),
  answer("dateOfBirth", "Geburtsdatum", (record) =>
    record.dateOfBirth === null ? null : germanDate(record.dateOfBirth),
  ),
  {
    key: "contact",
    label: "Kontaktdaten",
    fields: [
      field("phoneNumber", "Telefonnummer", (record) => record.phoneNumber),
      field("emergencyContact", "Notfallkontakt", contactName),
      field("emergencyRelationship", "Beziehung", relationshipOf),
      field(
        "emergencyPhoneNumber",
        "Telefonnummer des Notfallkontakts",
        (record) => record.emergencyContact.phoneNumber,
      ),
    ],
  },
  answer("program", "Programm", (record) => record.program),
  answer("skillLevel", "Leistungsstufe", (record) => record.skillLevel),
  {
    key: "measurements",
    label: "Körpermaße",
    fields: [
      field("weightKg", "Gewicht [kg]", (record) => record.weightKg?.toString() ?? null),
      field("heightCm", "Körpergröße [cm]", (record) => record.heightCm?.toString() ?? null),
      field("shoeSize", "Schuhgröße", (record) => record.shoeSize),
    ],
  },
  answer("rentedEquipment", "Ausrüstung zum Ausleihen", (record) =>
    // Nothing rented is an answer in itself, not a gap: the student was asked and said no.
    record.rentedEquipment.length > 0 ? record.rentedEquipment.join(", ") : yesNo(false),
  ),
  answer("busPickupPoint", "Zustiegsstelle", (record) => record.busPickupPoint),
  answer("seasonPassOption", "Saisonkarte", (record) => record.seasonPassOption),
  answer("food", "Verpflegung", foodOf),
  {
    key: "health",
    label: "Gesundheit",
    fields: [
      field("healthNotes", "Krankheiten oder Allergien", (record) => record.healthNotes),
      field("hasMedication", "Medikamente", (record) =>
        record.hasMedication === null ? null : yesNo(record.hasMedication),
      ),
    ],
  },
  // Last, because it is a fact about the registration rather than one of the answers in it.
  answer("completeness", "Registrierung", (record) =>
    record.isIncomplete ? COMPLETENESS_LABELS.incomplete : COMPLETENESS_LABELS.complete,
  ),
];

/**
 * The detail lines a selection of tags produces, in the fields' own order rather than in the
 * order the tags happened to be pressed — and skipping a tag nobody offers any more, so a saved
 * selection from an older release still reads.
 */
export function reportFieldsOf(selected: readonly string[]): ReportField[] {
  const picked = new Set(selected);
  return REPORT_FIELD_TAGS.filter((tag) => picked.has(tag.key)).flatMap((tag) => tag.fields);
}
