/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const useSelectedEventSeries = vi.fn();
vi.mock("@/lib/event-series/use-selected-event-series", () => ({
  useSelectedEventSeries: (...args: unknown[]) => useSelectedEventSeries(...args),
}));

const useTeacherCandidates = vi.fn();
vi.mock("@/lib/users/use-teacher-candidates", () => ({
  useTeacherCandidates: () => useTeacherCandidates(),
}));

const apiRequest = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }));

const { ClassTeachersView, ASSIGNED_LABEL, FILTER_LABEL, NO_CANDIDATES_HINT, NONE_MATCHING_HINT } =
  await import("@/components/master-data/class-teachers-view");

const SERIES = "s1";
const CLASS = "3AHIT";

const ADA = { uid: "uid-of-ada", email: "ada@htldornbirn.at", firstName: "Ada", lastName: "Auer" };
const BOB = {
  uid: "uid-of-bob",
  email: "bob@htldornbirn.at",
  firstName: "Bob",
  lastName: "Berger",
};

function eventSeries(classOptions: { name: string; teacherUids: string[] }[]) {
  useSelectedEventSeries.mockReturnValue({
    eventSeries: { id: SERIES, name: "Wintersportwoche", classOptions },
    loading: false,
    error: null,
  });
}

function candidates(rows: (typeof ADA)[]) {
  useTeacherCandidates.mockReturnValue({ candidates: rows, loading: false, error: null });
}

const tagIn = (label: string) => screen.getByRole("button", { name: label });

beforeEach(() => {
  vi.clearAllMocks();
  apiRequest.mockResolvedValue({ item: { name: CLASS, teacherUids: [] } });
  eventSeries([{ name: CLASS, teacherUids: [] }]);
  candidates([ADA, BOB]);
});

function show() {
  return render(<ClassTeachersView class={CLASS} eventSeriesId={SERIES} />);
}

describe("ClassTeachersView", () => {
  it("names the class as the record on screen", () => {
    show();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(CLASS);
  });

  it("lists every candidate by name", () => {
    show();

    expect(screen.getByText("Auer Ada")).toBeInTheDocument();
    expect(screen.getByText("Berger Bob")).toBeInTheDocument();
  });

  /** Two colleagues can share a surname, and the address is what tells them apart. */
  it("carries the address in the tag's accessible name, not only the visible one", () => {
    show();

    expect(screen.getByRole("button", { name: `Auer Ada (${ADA.email})` })).toBeInTheDocument();
  });

  it("presses the tag of an assigned teacher and leaves the rest unpressed", () => {
    eventSeries([{ name: CLASS, teacherUids: [ADA.uid] }]);
    show();

    expect(tagIn(`Auer Ada (${ADA.email})`)).toHaveAttribute("aria-pressed", "true");
    expect(tagIn(`Berger Bob (${BOB.email})`)).toHaveAttribute("aria-pressed", "false");
  });

  it("assigns a teacher who was not assigned yet", async () => {
    show();

    await userEvent.click(tagIn(`Auer Ada (${ADA.email})`));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        `/api/event-series/${SERIES}/master-data/classes/teachers`,
        { method: "PATCH", body: { class: CLASS, teacherUids: [ADA.uid] } },
      ),
    );
  });

  it("withdraws a teacher who was assigned already", async () => {
    eventSeries([{ name: CLASS, teacherUids: [ADA.uid, BOB.uid] }]);
    show();

    await userEvent.click(tagIn(`Auer Ada (${ADA.email})`));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        `/api/event-series/${SERIES}/master-data/classes/teachers`,
        { method: "PATCH", body: { class: CLASS, teacherUids: [BOB.uid] } },
      ),
    );
  });

  it("offers no add control, there being nobody this screen could create", () => {
    show();

    expect(screen.queryByRole("button", { name: /^Lehrpersonen: Neue/ })).not.toBeInTheDocument();
  });

  it("says so when nobody has signed in yet", () => {
    candidates([]);
    show();

    expect(screen.getByText(NO_CANDIDATES_HINT)).toBeInTheDocument();
  });

  it("reports a refusal without pretending the press landed", async () => {
    apiRequest.mockRejectedValue(new Error("Dafür fehlen dir die Rechte."));
    show();

    await userEvent.click(tagIn(`Auer Ada (${ADA.email})`));

    expect(await screen.findByRole("alert")).toHaveTextContent("Dafür fehlen dir die Rechte.");
  });
});

describe("ClassTeachersView — filtering", () => {
  const nameField = () => screen.getByRole("textbox", { name: `${FILTER_LABEL}: Name` });
  const filterTag = (label: string) =>
    screen.getByRole("button", { name: `${FILTER_LABEL}: ${label}` });

  it("narrows to the name that was typed, matching first name, surname or address", async () => {
    show();

    await userEvent.type(nameField(), "berg");

    expect(screen.queryByText("Auer Ada")).not.toBeInTheDocument();
    expect(screen.getByText("Berger Bob")).toBeInTheDocument();
  });

  it("narrows to the address when that is what was typed", async () => {
    show();

    await userEvent.type(nameField(), "bob@");

    expect(screen.getByText("Berger Bob")).toBeInTheDocument();
    expect(screen.queryByText("Auer Ada")).not.toBeInTheDocument();
  });

  it("narrows to the teachers already assigned when Zugewiesen is pressed", async () => {
    eventSeries([{ name: CLASS, teacherUids: [BOB.uid] }]);
    show();

    await userEvent.click(filterTag(ASSIGNED_LABEL));

    expect(screen.getByText("Berger Bob")).toBeInTheDocument();
    expect(screen.queryByText("Auer Ada")).not.toBeInTheDocument();
  });

  it("says so when the filter matches nobody", async () => {
    show();

    await userEvent.type(nameField(), "zzz");

    expect(screen.getByText(NONE_MATCHING_HINT)).toBeInTheDocument();
  });
});
