/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MasterDataCategoryKey } from "@/lib/master-data/categories";

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
  name: "Winter 2026",
  isActive: true,
  isArchived: false,
  hasRegistrations: false,
  position: 0,
};

const named = (name: string) => ({ id: name, name, position: 0 });

function listOf(names: string[]) {
  return { items: names.map(named), loading: false, error: null };
}

beforeEach(() => {
  vi.clearAllMocks();
  useRegistration.mockReturnValue({ eventSeries, record: null, loading: false, error: null });
  useMasterData.mockImplementation((key: MasterDataCategoryKey) =>
    key === "classes" ? listOf(["3AHME"]) : listOf(["Etwas"]),
  );
  usePrograms.mockReturnValue({ programs: [], loading: false, error: null });
});

function renderView() {
  render(<RegistrationView userId="jane@student.htldornbirn.at" studentName="Jane Doe" />);
}

describe("RegistrationView", () => {
  it("shows the form once an event series and a class are there", () => {
    renderView();

    expect(screen.getByTestId("form")).toBeInTheDocument();
  });

  it("says nothing has been released while no event series is active (US-11)", () => {
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

  /** A class is the one thing asked of every student, so a list without one is unusable. */
  it("says the same while the teacher has set up no class to pick from", () => {
    useMasterData.mockImplementation((key: MasterDataCategoryKey) =>
      key === "classes" ? listOf([]) : listOf(["Etwas"]),
    );

    renderView();

    expect(screen.getByText(REGISTRATION_NOT_OPEN_HINT)).toBeInTheDocument();
    expect(screen.queryByTestId("form")).not.toBeInTheDocument();
  });

  it("waits for the classes before deciding there is nothing to show", () => {
    useMasterData.mockImplementation((key: MasterDataCategoryKey) =>
      key === "classes" ? { items: [], loading: true, error: null } : listOf(["Etwas"]),
    );

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
      key === "classes" ? listOf(["3AHME", "4AHME"]) : listOf(["Etwas"]),
    );

    renderView();

    expect(form).toHaveBeenCalledWith(
      expect.objectContaining({
        eventSeriesName: "Winter 2026",
        studentName: "Jane Doe",
        lists: expect.objectContaining({ classes: ["3AHME", "4AHME"] }),
      }),
    );
  });
});
