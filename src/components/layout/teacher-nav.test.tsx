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

const SUB_ITEMS = [
  "Eventreihen",
  "Klassen",
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

  it("lists the top-level items in order", () => {
    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    const labels = screen
      .getAllByRole("link")
      .concat(screen.getAllByRole("button"))
      .map((element) => element.textContent);

    expect(labels).toEqual(
      expect.arrayContaining(["Registrierungen", "Zuteilungen", "Berichte", "Stammdaten"]),
    );
    expect(labels.indexOf("Registrierungen")).toBeLessThan(labels.indexOf("Zuteilungen"));
    expect(labels.indexOf("Zuteilungen")).toBeLessThan(labels.indexOf("Berichte"));
    expect(labels.indexOf("Berichte")).toBeLessThan(labels.indexOf("Stammdaten"));
  });

  it("gives every top-level item an icon to be recognised by once the labels are gone", () => {
    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    for (const label of ["Berichte", "Zuteilungen", "Registrierungen"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: label }).querySelector("svg")).toBeInTheDocument();
    }
    expect(
      screen.getByRole("link", { name: /stammdaten/i }).querySelector("svg"),
    ).toBeInTheDocument();
  });

  /** The heading has no view of its own, so it opens on the first entry beneath it. */
  it("opens Stammdaten on the event series list, which heads its sub-items", () => {
    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    expect(screen.getByRole("link", { name: /stammdaten/i })).toHaveAttribute(
      "href",
      "/app/event-series",
    );
  });

  it("opens there whether or not a series is selected", () => {
    pathname.mockReturnValue("/app/event-series");
    showing(series("s1"), series("s2"));

    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    expect(screen.getByRole("link", { name: /stammdaten/i })).toHaveAttribute(
      "href",
      "/app/event-series",
    );
  });

  it("points every section at the series the master data is about", () => {
    pathname.mockReturnValue("/app/s2/master-data/classes");
    showing(series("s1"), series("s2"));

    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    expect(screen.getByRole("link", { name: "Berichte" })).toHaveAttribute(
      "href",
      "/app/s2/report",
    );
  });

  /**
   * Every page but the event series list is about one series, so with none at all there is
   * nowhere for the other entries to point (US-20).
   */
  it("offers only the event series list while there is no series to be about", () => {
    pathname.mockReturnValue("/app/event-series");
    showing();

    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    expect(screen.getByRole("link", { name: "Eventreihen" })).toBeInTheDocument();
    for (const label of ["Berichte", "Zuteilungen", "Registrierungen", "Klassen"]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
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

  it("shows the master data sub-items whatever the route is, since they never fold away", () => {
    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    for (const label of SUB_ITEMS) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("leaves them there when Stammdaten is clicked, which folds nothing", async () => {
    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    await userEvent.click(screen.getByRole("link", { name: /stammdaten/i }));

    for (const label of SUB_ITEMS) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("has one sub-item per teacher-maintained category", () => {
    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    expect(SUB_ITEMS).toHaveLength(7);
    for (const label of SUB_ITEMS) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
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

  it("marks the active sub-item", () => {
    pathname.mockReturnValue("/app/s1/master-data/classes");

    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    expect(screen.getByRole("link", { name: "Klassen" })).toHaveAttribute("aria-current", "page");
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

  const openSubItems = () => screen.queryByRole("link", { name: "Klassen" });

  it("offers nothing that folds it", () => {
    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    expect(screen.queryByRole("button", { name: /navigation/i })).not.toBeInTheDocument();
  });

  it.each(["Berichte", "Registrierungen", "Stammdaten"])(
    "stays open when %s is pressed, whether it is where you already are or not",
    async (label) => {
      render(<TeacherNav permissions={[...PERMISSIONS]} />);

      await userEvent.click(screen.getByRole("link", { name: label }));

      expect(openSubItems()).toBeInTheDocument();
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

  it("hides the master data section and its sub-items without the permission", () => {
    render(<TeacherNav permissions={["viewReports"]} />);

    expect(screen.queryByRole("link", { name: "Stammdaten" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Klassen" })).not.toBeInTheDocument();
  });

  /**
   * Stammdaten heads whatever sits beneath it, and two permissions can each put something
   * there. It is shown when either does, and opens on the first of them.
   */
  it("keeps Stammdaten for somebody who may only edit users, holding just the rights page", () => {
    render(<TeacherNav permissions={["editUsers"]} />);

    expect(screen.getByRole("link", { name: "Stammdaten" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Benutzerrechte" })).toHaveAttribute(
      "href",
      "/app/users",
    );
    expect(screen.queryByRole("link", { name: "Klassen" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Eventreihen" })).not.toBeInTheDocument();
  });

  it("keeps the lists for somebody who may only edit master data, without the rights page", () => {
    render(<TeacherNav permissions={["editMasterData"]} />);

    expect(screen.getByRole("link", { name: "Stammdaten" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Eventreihen" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Klassen" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Benutzerrechte" })).not.toBeInTheDocument();
  });

  it("puts the rights page last, after the lists", () => {
    render(<TeacherNav permissions={["editMasterData", "editUsers"]} />);

    const names = linkNames();
    expect(names[names.length - 1]).toBe("Benutzerrechte");
  });

  it("opens Stammdaten on the rights page when that is all there is beneath it", () => {
    render(<TeacherNav permissions={["editUsers"]} />);

    expect(screen.getByRole("link", { name: "Stammdaten" })).toHaveAttribute("href", "/app/users");
  });

  it("shows nothing at all to a teacher holding no permission", () => {
    render(<TeacherNav permissions={[]} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
