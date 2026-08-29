/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

  it("lists the top-level items in order", () => {
    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    const labels = screen
      .getAllByRole("link")
      .concat(screen.getAllByRole("button"))
      .map((element) => element.textContent);

    expect(labels).toEqual(
      expect.arrayContaining(["\u00dcbersicht", "Zuteilung", "Bericht", "Stammdaten"]),
    );
    expect(labels.indexOf("\u00dcbersicht")).toBeLessThan(labels.indexOf("Zuteilung"));
    expect(labels.indexOf("Zuteilung")).toBeLessThan(labels.indexOf("Bericht"));
    expect(labels.indexOf("Bericht")).toBeLessThan(labels.indexOf("Stammdaten"));
  });

  it("gives every top-level item an icon to be recognised by once the labels are gone", () => {
    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    for (const label of ["Bericht", "Zuteilung", "\u00dcbersicht"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: label }).querySelector("svg")).toBeInTheDocument();
    }
    expect(
      screen.getByRole("link", { name: /stammdaten/i }).querySelector("svg"),
    ).toBeInTheDocument();
  });

  /** Moving into the section is not a change of series, so it opens on the one already selected. */
  it("opens Stammdaten on the selected series, at its first list", () => {
    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    expect(screen.getByRole("link", { name: /stammdaten/i })).toHaveAttribute(
      "href",
      "/app/s1/master-data/events",
    );
  });

  /** Every page can be about every series, so one selection answers for the whole bar. */
  it("opens Stammdaten on the first series when nothing is selected", () => {
    pathname.mockReturnValue("/app/event-series");
    showing(series("s1"), series("s2"));

    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    expect(screen.getByRole("link", { name: /stammdaten/i })).toHaveAttribute(
      "href",
      "/app/s1/master-data/events",
    );
  });

  it("points every section at the series the master data is about", () => {
    pathname.mockReturnValue("/app/s2/master-data/classes");
    showing(series("s1"), series("s2"));

    render(<TeacherNav permissions={[...PERMISSIONS]} />);

    expect(screen.getByRole("link", { name: "Bericht" })).toHaveAttribute("href", "/app/s2/report");
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
    for (const label of ["Bericht", "Zuteilung", "\u00dcbersicht", "Klassen"]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
  });

  /** The list page has no selection of its own, so the layout resolves one for it (Q8). */
  it("points at the remembered series while standing on the unscoped list", () => {
    pathname.mockReturnValue("/app/event-series");

    render(<TeacherNav fallbackEventSeriesId="s7" permissions={[...PERMISSIONS]} />);

    expect(screen.getByRole("link", { name: "Bericht" })).toHaveAttribute("href", "/app/s7/report");
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

    expect(screen.getByRole("link", { name: "Bericht" })).toHaveAttribute("href", "/app/s1/report");
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

    expect(screen.getByRole("link", { name: "Zuteilung" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Bericht" })).not.toHaveAttribute("aria-current");
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

  it.each(["Bericht", "\u00dcbersicht", "Stammdaten"])(
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

    expect(linkNames()).toEqual(["Zuteilung"]);
  });

  /** One permission carries both report pages, and neither appears without it. */
  it("shows both report pages to somebody who may view them", () => {
    render(<TeacherNav permissions={["viewReports"]} />);

    expect(linkNames()).toEqual(["\u00dcbersicht", "Bericht"]);
  });

  it("hides the master data section and its sub-items without the permission", () => {
    render(<TeacherNav permissions={["viewReports"]} />);

    expect(screen.queryByRole("link", { name: "Stammdaten" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Klassen" })).not.toBeInTheDocument();
  });

  it("offers the rights page only to somebody who may edit users", () => {
    render(<TeacherNav permissions={["editUsers"]} />);

    expect(screen.getByRole("link", { name: "Benutzerrechte" })).toHaveAttribute(
      "href",
      "/app/users",
    );
  });

  it("does not offer it to anybody else", () => {
    render(<TeacherNav permissions={["editMasterData"]} />);

    expect(screen.queryByRole("link", { name: "Benutzerrechte" })).not.toBeInTheDocument();
  });
});
