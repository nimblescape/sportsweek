/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { NO_ACTIVE_SEASON_HINT, recordIdFor } from "./registration";

describe("recordIdFor", () => {
  it("derives the id from the season and the student", () => {
    expect(recordIdFor("season1", "jane.doe@student.htldornbirn.at")).toBe(
      "season1__jane.doe@student.htldornbirn.at",
    );
  });

  /**
   * The point of deriving it: one student can hold exactly one record per season without anyone
   * having to query for it, because document ids are unique by construction (see unique-name.ts).
   */
  it("gives the same student the same id for the same season", () => {
    expect(recordIdFor("season1", "jane@student.htldornbirn.at")).toBe(
      recordIdFor("season1", "jane@student.htldornbirn.at"),
    );
  });

  it("gives the same student a separate id per season", () => {
    expect(recordIdFor("season1", "jane@student.htldornbirn.at")).not.toBe(
      recordIdFor("season2", "jane@student.htldornbirn.at"),
    );
  });

  it("states the message US-11 asks for when no season is active", () => {
    expect(NO_ACTIVE_SEASON_HINT).toBe("Es ist noch keine Sportveranstaltung freigeschalten.");
  });
});
