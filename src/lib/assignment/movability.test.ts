/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { immovableReason } from "./movability";
import { event, storedEventSeries } from "@/test/event-series";
import { studentRecord } from "@/test/roster-student";

/** "Woche 2" names a program list of its own, so an answer to it came from the event (US-33). */
const series = storedEventSeries({
  events: [event("Woche 1"), event("Woche 2", { programs: [{ name: "Langlauf", requiredEquipment: [] }] })], // prettier-ignore
});

describe("immovableReason", () => {
  it("lets a finished registration with no event yet be assigned", () => {
    expect(immovableReason(series, studentRecord())).toBeNull();
  });

  it("refuses everybody while the series is open to students", () => {
    const open = storedEventSeries({ ...series, isOpenToStudents: true });

    expect(immovableReason(open, studentRecord())).toBe("seriesOpen");
  });

  it("refuses somebody who has not finished answering", () => {
    expect(immovableReason(series, studentRecord({ isIncomplete: true }))).toBe("incomplete");
  });

  /** Unassigning is the move they have left, and it is what keeps nobody stuck in an event. */
  it("still lets an unfinished registration be taken out of its event", () => {
    const assigned = studentRecord({ event: "Woche 1", isIncomplete: true, program: null });

    expect(immovableReason(series, assigned)).toBeNull();
  });

  it("refuses somebody who answered a question only their event asks", () => {
    const answered = studentRecord({ event: "Woche 2", program: "Langlauf" });

    expect(immovableReason(series, answered)).toBe("eventAnswered");
  });

  it("lets somebody move whose answers all came from the series", () => {
    const answered = studentRecord({ event: "Woche 1", program: "Ski" });

    expect(immovableReason(series, answered)).toBeNull();
  });

  it("lets somebody move who has not reached their event's own question yet", () => {
    const unanswered = studentRecord({ event: "Woche 2", program: null });

    expect(immovableReason(series, unanswered)).toBeNull();
  });
});
