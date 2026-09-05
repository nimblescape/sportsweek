/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { event, storedEventSeries } from "@/test/event-series";
import { resolveEventLists, seriesWideLists } from "./resolution";

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
