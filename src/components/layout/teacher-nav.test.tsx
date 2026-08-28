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
      screen.getByRole("button", { name: /stammdaten/i }).querySelector("svg"),
    ).toBeInTheDocument();
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

    await userEvent.click(screen.getByRole("button", { name: /stammdaten/i }));

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

describe("TeacherNav — collapsing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname.mockReturnValue("/app/s1/report");
  });

  const toggle = () => screen.getByRole("button", { name: /navigation (ein|aus)klappen/i });

  it("starts open, and says which way its control goes", () => {
    render(<TeacherNav />);

    expect(toggle()).toHaveAccessibleName("Navigation einklappen");
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
  });

  /** It is about the bar rather than a place to go, so it sits below everything that is. */
  it("puts its own control below every destination", () => {
    render(<TeacherNav />);

    const last = screen.getByRole("navigation").querySelectorAll("a, button");

    expect(last[last.length - 1]).toBe(toggle());
  });

  it("collapses and opens again", async () => {
    render(<TeacherNav />);

    await userEvent.click(toggle());
    expect(toggle()).toHaveAccessibleName("Navigation ausklappen");
    expect(toggle()).toHaveAttribute("aria-expanded", "false");

    await userEvent.click(toggle());
    expect(toggle()).toHaveAccessibleName("Navigation einklappen");
  });

  it("keeps every destination reachable by name while collapsed", async () => {
    render(<TeacherNav />);

    await userEvent.click(toggle());

    for (const label of ["Bericht", "Zuteilung", "\u00dcbersicht"]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("folds the sub-items away with the bar, since there is no width left to read them in", async () => {
    pathname.mockReturnValue("/app/s1/master-data/classes");
    render(<TeacherNav />);

    await userEvent.click(toggle());

    expect(screen.queryByRole("link", { name: "Klassen" })).not.toBeInTheDocument();
  });

  // The bar is collapsed because the teacher wants the width, so going somewhere must not take
  // that decision back — only asking for something the rail has no room for may.
  it("stays collapsed when a destination is chosen", async () => {
    render(<TeacherNav />);

    await userEvent.click(toggle());
    await userEvent.click(screen.getByRole("link", { name: "\u00dcbersicht" }));

    expect(toggle()).toHaveAccessibleName("Navigation ausklappen");
  });

  it("opens the bar when the sub-items are asked for, there being no width to read them in", async () => {
    render(<TeacherNav />);

    await userEvent.click(toggle());
    await userEvent.click(screen.getByRole("button", { name: /stammdaten/i }));

    expect(toggle()).toHaveAccessibleName("Navigation einklappen");
    expect(screen.getByRole("link", { name: "Klassen" })).toBeInTheDocument();
  });

  it("brings the sub-items back with the bar", async () => {
    render(<TeacherNav />);

    await userEvent.click(toggle());
    await userEvent.click(toggle());

    expect(screen.getByRole("link", { name: "Klassen" })).toBeInTheDocument();
  });
});
