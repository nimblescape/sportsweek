/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FILTER, toggleTag, type StudentFilter } from "@/lib/filters/student-filter";
import type { SavedReportFilter } from "@/lib/schemas/saved-report-filter";
import { SavedFilterPicker } from "./saved-filter-picker";

const selection = toggleTag(EMPTY_FILTER, "class", "5AHIF");

const saved = (id: string, name: string, filter: StudentFilter = selection): SavedReportFilter => ({
  id,
  name,
  filter,
  createdByUserId: "jane.doe@htldornbirn.at",
});

const FILTERS = [saved("f1", "5AHIF"), saved("f2", "Alle Mädchen")];

function stubHover(canHover: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (media: string) =>
      ({
        media,
        matches: canHover,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

const onApply = vi.fn();
const onSave = vi.fn();
const onRename = vi.fn();
const onDelete = vi.fn();

function setup(filters: SavedReportFilter[] = FILTERS) {
  render(
    <SavedFilterPicker
      filters={filters}
      current={selection}
      onApply={onApply}
      onSave={onSave}
      onRename={onRename}
      onDelete={onDelete}
    />,
  );
}

const open = () => userEvent.click(screen.getByRole("button", { name: "Gespeicherte Filter" }));

beforeEach(() => {
  vi.clearAllMocks();
  stubHover(true);
  onSave.mockResolvedValue(undefined);
  onRename.mockResolvedValue(undefined);
  onDelete.mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

describe("SavedFilterPicker", () => {
  it("is a listbox of its own rather than a native select, which cannot carry the icons", async () => {
    setup();
    await open();

    const listbox = screen.getByRole("listbox", { name: "Gespeicherte Filter" });
    expect(listbox.tagName).not.toBe("SELECT");
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "5AHIF",
      "Alle Mädchen",
    ]);
  });

  it("applies the whole selection a filter holds", async () => {
    setup();
    await open();
    await userEvent.click(screen.getByRole("option", { name: "5AHIF" }));

    expect(onApply).toHaveBeenCalledWith(FILTERS[0].filter);
  });

  it("says so while nothing has been saved yet", async () => {
    setup([]);
    await open();

    expect(screen.getByText("Noch keine Filter gespeichert.")).toBeInTheDocument();
  });

  it("closes on Escape and moves between the entries with the arrow keys", async () => {
    setup();
    await open();

    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "5AHIF" })).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "Alle Mädchen" })).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("listbox")).not.toBeInTheDocument());
  });
});

describe("saving the current selection", () => {
  it("takes a name inline, without leaving the report", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Filter speichern" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Name des Filters" }), "5BHIF");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(onSave).toHaveBeenCalledWith("5BHIF", selection);
  });

  it("refuses a blank name rather than saving a filter nothing can be picked by", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Filter speichern" }));
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Pflichtfeld.")).toBeInTheDocument();
  });
});

describe("renaming and deleting inline", () => {
  it("edits the name in place, inside the dropdown", async () => {
    setup();
    await open();

    await userEvent.click(screen.getByRole("button", { name: "Filter 5AHIF umbenennen" }));
    const field = screen.getByRole("textbox", { name: "Name des Filters" });
    await userEvent.clear(field);
    await userEvent.type(field, "5CHIF");
    await userEvent.click(screen.getByRole("button", { name: "Umbenennen" }));

    expect(onRename).toHaveBeenCalledWith("f1", "5CHIF");
  });

  it("asks before deleting, right there in the row", async () => {
    setup();
    await open();

    await userEvent.click(screen.getByRole("button", { name: "Filter 5AHIF löschen" }));
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Löschen bestätigen" }));
    expect(onDelete).toHaveBeenCalledWith("f1");
  });

  it("keeps the filter when the confirmation is dismissed", async () => {
    setup();
    await open();

    await userEvent.click(screen.getByRole("button", { name: "Filter 5AHIF löschen" }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("option", { name: "5AHIF" })).toBeInTheDocument();
  });
});

describe("the per-entry icons", () => {
  it("keeps them out of the way until hovered, where hovering is possible", async () => {
    stubHover(true);
    setup();
    await open();

    expect(screen.getByRole("button", { name: "Filter 5AHIF umbenennen" })).toHaveClass(
      "opacity-0",
    );
  });

  it("shows them permanently on a touch screen, which has no hover to reveal them", async () => {
    stubHover(false);
    setup();
    await open();

    expect(screen.getByRole("button", { name: "Filter 5AHIF umbenennen" })).not.toHaveClass(
      "opacity-0",
    );
  });
});
