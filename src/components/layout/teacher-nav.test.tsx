/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pathname = vi.fn(() => "/app/s1/report");

vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));

// The bar carries it at its foot, and it reaches Firebase, which no test here has cause to start.
vi.mock("@/components/auth/sign-out-button", () => ({
  SignOutButton: () => <button type="button">Abmelden</button>,
}));

const { TeacherNav } = await import("@/components/layout/teacher-nav");
const { NAV_TOGGLE_LABEL } = await import("@/components/layout/brand");

const SUB_ITEMS = [
  "Eventreihen",
  "Klassen",
  "Programme",
  "Leistungsstufen",
  "Zugangskarten",
  "Zustiegsstellen",
  "Verpflegung",
];

describe("TeacherNav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname.mockReturnValue("/app/s1/report");
  });

  it("lists the top-level items in order", () => {
    render(<TeacherNav />);

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
    render(<TeacherNav />);

    for (const label of ["Bericht", "Zuteilung", "\u00dcbersicht"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: label }).querySelector("svg")).toBeInTheDocument();
    }
    expect(
      screen.getByRole("link", { name: /stammdaten/i }).querySelector("svg"),
    ).toBeInTheDocument();
  });

  /** The section has no view of its own, so it opens on the first list the bar offers under it. */
  it("opens the section on its first list when Stammdaten is pressed", () => {
    render(<TeacherNav />);

    expect(screen.getByRole("link", { name: /stammdaten/i })).toHaveAttribute(
      "href",
      "/app/event-series",
    );
  });

  /**
   * Every page but the event series list is about one series, so with none selected there is
   * nowhere for the other entries to point (US-20).
   */
  it("offers only the event series list while nothing is selected", () => {
    pathname.mockReturnValue("/app/event-series");

    render(<TeacherNav />);

    expect(screen.getByRole("link", { name: "Eventreihen" })).toBeInTheDocument();
    for (const label of ["Bericht", "Zuteilung", "\u00dcbersicht", "Klassen"]) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
  });

  /** The list page has no selection of its own, so the layout resolves one for it (Q8). */
  it("points at the remembered series while standing on the unscoped list", () => {
    pathname.mockReturnValue("/app/event-series");

    render(<TeacherNav fallbackEventSeriesId="s7" />);

    expect(screen.getByRole("link", { name: "Bericht" })).toHaveAttribute("href", "/app/s7/report");
  });

  /**
   * The fallback is resolved by a layout above the series id, which does not render again while
   * the teacher moves about below it — so on its own it goes stale the moment they select another.
   */
  it("keeps pointing at the series it was last in after leaving it for the list", () => {
    pathname.mockReturnValue("/app/s1/report");
    const { rerender } = render(<TeacherNav />);

    pathname.mockReturnValue("/app/event-series");
    rerender(<TeacherNav />);

    expect(screen.getByRole("link", { name: "Bericht" })).toHaveAttribute("href", "/app/s1/report");
  });

  it("shows the master data sub-items whatever the route is, since they never fold away", () => {
    render(<TeacherNav />);

    for (const label of SUB_ITEMS) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("leaves them there when Stammdaten is clicked, which folds nothing", async () => {
    render(<TeacherNav />);

    await userEvent.click(screen.getByRole("link", { name: /stammdaten/i }));

    for (const label of SUB_ITEMS) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("has one sub-item per teacher-maintained category", () => {
    render(<TeacherNav />);

    expect(SUB_ITEMS).toHaveLength(7);
    for (const label of SUB_ITEMS) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("marks the active item for assistive technology", () => {
    pathname.mockReturnValue("/app/s1/assignment");

    render(<TeacherNav />);

    expect(screen.getByRole("link", { name: "Zuteilung" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Bericht" })).not.toHaveAttribute("aria-current");
  });

  it("marks the active sub-item", () => {
    pathname.mockReturnValue("/app/s1/master-data/classes");

    render(<TeacherNav />);

    expect(screen.getByRole("link", { name: "Klassen" })).toHaveAttribute("aria-current", "page");
  });
});

/**
 * The logo folds the bar and unfolds it again, and nothing else does. Every other row is
 * somewhere to go, and a row that sometimes goes there and sometimes folds the bar instead
 * cannot be pressed without first knowing which of the two it is about to do.
 */
describe("TeacherNav — collapsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname.mockReturnValue("/app/s1/report");
  });

  const openSubItems = () => screen.queryByRole("link", { name: "Klassen" });
  const logo = () => screen.getByRole("button", { name: NAV_TOGGLE_LABEL });

  it("folds away when the logo is pressed, and comes back when it is pressed again", async () => {
    render(<TeacherNav />);

    await userEvent.click(logo());
    expect(openSubItems()).not.toBeInTheDocument();

    await userEvent.click(logo());
    expect(openSubItems()).toBeInTheDocument();
  });

  it("says which way it is about to go, the mark itself saying nothing", async () => {
    render(<TeacherNav />);

    expect(logo()).toHaveAttribute("aria-expanded", "true");

    await userEvent.click(logo());
    expect(logo()).toHaveAttribute("aria-expanded", "false");
  });

  /** Pressing the page you are already on used to fold the bar, which made every row two rows. */
  it("leaves the bar alone when the page it is already on is pressed", async () => {
    render(<TeacherNav />);

    await userEvent.click(screen.getByRole("link", { name: "Bericht" }));

    expect(openSubItems()).toBeInTheDocument();
  });

  it("keeps every destination reachable by name while collapsed", async () => {
    render(<TeacherNav />);

    await userEvent.click(logo());

    for (const label of ["Bericht", "Zuteilung", "\u00dcbersicht", "Stammdaten"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  // The bar is collapsed because the teacher wants the width, so going somewhere else must not
  // take that decision back.
  it("stays collapsed when another destination is chosen", async () => {
    render(<TeacherNav />);

    await userEvent.click(logo());
    await userEvent.click(screen.getByRole("link", { name: "\u00dcbersicht" }));

    expect(openSubItems()).not.toBeInTheDocument();
  });
});
