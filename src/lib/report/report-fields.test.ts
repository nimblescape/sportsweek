/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { EQUIPMENT_RENTAL_LABEL } from "@/lib/registration/answer-labels";
import { FOOD_OPTION_OTHER } from "@/lib/schemas/master-data";
import type { Registration } from "@/lib/schemas/registration";
import { studentRecord } from "@/test/roster-student";
import { NO_ANSWER, REPORT_FIELD_TAGS, reportFieldsOf } from "./report-fields";

const keys = REPORT_FIELD_TAGS.map((tag) => tag.key);

const EVENT_NAMES = new Map([["event1", "Woche 1"]]);
const context = { eventNames: EVENT_NAMES };

const lineFor = (label: string, record: Registration) => {
  const field = REPORT_FIELD_TAGS.flatMap((tag) => tag.fields).find(
    (candidate) => candidate.label === label,
  );
  if (!field) throw new Error(`No report field labelled ${label}`);
  return field.valueOf(record, context);
};

describe("REPORT_FIELD_TAGS", () => {
  it("offers every field US-13 lists, in the order it lists them", () => {
    expect(keys).toEqual([
      "attendance",
      "event",
      "class",
      "gender",
      "dateOfBirth",
      "contact",
      "program",
      "skillLevel",
      "measurements",
      "rentedEquipment",
      "busPickupPoint",
      "seasonPassOption",
      "food",
      "health",
      "completeness",
    ]);
  });

  it("does not offer the e-mail address, which the master line already carries", () => {
    const labels = REPORT_FIELD_TAGS.flatMap((tag) => tag.fields).map((field) => field.label);

    expect(labels).not.toContain("E-Mail");
  });

  it("keys every field uniquely, since each one renders a detail line of its own", () => {
    const fields = REPORT_FIELD_TAGS.flatMap((tag) => tag.fields).map((field) => field.key);

    expect(new Set(fields).size).toBe(fields.length);
  });
});

describe("reportFieldsOf", () => {
  it("activates nothing while no tag is selected, leaving the master line alone", () => {
    expect(reportFieldsOf([])).toEqual([]);
  });

  it("gives a grouped tag one detail line per field in the group (US-13)", () => {
    expect(reportFieldsOf(["contact"]).map((field) => field.label)).toEqual([
      "Telefonnummer",
      "Notfallkontakt",
      "Beziehung",
      "Telefonnummer des Notfallkontakts",
    ]);
    expect(reportFieldsOf(["measurements"]).map((field) => field.label)).toEqual([
      "Gewicht [kg]",
      "Körpergröße [cm]",
      "Schuhgröße",
    ]);
    expect(reportFieldsOf(["health"]).map((field) => field.label)).toEqual([
      "Krankheiten oder Allergien",
      "Medikamente",
    ]);
  });

  it("keeps the fields in their own order, not in the order the tags were pressed", () => {
    expect(reportFieldsOf(["gender", "attendance"]).map((field) => field.key)).toEqual([
      "attendance",
      "gender",
    ]);
  });

  it("ignores a tag it does not know, so a stale saved selection cannot break the report", () => {
    expect(reportFieldsOf(["nonsense"])).toEqual([]);
  });
});

describe("a field's value", () => {
  it("reads an answer back in the words the form asked it in", () => {
    const record = studentRecord();

    expect(lineFor("Teilnahme", record)).toBe("Ja");
    expect(lineFor("Geschlecht", record)).toBe("Weiblich");
    expect(lineFor("Beziehung", record)).toBe("Mutter");
    expect(lineFor("Medikamente", record)).toBe("Nein");
  });

  it("writes a date the way it is read in German, without leaning on a time zone", () => {
    expect(lineFor("Geburtsdatum", studentRecord({ dateOfBirth: "2008-01-03" }))).toBe(
      "03.01.2008",
    );
  });

  it("names the emergency contact as one person rather than two answers", () => {
    expect(lineFor("Notfallkontakt", studentRecord())).toBe("Maria Muster");
  });

  it("spells out the relationship a student typed in themselves", () => {
    const record = studentRecord({
      emergencyContact: {
        firstName: "Ida",
        lastName: "Muster",
        relationship: "other",
        relationshipOtherText: "Tante",
        phoneNumber: null,
      },
    });

    expect(lineFor("Beziehung", record)).toBe("Tante");
  });

  it("carries the free text of the food option, which is the answer itself (US-9)", () => {
    const record = studentRecord({ foodOption: FOOD_OPTION_OTHER, foodOtherText: "Laktose" });

    expect(lineFor("Verpflegung", record)).toBe("Sonstiges: Laktose");
  });

  it("lists the rented equipment, and says so when nothing is rented", () => {
    expect(
      lineFor(EQUIPMENT_RENTAL_LABEL, studentRecord({ rentedEquipment: ["Ski", "Helm"] })),
    ).toBe("Ski, Helm");
    expect(lineFor(EQUIPMENT_RENTAL_LABEL, studentRecord())).toBe("Nein");
  });

  it("leaves an unanswered field to the placeholder rather than inventing one", () => {
    expect(lineFor("Klasse", studentRecord({ class: null }))).toBeNull();
    expect(lineFor("Geburtsdatum", studentRecord({ dateOfBirth: null }))).toBeNull();
    expect(lineFor("Krankheiten oder Allergien", studentRecord({ healthNotes: null }))).toBeNull();
    expect(NO_ANSWER).toBe("keine Angabe");
  });

  it("states whether the registration is still missing answers (US-11, US-13)", () => {
    expect(lineFor("Registrierung", studentRecord())).toBe("Vollständig");
    expect(lineFor("Registrierung", studentRecord({ isIncomplete: true }))).toBe("Unvollständig");
  });

  it("names the event a student is assigned to, since the record points at it by id", () => {
    expect(lineFor("Event", studentRecord({ eventId: "event1" }))).toBe("Woche 1");
  });

  it("leaves the event unanswered while nobody has assigned them a week yet", () => {
    expect(lineFor("Event", studentRecord({ eventId: null }))).toBeNull();
  });

  it("leaves it unanswered too when the event it points at is gone", () => {
    expect(lineFor("Event", studentRecord({ eventId: "deleted" }))).toBeNull();
  });
});
