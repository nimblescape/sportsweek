/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const onOpen = vi.fn();
const onSave = vi.fn();
const onUpdate = vi.fn();
const onRename = vi.fn();
const onDelete = vi.fn();

const row = (reports: readonly SavedReport[], current: ReportSelection) => (
  <SavedReportTagList
    reports={reports}
    current={current}
    onOpen={onOpen}
    onSave={onSave}
    onUpdate={onUpdate}
    onRename={onRename}
    onDelete={onDelete}
  />
);

function setup(reports: SavedReport[] = REPORTS, current: ReportSelection = CURRENT) {
  const { rerender } = render(row(reports, current));
  return {
    change: (next: ReportSelection, saved: readonly SavedReport[] = reports) =>
      rerender(row(saved, next)),
  };
}

const tag = (name: string) =>
  screen.getByRole("button", { name: `Gespeicherter Bericht: ${name}` });

/** The tag is the box around that button, and the box is what carries the colour. */
const tagBox = (name: string) => tag(name).parentElement as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  onSave.mockResolvedValue(null);
  onUpdate.mockResolvedValue(undefined);
  onRename.mockResolvedValue(undefined);
  onDelete.mockResolvedValue(undefined);
});

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

describe("the tag the teacher opened", () => {
  it("marks nothing until a tag is pressed, even where the page already matches one", () => {
    setup();

    expect(tag("5AHIF")).toHaveAttribute("aria-pressed", "false");
  });

  /** Remembered rather than derived, which is what keeps its controls reachable after an edit. */
  it("stays marked while the teacher goes on changing the report", async () => {
    const { change } = setup();
    await userEvent.click(tag("5AHIF"));

    change({ ...CURRENT, filter: toggleTag(selection, "gender", "male") });

    expect(tag("5AHIF")).toHaveAttribute("aria-pressed", "true");
  });

  it("moves the mark to whichever tag is pressed next", async () => {
    setup();

    await userEvent.click(tag("5AHIF"));
    await userEvent.click(tag("Alle Mädchen"));

    expect(tag("5AHIF")).toHaveAttribute("aria-pressed", "false");
    expect(tag("Alle Mädchen")).toHaveAttribute("aria-pressed", "true");
  });
});

describe("telling an untouched saved report from a changed one", () => {
  it("colours the marked tag differently once either tag list has been changed", async () => {
    const { change } = setup();
    await userEvent.click(tag("5AHIF"));
    expect(tagBox("5AHIF")).toHaveClass("bg-primary");

    change({ ...CURRENT, fields: [] });

    expect(tagBox("5AHIF")).not.toHaveClass("bg-primary");
    expect(tagBox("5AHIF")).toHaveClass("bg-secondary");
  });

  /** Colour alone says nothing to a screen reader, so the tag is described as well. */
  it("says it in words too, not in the colour alone", async () => {
    const { change } = setup();
    await userEvent.click(tag("5AHIF"));
    expect(tag("5AHIF")).toHaveAccessibleDescription("");

    change({ ...CURRENT, fields: [] });

    expect(tag("5AHIF")).toHaveAccessibleDescription(
      "Geändert gegenüber dem gespeicherten Bericht.",
    );
  });

  it("does not call a report changed for having its field tags pressed in another order", async () => {
    const { change } = setup([saved("r3", "Beides", selection, ["contact", "class"])], CURRENT);
    await userEvent.click(tag("Beides"));

    change({ ...CURRENT, fields: ["class", "contact"] });

    expect(tagBox("Beides")).toHaveClass("bg-primary");
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

  it("moves the mark to the report just saved, off whichever tag was open", async () => {
    const fresh = saved("r9", "Neu", EMPTY_FILTER, []);
    onSave.mockResolvedValue(fresh.id);
    const { change } = setup();
    await userEvent.click(tag("5AHIF"));

    await userEvent.click(screen.getByRole("button", { name: "Bericht speichern" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Name des Berichts" }), "Neu");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    change(CURRENT, [...REPORTS, fresh]);

    expect(tag("Neu")).toHaveAttribute("aria-pressed", "true");
    expect(tag("5AHIF")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("the controls inside a tag", () => {
  it("offers them on the marked tag, without waiting for a hover to reveal them", async () => {
    setup();
    await userEvent.click(tag("5AHIF"));

    for (const control of ["umbenennen", "löschen"]) {
      expect(screen.getByRole("button", { name: `Bericht 5AHIF ${control}` })).toBeInTheDocument();
    }
  });

  it("offers none on a tag nobody opened, so there is nothing there to press by accident", () => {
    setup();

    expect(
      screen.queryByRole("button", { name: "Bericht 5AHIF umbenennen" }),
    ).not.toBeInTheDocument();
  });
});

describe("bringing the marked report up to date", () => {
  it("offers no update while the marked report is still what is on screen", async () => {
    setup();
    await userEvent.click(tag("5AHIF"));

    expect(
      screen.queryByRole("button", { name: "Bericht 5AHIF aktualisieren" }),
    ).not.toBeInTheDocument();
  });

  it("offers one as soon as either tag list is changed", async () => {
    const { change } = setup();
    await userEvent.click(tag("5AHIF"));

    change({ ...CURRENT, fields: [] });

    expect(screen.getByRole("button", { name: "Bericht 5AHIF aktualisieren" })).toBeInTheDocument();
  });

  it("replaces what it holds with the report as it now stands", async () => {
    const changed = { ...CURRENT, fields: ["class", "contact"] };
    const { change } = setup();
    await userEvent.click(tag("5AHIF"));
    change(changed);

    await userEvent.click(screen.getByRole("button", { name: "Bericht 5AHIF aktualisieren" }));

    expect(onUpdate).toHaveBeenCalledWith("r1", changed);
  });
});

describe("renaming and deleting from within the tag", () => {
  it("edits the name in place", async () => {
    setup();
    await userEvent.click(tag("5AHIF"));

    await userEvent.click(screen.getByRole("button", { name: "Bericht 5AHIF umbenennen" }));
    const field = screen.getByRole("textbox", { name: "Name des Berichts" });
    await userEvent.clear(field);
    await userEvent.type(field, "5CHIF");
    await userEvent.click(screen.getByRole("button", { name: "Umbenennen" }));

    expect(onRename).toHaveBeenCalledWith("r1", "5CHIF");
  });

  it("asks before deleting, right there in the tag", async () => {
    setup();
    await userEvent.click(tag("5AHIF"));

    await userEvent.click(screen.getByRole("button", { name: "Bericht 5AHIF löschen" }));
    expect(onDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Löschen von 5AHIF bestätigen" }));
    expect(onDelete).toHaveBeenCalledWith("r1");
  });

  it("keeps the saved report when the confirmation is dismissed", async () => {
    setup();
    await userEvent.click(tag("5AHIF"));

    await userEvent.click(screen.getByRole("button", { name: "Bericht 5AHIF löschen" }));
    await userEvent.click(screen.getByRole("button", { name: "Löschen von 5AHIF abbrechen" }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(tag("5AHIF")).toBeInTheDocument();
  });

  it("asks about the tag that was pressed, not about every one of them", async () => {
    setup();
    await userEvent.click(tag("5AHIF"));

    await userEvent.click(screen.getByRole("button", { name: "Bericht 5AHIF löschen" }));

    expect(
      screen.queryByRole("button", { name: "Löschen von Alle Mädchen bestätigen" }),
    ).not.toBeInTheDocument();
  });
});
