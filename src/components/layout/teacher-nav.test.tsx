/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pathname = vi.fn(() => "/app/s1/report");
const eventSeries = vi.fn<() => { eventSeries: unknown[] }>(() => ({ eventSeries: [] }));

vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));
vi.mock("@/lib/event-series/use-event-series", () => ({ useEventSeries: () => eventSeries() }));

// The bar carries it at its foot, and it reaches Firebase, which no test here has cause to start.
vi.mock("@/components/auth/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Abmelden</button>,
}));

import { PERMISSIONS } from "@/lib/auth/permissions";

const { TeacherNav } = await import("@/components/layout/teacher-nav");

const NAV_ITEMS = ["Registrierungen", "Zuteilungen", "Berichte", "Stammdaten", "Benutzerrechte"];

/** The categories left the bar for the tag row on the record they belong to (US-33). */
const CATEGORY_LABELS = [
  "Klassen",
  "Events",
  "Programme",
  "Leistungsstufen",
  "Zugangskarten",
  "Zustiegsstellen",
  "Verpflegung",
];

const series = (id: string, overrides = {}) => ({
  id,
  isArchived: false,
  ...overrides,
});

const showing = (...list: ReturnType<typeof series>[]) =>
  eventSeries.mockReturnValue({ eventSeries: list });

