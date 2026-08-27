/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FILTER, toggleTag, type StudentFilter } from "@/lib/filters/student-filter";
import type { ReportSelection, SavedReport } from "@/lib/schemas/saved-report";
import { SavedReportTagList } from "./saved-report-tag-list";

const selection = toggleTag(EMPTY_FILTER, "class", "5AHIF");

const saved = (
  id: string,
  name: string,
  filter: StudentFilter = selection,
  fields: string[] = ["class"],
): SavedReport => ({
  id,
  name,
  filter,
  fields,
  createdByUserId: "jane.doe@htldornbirn.at",
});

const REPORTS = [saved("r1", "5AHIF"), saved("r2", "Alle Mädchen")];
const CURRENT: ReportSelection = { filter: selection, fields: ["class"] };

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

const onOpen = vi.fn();
const onSave = vi.fn();
const onRename = vi.fn();
const onDelete = vi.fn();

function setup(reports: SavedReport[] = REPORTS, current: ReportSelection = CURRENT) {
  render(
    <SavedReportTagList
      reports={reports}
      current={current}
      onOpen={onOpen}
      onSave={onSave}
      onRename={onRename}
      onDelete={onDelete}
    />,
  );
}

const tag = (name: string) =>
  screen.getByRole("button", { name: `Gespeicherter Bericht: ${name}` });

beforeEach(() => {
  vi.clearAllMocks();
  stubHover(true);
  onSave.mockResolvedValue(undefined);
  onRename.mockResolvedValue(undefined);
  onDelete.mockResolvedValue(undefined);
});

afterEach(() => vi.restoreAllMocks());

describe("SavedReportTagList", () => {
  it("is a tag row like the two it saves, one tag per saved report", () => {
    setup();

    const row = screen.getByRole("group", { name: "Gespeicherte Berichte" });
    expect(row).toContainElement(tag("5AHIF"));
    expect(row).toContainElement(tag("Alle Mädchen"));
  });

  it("puts both selections back on screen when a tag is pressed", async () => {
    setup(REPORTS, { filter: EMPTY_FILTER, fields: [] });
    await userEvent.click(tag("5AHIF"));

    expect(onOpen).toHaveBeenCalledWith(REPORTS[0]);
  });

  it("says so while nothing has been saved yet", () => {
    setup([]);

    expect(screen.getByText("Noch keine Berichte gespeichert.")).toBeInTheDocument();
  });
});

describe("naming what is currently shown", () => {
  it("presses the tag of the saved report the page is showing", () => {
    setup();

    expect(tag("5AHIF")).toHaveAttribute("aria-pressed", "true");
    expect(tag("Alle Mädchen")).toHaveAttribute("aria-pressed", "false");
  });

  /** Derived rather than remembered, so it cannot go on claiming a report no longer on screen. */
  it("releases it as soon as the teacher changes a filter tag", () => {
    setup(REPORTS, { ...CURRENT, filter: toggleTag(selection, "gender", "male") });

    expect(tag("5AHIF")).toHaveAttribute("aria-pressed", "false");
  });

  /** The fields are half of what a saved report is, so changing one changes the report. */
  it("releases it as soon as the teacher changes a field tag", () => {
    setup(REPORTS, { ...CURRENT, fields: ["class", "contact"] });

    expect(tag("5AHIF")).toHaveAttribute("aria-pressed", "false");
  });

  it("ignores the order the tags were pressed in", () => {
    setup([saved("r3", "Beides", selection, ["contact", "class"])], {
      ...CURRENT,
      fields: ["class", "contact"],
    });

    expect(tag("Beides")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("saving the report as it stands", () => {
  it("takes a name inline, without leaving the report", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Bericht speichern" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Name des Berichts" }), "5BHIF");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(onSave).toHaveBeenCalledWith("5BHIF", CURRENT);
  });

  it("refuses a blank name rather than saving a report nothing can be opened by", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Bericht speichern" }));
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Pflichtfeld.")).toBeInTheDocument();
  });
});

describe("renaming and deleting from within the tag", () => {
  it("edits the name in place", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Bericht 5AHIF umbenennen" }));
    const field = screen.getByRole("textbox", { name: "Name des Berichts" });
    await userEvent.clear(field);
    await userEvent.type(field, "5CHIF");
    await userEvent.click(screen.getByRole("button", { name: "Umbenennen" }));

    expect(onRename).toHaveBeenCalledWith("r1", "5CHIF");
  });

  it("asks before deleting, right there in the tag", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Bericht 5AHIF löschen" }));
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Löschen von 5AHIF bestätigen" }));
    expect(onDelete).toHaveBeenCalledWith("r1");
  });

  it("keeps the saved report when the confirmation is dismissed", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Bericht 5AHIF löschen" }));
    await userEvent.click(screen.getByRole("button", { name: "Löschen von 5AHIF abbrechen" }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(tag("5AHIF")).toBeInTheDocument();
  });

  it("asks about the tag that was pressed, not about every one of them", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Bericht 5AHIF löschen" }));

    expect(
      screen.queryByRole("button", { name: "Löschen von Alle Mädchen bestätigen" }),
    ).not.toBeInTheDocument();
  });
});

describe("the in-tag icons", () => {
  it("keeps them out of the way until hovered, where hovering is possible", () => {
    stubHover(true);
    setup();

    expect(screen.getByRole("button", { name: "Bericht 5AHIF umbenennen" })).toHaveClass(
      "opacity-0",
    );
  });

  it("shows them permanently on a touch screen, which has no hover to reveal them", () => {
    stubHover(false);
    setup();

    expect(screen.getByRole("button", { name: "Bericht 5AHIF umbenennen" })).not.toHaveClass(
      "opacity-0",
    );
  });
});
