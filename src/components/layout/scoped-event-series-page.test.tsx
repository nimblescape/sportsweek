/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asUid } from "@/lib/schemas/common";

const isEventSeriesReachable = vi.fn();

vi.mock("@/lib/event-series/event-series-service", () => ({
  isEventSeriesReachable: (...args: unknown[]) => isEventSeriesReachable(...args),
}));

const { ScopedEventSeriesPage } = await import("./scoped-event-series-page");
const { NO_EVENT_SERIES_HINT } = await import("@/lib/event-series/event-series-state");

const TEACHER = asUid("uidTeacher");

const show = async (eventSeriesId = "s1") =>
  render(
    await ScopedEventSeriesPage({
      eventSeriesId,
      teacherUid: TEACHER,
      children: <p>Registrierungen</p>,
    }),
  );

describe("ScopedEventSeriesPage", () => {
  beforeEach(() => vi.clearAllMocks());

  /** US-42: the same refusal, whichever of the three pages is named and however it is reached. */
  it("renders the page when the series is one the teacher is scoped to", async () => {
    isEventSeriesReachable.mockResolvedValue(true);

    await show();

    expect(screen.getByText("Registrierungen")).toBeInTheDocument();
    expect(isEventSeriesReachable).toHaveBeenCalledWith("s1", TEACHER);
  });

  it("gives the same sentence an unavailable series already gives, for one it is not scoped to", async () => {
    isEventSeriesReachable.mockResolvedValue(false);

    await show();

    expect(screen.queryByText("Registrierungen")).not.toBeInTheDocument();
    expect(screen.getByText(NO_EVENT_SERIES_HINT)).toBeInTheDocument();
  });
});
