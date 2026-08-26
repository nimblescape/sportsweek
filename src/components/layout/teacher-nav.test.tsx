/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pathname = vi.fn(() => "/app/report");

vi.mock("next/navigation", () => ({ usePathname: () => pathname() }));

const { TeacherNav } = await import("@/components/layout/teacher-nav");

const SUB_ITEMS = [
  "Saisonen",
  "Programme",
  "Klassen",
  "Leistungsstufen",
  "Zustiegsstellen",
  "Verpflegung",
  "Saisonkarten",
];

describe("TeacherNav", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname.mockReturnValue("/app/report");
  });

  it("lists the top-level items in order", () => {
    render(<TeacherNav />);

    const labels = screen
      .getAllByRole("link")
      .concat(screen.getAllByRole("button"))
      .map((element) => element.textContent);

    expect(labels).toEqual(expect.arrayContaining(["Bericht", "Zuteilung", "Stammdaten"]));
    expect(labels.indexOf("Bericht")).toBeLessThan(labels.indexOf("Zuteilung"));
  });

  it("keeps the master data sub-items collapsed outside that section", () => {
    render(<TeacherNav />);

    for (const label of SUB_ITEMS) {
      expect(screen.queryByRole("link", { name: label })).not.toBeInTheDocument();
    }
  });

  it("expands the sub-items when Stammdaten is selected", async () => {
    render(<TeacherNav />);

    await userEvent.click(screen.getByRole("button", { name: /stammdaten/i }));

    for (const label of SUB_ITEMS) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("collapses the sub-items again when Stammdaten is deselected", async () => {
    render(<TeacherNav />);
    const toggle = screen.getByRole("button", { name: /stammdaten/i });

    await userEvent.click(toggle);
    await userEvent.click(toggle);

    expect(screen.queryByRole("link", { name: "Saisonen" })).not.toBeInTheDocument();
  });

  it("has one sub-item per teacher-maintained category", async () => {
    render(<TeacherNav />);

    await userEvent.click(screen.getByRole("button", { name: /stammdaten/i }));

    expect(SUB_ITEMS).toHaveLength(7);
    for (const label of SUB_ITEMS) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("starts expanded when the current route is inside master data", () => {
    pathname.mockReturnValue("/app/master-data/classes");

    render(<TeacherNav />);

    expect(screen.getByRole("link", { name: "Klassen" })).toBeInTheDocument();
  });

  it("marks the active item for assistive technology", () => {
    pathname.mockReturnValue("/app/assignment");

    render(<TeacherNav />);

    expect(screen.getByRole("link", { name: "Zuteilung" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Bericht" })).not.toHaveAttribute("aria-current");
  });

  it("marks the active sub-item", () => {
    pathname.mockReturnValue("/app/master-data/classes");

    render(<TeacherNav />);

    expect(screen.getByRole("link", { name: "Klassen" })).toHaveAttribute("aria-current", "page");
  });
});
