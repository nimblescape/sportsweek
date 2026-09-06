/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { event, storedEventSeries } from "@/test/event-series";

const useRegistration = vi.fn();
const form = vi.fn();

vi.mock("@/lib/registration/use-registration", () => ({
  useRegistration: (...args: unknown[]) => useRegistration(...args),
}));

vi.mock("./registration-form", () => ({
  RegistrationForm: (props: unknown) => {
    form(props);
    return <div data-testid="form" />;
  },
}));

const { MyRegistrationView } = await import("./my-registration-view");
const { REGISTRATION_NOT_OPEN_HINT } = await import("@/lib/registration/registration");

const eventSeries = {
  id: "s1",
  ...storedEventSeries({
    name: "Winter 2026",
    isOpenToStudents: true,
    classOptions: ["3AHME"],
    skillLevels: ["Anfänger:in", "Profi"],
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  // A record with a class is the ordinary case: following the link writes one before the student
  // ever reaches this form (US-23).
  useRegistration.mockReturnValue({
    eventSeries,
    record: { class: "3AHME", event: null },
    loading: false,
    error: null,
  });
});

function renderView() {
  render(<MyRegistrationView eventSeriesId="s1" studentUid="uidJane" studentName="Jane Doe" />);
}

describe("MyRegistrationView", () => {
  it("shows the form for the series the path names", () => {
    renderView();

    expect(screen.getByTestId("form")).toBeInTheDocument();
  });

  it("says nothing is released while the series is not open to students (US-19)", () => {
    useRegistration.mockReturnValue({
      eventSeries: { ...eventSeries, isOpenToStudents: false },
      record: null,
      loading: false,
      error: null,
    });

    renderView();

    expect(screen.getByText(REGISTRATION_NOT_OPEN_HINT)).toBeInTheDocument();
    expect(screen.queryByTestId("form")).not.toBeInTheDocument();
  });

  /** Deleted, or never existing: to a student both are the same situation (US-23). */
  it("says the same for a series that is not there at all", () => {
    useRegistration.mockReturnValue({
      eventSeries: null,
      record: null,
      loading: false,
      error: null,
    });

    renderView();

    expect(screen.getByText(REGISTRATION_NOT_OPEN_HINT)).toBeInTheDocument();
    expect(screen.queryByTestId("form")).not.toBeInTheDocument();
  });

  /** Following the link is what writes the registration (US-23), so no record means no joining. */
  it("says the same to a student who has not joined this series", () => {
    useRegistration.mockReturnValue({ eventSeries, record: null, loading: false, error: null });

    renderView();

    expect(screen.getByText(REGISTRATION_NOT_OPEN_HINT)).toBeInTheDocument();
    expect(screen.queryByTestId("form")).not.toBeInTheDocument();
  });

  it("takes the class from the record the joining wrote", () => {
    useRegistration.mockReturnValue({
      eventSeries,
      record: { class: "4AHME", event: null },
      loading: false,
      error: null,
    });

    renderView();

    expect(form).toHaveBeenCalledWith(expect.objectContaining({ studentClass: "4AHME" }));
  });

  it("waits for the read before deciding there is nothing to show", () => {
    useRegistration.mockReturnValue({
      eventSeries: null,
      record: null,
      loading: true,
      error: null,
    });

    renderView();

    expect(screen.queryByText(REGISTRATION_NOT_OPEN_HINT)).not.toBeInTheDocument();
    expect(screen.queryByTestId("form")).not.toBeInTheDocument();
  });

  it("reports a failed read instead of an empty registration", () => {
    useRegistration.mockReturnValue({
      eventSeries: null,
      record: null,
      loading: false,
      error: "Keine Berechtigung",
    });

    renderView();

    expect(screen.getByRole("alert")).toHaveTextContent("Keine Berechtigung");
  });

  it("hands the form the series' own lists, in the order the teacher set", () => {
    renderView();

    expect(form).toHaveBeenCalledWith(
      expect.objectContaining({
        eventSeriesName: "Winter 2026",
        studentName: "Jane Doe",
        lists: expect.objectContaining({ skillLevels: ["Anfänger:in", "Profi"] }),
      }),
    );
  });

  describe("resolved to the student's own event (US-33, US-35)", () => {
    it("still asks for the series' lists where the assigned event names none of its own", () => {
      useRegistration.mockReturnValue({
        eventSeries: { ...eventSeries, events: [event("Woche 1")] },
        record: { class: "3AHME", event: "Woche 1" },
        loading: false,
        error: null,
      });

      renderView();

      expect(form).toHaveBeenCalledWith(
        expect.objectContaining({
          lists: expect.objectContaining({ skillLevels: ["Anfänger:in", "Profi"] }),
        }),
      );
    });

    it("asks for the assigned event's own list in place of the series'", () => {
      useRegistration.mockReturnValue({
        eventSeries: {
          ...eventSeries,
          events: [event("Woche 2", { skillLevels: ["Keine Vorkenntnisse"] })],
        },
        record: { class: "3AHME", event: "Woche 2" },
        loading: false,
        error: null,
      });

      renderView();

      expect(form).toHaveBeenCalledWith(
        expect.objectContaining({
          lists: expect.objectContaining({ skillLevels: ["Keine Vorkenntnisse"] }),
        }),
      );
    });

    it("asks for what the assigned event asks, not what another event of the same series does", () => {
      useRegistration.mockReturnValue({
        eventSeries: {
          ...eventSeries,
          events: [
            event("Woche 1", { skillLevels: ["Keine Vorkenntnisse"] }),
            event("Woche 2", { skillLevels: ["Profi"] }),
          ],
        },
        record: { class: "3AHME", event: "Woche 1" },
        loading: false,
        error: null,
      });

      renderView();

      expect(form).toHaveBeenCalledWith(
        expect.objectContaining({
          lists: expect.objectContaining({ skillLevels: ["Keine Vorkenntnisse"] }),
        }),
      );
    });
  });
});
