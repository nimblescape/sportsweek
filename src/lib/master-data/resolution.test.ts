/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { event, storedEventSeries } from "@/test/event-series";
import {
  questionsFor,
  registersInTwoSteps,
  resolveEventLists,
  seriesWideLists,
} from "./resolution";

/**
 * Two steps exist because a question an event answers differently cannot be put before anybody
 * knows which event the student is in (US-36). Any of the five carries that problem, so the
 * condition is the condition itself rather than one instance of it.
 */
describe("registersInTwoSteps", () => {
  it("registers in one step where no event names a list of its own", () => {
    const eventSeries = storedEventSeries({
      programs: [{ name: "Ski", requiredEquipment: [] }],
      events: [event("Woche 1"), event("Woche 2")],
    });

    expect(registersInTwoSteps(eventSeries)).toBe(false);
  });

  it("registers in one step where there is no event at all", () => {
    expect(registersInTwoSteps(storedEventSeries({ events: [] }))).toBe(false);
  });

  it("registers in two steps as soon as one event names one list", () => {
    const eventSeries = storedEventSeries({
      events: [event("Woche 1"), event("Woche 2", { seasonPassOptions: ["Arlberg"] })],
    });

    expect(registersInTwoSteps(eventSeries)).toBe(true);
  });

  it.each(["programs", "skillLevels", "seasonPassOptions", "busPickupPoints", "foodOptions"])(
    "counts %s, not the programs alone",
    (field) => {
      const own = field === "programs" ? [{ name: "Ski", requiredEquipment: [] }] : ["Irgendetwas"];
      const eventSeries = storedEventSeries({ events: [event("Woche 1", { [field]: own })] });

      expect(registersInTwoSteps(eventSeries)).toBe(true);
    },
  );
});

describe("questionsFor", () => {
  const lists = {
    classOptions: ["5AHIF"],
    programs: [{ name: "Ski", requiredEquipment: [] }],
    skillLevels: ["Profi"],
    seasonPassOptions: ["Montafon"],
    busPickupPoints: ["Dornbirn"],
    foodOptions: ["Vegetarisch"],
  };

  it("asks everything the series offers in a one-step series", () => {
    const eventSeries = storedEventSeries({ ...lists, events: [event("Woche 1")] });

    expect([...questionsFor(eventSeries, null)].sort()).toEqual([
      "busPickupPoint",
      "class",
      "event",
      "foodOption",
      "program",
      "seasonPassOption",
      "skillLevel",
    ]);
  });

  /** Step one asks nothing an event could answer differently, since nobody knows which yet. */
  it("holds back the event's own questions until the student has an event", () => {
    const eventSeries = storedEventSeries({
      ...lists,
      events: [event("Woche 2", { seasonPassOptions: ["Arlberg"] })],
    });

    expect([...questionsFor(eventSeries, null)].sort()).toEqual(["class", "event"]);
  });

  it("asks them once the student is assigned to an event", () => {
    const eventSeries = storedEventSeries({
      ...lists,
      events: [event("Woche 2", { seasonPassOptions: ["Arlberg"] })],
    });

    expect([...questionsFor(eventSeries, "Woche 2")].sort()).toEqual([
      "busPickupPoint",
      "class",
      "event",
      "foodOption",
      "program",
      "seasonPassOption",
      "skillLevel",
    ]);
  });

  /** An empty list is still a question nobody is asked, whichever step it would have been in. */
  it("leaves out a question no list stands behind", () => {
    const eventSeries = storedEventSeries({
      ...lists,
      skillLevels: [],
      events: [event("Woche 1")],
    });

    expect(questionsFor(eventSeries, null).has("skillLevel")).toBe(false);
  });
});