describe("TeacherNav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname.mockReturnValue("/app/s1/report");
    showing(series("s1"), series("s2"), series("s7"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("says which build this is, under the sign-out at the foot of the bar", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1.2.3");
    vi.stubEnv("NEXT_PUBLIC_COMMIT_HASH", "a1b2c3d");

    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    const signOut = screen.getByRole("button", { name: "Abmelden" });
    const stamp = screen.getByText("v1.2.3 · a1b2c3d");

    expect(signOut.compareDocumentPosition(stamp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("lists the five entries in order", () => {
    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(NAV_ITEMS);
  });

  /** Every category is reached from the record it belongs to, so none of them is in the bar. */
  it("names no category, so the bar can never claim a scope the page is not in", () => {
    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    for (const label of CATEGORY_LABELS) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
  });

  it("gives every entry an icon to be recognised by once the labels are gone", () => {
    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    for (const label of NAV_ITEMS) {
      expect(screen.getByRole("link", { name: label }).querySelector("svg")).toBeInTheDocument();
    }
  });

  it("opens Stammdaten on the event series list, the root of the hierarchy", () => {
    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    expect(screen.getByRole("link", { name: "Stammdaten" })).toHaveAttribute(
      "href",
      "/app/event-series",
    );
  });

  it("opens there whether or not a series is selected", () => {
    pathname.mockReturnValue("/app/event-series");
    showing(series("s1"), series("s2"));

    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    expect(screen.getByRole("link", { name: "Stammdaten" })).toHaveAttribute(
      "href",
      "/app/event-series",
    );
  });

  it("points every scoped entry at the series the URL names", () => {
    pathname.mockReturnValue("/app/s2/registrations");
    showing(series("s1"), series("s2"));

    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    expect(screen.getByRole("link", { name: "Berichte" })).toHaveAttribute(
      "href",
      "/app/s2/report",
    );
  });

  /**
   * Three of the five are about one series (US-20), so with none at all they have nowhere to
   * point. The other two are about the school and stay.
   */
  it("keeps the unscoped entries while there is no series to be about", () => {
    pathname.mockReturnValue("/app/event-series");
    showing();

    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Stammdaten",
      "Benutzerrechte",
    ]);
  });

  /** The list page has no selection of its own, so the layout resolves one for it (Q8). */
  it("points at the remembered series while standing on the unscoped list", () => {
    pathname.mockReturnValue("/app/event-series");

    render(<TeacherNav fallbackEventSeriesId="s7" permissions={[...PERMISSIONS]} />);

    expect(screen.getByRole("link", { name: "Berichte" })).toHaveAttribute(
      "href",
      "/app/s7/report",
    );
  });

  /**
   * The fallback is resolved by a layout above the series id, which does not render again while
   * the teacher moves about below it — so on its own it goes stale the moment they select another.
   */
  it("keeps pointing at the series it was last in after leaving it for the list", () => {
    pathname.mockReturnValue("/app/s1/report");
    const { rerender } = render(<TeacherNav permissions={[...PERMISSIONS]} />);

    pathname.mockReturnValue("/app/event-series");
    rerender(<TeacherNav permissions={[...PERMISSIONS]} />);

    expect(screen.getByRole("link", { name: "Berichte" })).toHaveAttribute(
      "href",
      "/app/s1/report",
    );
  });

  it("marks the active item for assistive technology", () => {
    pathname.mockReturnValue("/app/s1/assignment");

    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    expect(screen.getByRole("link", { name: "Zuteilungen" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Berichte" })).not.toHaveAttribute("aria-current");
  });

  it.each([
    "/app/event-series",
    "/app/event-series/s1",
    "/app/event-series/s1/classes",
    "/app/event-series/s1/programs",
  ])("marks Stammdaten at every depth beneath it, such as %s", (path) => {
    pathname.mockReturnValue(path);

    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    expect(screen.getByRole("link", { name: "Stammdaten" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

/**
 * The bar does not fold. It had a control on the logo and, before that, on whichever row you
 * were already standing on; both are gone until the width is worth the second state.
 */
describe("TeacherNav — always open", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname.mockReturnValue("/app/s1/report");
    showing(series("s1"), series("s2"), series("s7"));
  });

  const stammdaten = () => screen.queryByRole("link", { name: "Stammdaten" });

  it("offers nothing that folds it", () => {
    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    expect(screen.queryByRole("button", { name: /navigation/i })).not.toBeInTheDocument();
  });

  it.each(["Berichte", "Registrierungen", "Stammdaten"])(
    "stays open when %s is pressed, whether it is where you already are or not",
    async (label) => {
      render(<TeacherNav permissions={[...PERMISSIONS]} />);

      await userEvent.click(screen.getByRole("link", { name: label }));

      expect(stammdaten()).toBeInTheDocument();
    },
  );
});

/**
 * A bar that offered a page the teacher may not open would send them to the landing route and
 * back again. It is built from what their permissions reach instead (US-2).
 */
describe("TeacherNav — what the permissions reach", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname.mockReturnValue("/app/s1/report");
    showing(series("s1"));
  });

  const linkNames = () => screen.queryAllByRole("link").map((link) => link.textContent);

  it("shows nothing to a teacher holding no permission", () => {
    render(<TeacherNav permissions={[]} />);

    expect(linkNames()).toEqual([]);
  });

  it("shows only the assignment to somebody who may only plan", () => {
    render(<TeacherNav permissions={["editAssignments"]} />);

    expect(linkNames()).toEqual(["Zuteilungen"]);
  });

  /** Either of the two that exclude each other opens the report page, and nothing else. */
  it("shows only the report to somebody who may view reports", () => {
    render(<TeacherNav permissions={["viewReports"]} />);

    expect(linkNames()).toEqual(["Berichte"]);
  });

  it("shows the same to somebody who may edit them", () => {
    render(<TeacherNav permissions={["editReports"]} />);

    expect(linkNames()).toEqual(["Berichte"]);
  });

  it("shows the overview to whoever may edit registrations", () => {
    render(<TeacherNav permissions={["editRegistrations"]} />);

    expect(linkNames()).toEqual(["Registrierungen"]);
  });

  it("hides Stammdaten without the permission that maintains it", () => {
    render(<TeacherNav permissions={["viewReports"]} />);

    expect(screen.queryByRole("link", { name: "Stammdaten" })).not.toBeInTheDocument();
  });

  /** The two unscoped entries stand on their own permission; neither implies the other. */
  it("shows only the rights page to somebody who may only edit users", () => {
    render(<TeacherNav permissions={["editUsers"]} />);

    expect(linkNames()).toEqual(["Benutzerrechte"]);
    expect(screen.getByRole("link", { name: "Benutzerrechte" })).toHaveAttribute(
      "href",
      "/app/users",
    );
  });

  it("shows only Stammdaten to somebody who may only edit master data", () => {
    render(<TeacherNav permissions={["editMasterData"]} />);

    expect(linkNames()).toEqual(["Stammdaten"]);
  });

  it("puts the rights page last, after Stammdaten", () => {
    render(<TeacherNav permissions={["editMasterData", "editUsers"]} />);

    expect(linkNames()).toEqual(["Stammdaten", "Benutzerrechte"]);
  });

  it("shows nothing at all to a teacher holding no permission", () => {
    render(<TeacherNav permissions={[]} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
