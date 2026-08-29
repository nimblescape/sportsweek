/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MasterDataCategoryKey } from "@/lib/master-data/categories";
import { storedEventSeries } from "@/test/event-series";

const useRegistration = vi.fn();
const useMasterData = vi.fn();
const usePrograms = vi.fn();
const form = vi.fn();

vi.mock("@/lib/registration/use-registration", () => ({
  useRegistration: (...args: unknown[]) => useRegistration(...args),
}));

vi.mock("@/lib/master-data/use-master-data", () => ({
  useMasterData: (key: MasterDataCategoryKey) => useMasterData(key),
  usePrograms: () => usePrograms(),
}));

vi.mock("./registration-form", () => ({
  RegistrationForm: (props: unknown) => {
    form(props);
    return <div data-testid="form" />;
  },
}));

const { RegistrationView } = await import("./registration-view");
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

function listOf(names: string[]) {
  return { items: names, loading: false, error: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  // A record with a class is the ordinary case: following the link writes one before the student
  // ever reaches this form (US-23).
  useRegistration.mockReturnValue({
    eventSeries,
    record: { class: "3AHME" },
    loading: false,
    error: null,
  });
  useMasterData.mockImplementation(() => listOf(["Etwas"]));
  usePrograms.mockReturnValue({ programs: [], loading: false, error: null });
});

function renderView() {
  render(
    <RegistrationView
      eventSeriesId="s1"
      studentUpn="jane@student.htldornbirn.at"
      studentName="Jane Doe"
    />,
  );
}

describe("RegistrationView", () => {
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
      record: { class: "4AHME" },
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

  it("hands the form the lists in the order the teacher set", () => {
    useMasterData.mockImplementation((key: MasterDataCategoryKey) =>
      key === "skill-levels" ? listOf(["Anfänger:in", "Profi"]) : listOf(["Etwas"]),
    );

    renderView();

    expect(form).toHaveBeenCalledWith(
      expect.objectContaining({
        eventSeriesName: "Winter 2026",
        studentName: "Jane Doe",
        lists: expect.objectContaining({ skillLevels: ["Anfänger:in", "Profi"] }),
      }),
    );
  });
});