describe("resolveEventLists", () => {
  it("answers the series' own lists where no event is named", () => {
    const eventSeries = storedEventSeries({ skillLevels: ["Fortgeschritten"] });

    const resolved = resolveEventLists(eventSeries, null);

    expect(resolved.skillLevels).toEqual(["Fortgeschritten"]);
  });

  it("answers the series' own lists where the event names none of its own", () => {
    const eventSeries = storedEventSeries({
      skillLevels: ["Fortgeschritten"],
      events: [event("Woche 1")],
    });

    const resolved = resolveEventLists(eventSeries, "Woche 1");

    expect(resolved.skillLevels).toEqual(["Fortgeschritten"]);
  });

  it("answers the event's own list where it names one, in place of the series'", () => {
    const eventSeries = storedEventSeries({
      skillLevels: ["Fortgeschritten"],
      events: [event("Woche 2", { skillLevels: ["Keine Vorkenntnisse"] })],
    });

    const resolved = resolveEventLists(eventSeries, "Woche 2");

    expect(resolved.skillLevels).toEqual(["Keine Vorkenntnisse"]);
  });

  it("resolves every one of the five overridable lists independently", () => {
    const eventSeries = storedEventSeries({
      programs: [{ name: "Ski", requiredEquipment: [] }],
      skillLevels: ["Fortgeschritten"],
      seasonPassOptions: ["Montafon"],
      busPickupPoints: ["Dornbirn"],
      foodOptions: ["Vegetarisch"],
      events: [
        event("Woche 2", {
          programs: [{ name: "Snowboard", requiredEquipment: [] }],
          seasonPassOptions: ["Arlberg"],
        }),
      ],
    });

    const resolved = resolveEventLists(eventSeries, "Woche 2");

    expect(resolved.programs).toEqual([{ name: "Snowboard", requiredEquipment: [] }]);
    expect(resolved.seasonPassOptions).toEqual(["Arlberg"]);
    // Named none of its own, so these fall back to the series'.
    expect(resolved.skillLevels).toEqual(["Fortgeschritten"]);
    expect(resolved.busPickupPoints).toEqual(["Dornbirn"]);
    expect(resolved.foodOptions).toEqual(["Vegetarisch"]);
  });

  it("leaves classes and events themselves alone, since neither is per event", () => {
    const eventSeries = storedEventSeries({
      classOptions: ["2aWI"],
      events: [event("Woche 1")],
    });

    const resolved = resolveEventLists(eventSeries, "Woche 1");

    expect(resolved.classOptions).toEqual(["2aWI"]);
    expect(resolved.events).toEqual(eventSeries.events);
  });

  it("falls back to the series where the named event does not exist", () => {
    const eventSeries = storedEventSeries({ skillLevels: ["Fortgeschritten"] });

    const resolved = resolveEventLists(eventSeries, "Woche unbekannt");

    expect(resolved.skillLevels).toEqual(["Fortgeschritten"]);
  });

  it("matches the event by name case- and whitespace-insensitively", () => {
    const eventSeries = storedEventSeries({
      events: [event("Woche 2", { skillLevels: ["Keine Vorkenntnisse"] })],
    });

    const resolved = resolveEventLists(eventSeries, " woche 2 ");

    expect(resolved.skillLevels).toEqual(["Keine Vorkenntnisse"]);
  });
});

describe("seriesWideLists", () => {
  it("answers the series' own list where no event names one of its own", () => {
    const eventSeries = storedEventSeries({ skillLevels: ["Fortgeschritten"] });

    expect(seriesWideLists(eventSeries).skillLevels).toEqual(["Fortgeschritten"]);
  });

  it("adds what an event names, so a value only an event offers is still recognised", () => {
    const eventSeries = storedEventSeries({
      skillLevels: [],
      events: [event("Woche 2", { skillLevels: ["Keine Vorkenntnisse"] })],
    });

    expect(seriesWideLists(eventSeries).skillLevels).toEqual(["Keine Vorkenntnisse"]);
  });

  it("combines the series' own entries with every event's, series' first", () => {
    const eventSeries = storedEventSeries({
      seasonPassOptions: ["Montafon"],
      events: [
        event("Woche 2", { seasonPassOptions: ["Arlberg"] }),
        event("Woche 3", { seasonPassOptions: ["Silvretta"] }),
      ],
    });

    expect(seriesWideLists(eventSeries).seasonPassOptions).toEqual([
      "Montafon",
      "Arlberg",
      "Silvretta",
    ]);
  });

  it("counts the same name once, however many places name it", () => {
    const eventSeries = storedEventSeries({
      seasonPassOptions: ["Montafon"],
      events: [event("Woche 2", { seasonPassOptions: ["montafon", " Montafon "] })],
    });

    expect(seriesWideLists(eventSeries).seasonPassOptions).toEqual(["Montafon"]);
  });

  it("combines programs by name, keeping the first spelling seen", () => {
    const eventSeries = storedEventSeries({
      programs: [{ name: "Ski", requiredEquipment: [] }],
      events: [event("Woche 2", { programs: [{ name: "Snowboard", requiredEquipment: [] }] })],
    });

    expect(seriesWideLists(eventSeries).programs).toEqual([
      { name: "Ski", requiredEquipment: [] },
      { name: "Snowboard", requiredEquipment: [] },
    ]);
  });

  it("leaves classes and events themselves alone", () => {
    const eventSeries = storedEventSeries({ classOptions: ["2aWI"] });

    expect(seriesWideLists(eventSeries).classOptions).toEqual(["2aWI"]);
  });
});
