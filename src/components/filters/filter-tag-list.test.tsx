/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  EMPTY_FILTER,
  filterGroups,
  toggleTag,
  type StudentFilter,
} from "@/lib/filters/student-filter";
import { FilterTagList } from "./filter-tag-list";

const GROUPS = filterGroups({
  classes: ["5AHIF", "5BHIF"],
  programs: [{ name: "Ski" }],
  skillLevels: ["Fortgeschritten"],
});

function setup(value: StudentFilter = EMPTY_FILTER) {
  const onChange = vi.fn();
  render(
    <FilterTagList label="Nicht zugeteilt" groups={GROUPS} value={value} onChange={onChange} />,
  );
  return onChange;
}

const tag = (name: string) => screen.getByRole("button", { name });

describe("FilterTagList", () => {
  it("puts 'Alle' first, then the categories in the order US-12 gives", () => {
    setup();

    const names = screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"));

    expect(names).toEqual([
      "Alle",
      "Klasse: 5AHIF",
      "Klasse: 5BHIF",
      "Geschlecht: Männlich",
      "Geschlecht: Weiblich",
      "Programm: Ski",
      "Leistungsstufe: Fortgeschritten",
    ]);
  });

  it("selects a tag without touching another category", async () => {
    const onChange = setup(toggleTag(EMPTY_FILTER, "gender", "male"));

    await userEvent.click(tag("Klasse: 5AHIF"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: expect.objectContaining({ class: ["5AHIF"], gender: ["male"] }),
      }),
    );
  });

  it("deselects a tag that is already selected", async () => {
    const onChange = setup(toggleTag(EMPTY_FILTER, "class", "5AHIF"));

    await userEvent.click(tag("Klasse: 5AHIF"));

    expect(onChange.mock.calls[0][0].tags.class).toEqual([]);
  });

  it("highlights 'Alle' exactly while no other tag is selected", () => {
    setup();

    expect(tag("Alle")).toHaveAttribute("aria-pressed", "true");
    expect(tag("Klasse: 5AHIF")).toHaveAttribute("aria-pressed", "false");
  });

  it("stops highlighting 'Alle' as soon as any tag is selected", () => {
    setup(toggleTag(EMPTY_FILTER, "class", "5AHIF"));

    expect(tag("Alle")).toHaveAttribute("aria-pressed", "false");
    expect(tag("Klasse: 5AHIF")).toHaveAttribute("aria-pressed", "true");
  });

  it("clears every category at once when 'Alle' is pressed", async () => {
    const filter = toggleTag(toggleTag(EMPTY_FILTER, "class", "5AHIF"), "program", "Ski");
    const onChange = setup(filter);

    await userEvent.click(tag("Alle"));

    expect(onChange.mock.calls[0][0].tags).toEqual(EMPTY_FILTER.tags);
  });

  it("reports what is typed into the name filter", async () => {
    const onChange = setup();

    await userEvent.type(screen.getByRole("textbox", { name: "Nicht zugeteilt: Name" }), "a");

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_FILTER, name: "a" });
  });

  it("offers nothing to clear while the name filter is empty", () => {
    setup();

    expect(screen.queryByRole("button", { name: /Name.*zurücksetzen/ })).not.toBeInTheDocument();
  });

  it("resets the name filter, and only that", async () => {
    const filter = { ...toggleTag(EMPTY_FILTER, "class", "5AHIF"), name: "anna" };
    const onChange = setup(filter);

    await userEvent.click(
      screen.getByRole("button", { name: "Nicht zugeteilt: Name zurücksetzen" }),
    );

    expect(onChange).toHaveBeenCalledWith({ ...filter, name: "" });
  });
});
