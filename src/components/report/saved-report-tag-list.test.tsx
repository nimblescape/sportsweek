/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FILTER, toggleTag, type StudentFilter } from "@/lib/filters/student-filter";
import type { ReportSelection, SavedReport } from "@/lib/schemas/saved-report";
import { stubTagRowLayout } from "@/test/stub-tag-row-layout";
import { SavedReportTagList, MAY_NOT_EDIT_HINT } from "./saved-report-tag-list";

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
  position: 0,
  createdByUserId: "jane.doe@htldornbirn.at",
});

const REPORTS = [saved("r1", "5AHIF"), saved("r2", "Alle Mädchen")];
const CURRENT: ReportSelection = { filter: selection, fields: ["class"] };

const onOpen = vi.fn();
const onSave = vi.fn();
const onUpdate = vi.fn();
const onRename = vi.fn();
const onDelete = vi.fn();
const onReorder = vi.fn();

const row = (reports: readonly SavedReport[], current: ReportSelection, mayEdit = true) => (
  <SavedReportTagList
    reports={reports}
    current={current}
    mayEdit={mayEdit}
    onOpen={onOpen}
    onSave={onSave}
    onUpdate={onUpdate}
    onRename={onRename}
    onDelete={onDelete}
    onReorder={onReorder}
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

/** A write that is still out, so what the row does meanwhile can be looked at. */
function deferred<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => (settle = resolve));
  return { promise, settle };
}

const nameField = () => screen.queryByRole("textbox", { name: "Name des Berichts" });

beforeEach(() => {
  vi.clearAllMocks();
  onSave.mockResolvedValue(null);
  onUpdate.mockResolvedValue(undefined);
  onRename.mockResolvedValue(undefined);
  onDelete.mockResolvedValue(undefined);
  onReorder.mockResolvedValue(undefined);
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

  it("offers no tags while nothing has been saved yet, and still offers to save", () => {
    setup([]);

    expect(screen.queryAllByRole("button", { name: /^Gespeicherter Bericht:/ })).toHaveLength(0);
    expect(screen.getByRole("button", { name: "Bericht speichern" })).toBeInTheDocument();
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

  it("releases the mark when the tag holding it is pressed again", async () => {
    setup();
    await userEvent.click(tag("5AHIF"));

    await userEvent.click(tag("5AHIF"));

    expect(tag("5AHIF")).toHaveAttribute("aria-pressed", "false");
  });

  /** Letting go of an untouched report is not asking for one, so neither tag list hears about it. */
  it("leaves both tag lists exactly as they are when the mark is released", async () => {
    setup();
    await userEvent.click(tag("5AHIF"));
    onOpen.mockClear();

    await userEvent.click(tag("5AHIF"));

    expect(onOpen).not.toHaveBeenCalled();
    expect(tag("5AHIF")).toHaveAttribute("aria-pressed", "false");
  });

  /**
   * The only way back to what was saved: a teacher who has changed a report and wants it as it
   * was would otherwise have to remember every tag they pressed.
   */
  it("puts the saved report back when the tag holding it is pressed after a change", async () => {
    const { change } = setup();
    await userEvent.click(tag("5AHIF"));
    change({ ...CURRENT, fields: [] });
    onOpen.mockClear();

    await userEvent.click(tag("5AHIF"));

    expect(onOpen).toHaveBeenCalledWith(REPORTS[0]);
    expect(tag("5AHIF")).toHaveAttribute("aria-pressed", "true");
  });

  it("restores from the name alone, not from the controls beside it", async () => {
    const { change } = setup();
    await userEvent.click(tag("5AHIF"));
    change({ ...CURRENT, fields: [] });
    onOpen.mockClear();

    await userEvent.click(screen.getByRole("button", { name: "Bericht 5AHIF umbenennen" }));

    expect(onOpen).not.toHaveBeenCalled();
  });

  it("restores from the name alone, not from the grip that drags the tag", async () => {
    const { change } = setup();
    await userEvent.click(tag("5AHIF"));
    change({ ...CURRENT, fields: [] });
    onOpen.mockClear();

    await userEvent.click(screen.getByRole("button", { name: "5AHIF verschieben" }));

    expect(onOpen).not.toHaveBeenCalled();
  });
});

describe("telling an untouched saved report from a changed one", () => {
  it("colours the marked tag differently once either tag list has been changed", async () => {
    const { change } = setup();
    await userEvent.click(tag("5AHIF"));
    expect(tagBox("5AHIF")).toHaveClass("bg-primary");

    change({ ...CURRENT, fields: [] });

    expect(tagBox("5AHIF")).not.toHaveClass("bg-primary");
    expect(tagBox("5AHIF")).toHaveClass("bg-neutral");
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
  const saveButton = () => screen.queryByRole("button", { name: "Bericht speichern" });

  it("takes a name inline, without leaving the report", async () => {
    setup();

    await userEvent.click(saveButton() as HTMLElement);
    await userEvent.type(nameField() as HTMLElement, "5BHIF");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(onSave).toHaveBeenCalledWith("5BHIF", CURRENT);
  });

  it("takes the place of the button rather than opening a row under it", async () => {
    setup();

    await userEvent.click(saveButton() as HTMLElement);

    const row = screen.getByRole("group", { name: "Gespeicherte Berichte" });
    expect(saveButton()).not.toBeInTheDocument();
    expect(row).toContainElement(nameField());
  });

  it("gives the button back once the name has been taken", async () => {
    setup();
    await userEvent.click(saveButton() as HTMLElement);
    await userEvent.type(nameField() as HTMLElement, "5BHIF");

    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(nameField()).not.toBeInTheDocument();
    expect(saveButton()).toBeInTheDocument();
  });

  it("gives it back on a cancel too, without saving anything", async () => {
    setup();
    await userEvent.click(saveButton() as HTMLElement);

    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(saveButton()).toBeInTheDocument();
  });

  it("lets go of the marked tag the moment a new report is being named", async () => {
    setup();
    await userEvent.click(tag("5AHIF"));

    await userEvent.click(saveButton() as HTMLElement);

    expect(tag("5AHIF")).toHaveAttribute("aria-pressed", "false");
  });

  it("refuses a blank name rather than saving a report nothing can be opened by", async () => {
    setup();

    await userEvent.click(saveButton() as HTMLElement);
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Pflichtfeld.")).toBeInTheDocument();
  });

  it("moves the mark to the report just saved, off whichever tag was open", async () => {
    const fresh = saved("r9", "Neu", EMPTY_FILTER, []);
    onSave.mockResolvedValue(fresh.id);
    const { change } = setup();
    await userEvent.click(tag("5AHIF"));

    await userEvent.click(saveButton() as HTMLElement);
    await userEvent.type(nameField() as HTMLElement, "Neu");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    change(CURRENT, [...REPORTS, fresh]);

    expect(tag("Neu")).toHaveAttribute("aria-pressed", "true");
    expect(tag("5AHIF")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("ordering the row by dragging", () => {
  beforeEach(stubTagRowLayout);
  afterEach(() => vi.restoreAllMocks());

  const grip = (name: string) => screen.getByRole("button", { name: `${name} verschieben` });

  it("gives every tag a grip, so a drag is never started by pressing the tag itself", () => {
    setup();

    expect(screen.getAllByRole("button", { name: /verschieben/ })).toHaveLength(2);
  });

  it("reports the new order when a tag is moved along the row", async () => {
    setup();

    grip("5AHIF").focus();
    await userEvent.keyboard("{ }");
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.keyboard("{ }");

    await waitFor(() => expect(onReorder).toHaveBeenCalledWith(["r2", "r1"]));
  });

  it("leaves the row alone when the move is cancelled", async () => {
    setup();

    grip("5AHIF").focus();
    await userEvent.keyboard("{ }");
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.keyboard("{Escape}");

    expect(onReorder).not.toHaveBeenCalled();
  });

  /** Moving a report is not choosing it — the tag's own press is the only thing that opens one. */
  it("opens nothing and marks nothing when a tag is dragged", async () => {
    setup();

    grip("5AHIF").focus();
    await userEvent.keyboard("{ }");
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.keyboard("{ }");

    await waitFor(() => expect(onReorder).toHaveBeenCalled());
    expect(onOpen).not.toHaveBeenCalled();
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

    expect(onUpdate).toHaveBeenCalledWith("r1", { name: "5AHIF", ...changed });
  });
});

describe("while a write is out", () => {
  it("closes an open name form when a tag is pressed", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Bericht speichern" }));
    expect(nameField()).toBeInTheDocument();

    await userEvent.click(tag("5AHIF"));

    expect(nameField()).not.toBeInTheDocument();
  });

  it("holds every tag, so a second press cannot act on a report the first is still changing", async () => {
    const { promise, settle } = deferred<void>();
    onDelete.mockReturnValue(promise);
    setup();
    await userEvent.click(tag("5AHIF"));
    await userEvent.click(screen.getByRole("button", { name: "Bericht 5AHIF löschen" }));

    await userEvent.click(screen.getByRole("button", { name: "Löschen von 5AHIF bestätigen" }));

    expect(tag("Alle Mädchen")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bericht speichern" })).toBeDisabled();

    settle();
    await waitFor(() => expect(tag("Alle Mädchen")).toBeEnabled());
  });

  it("holds the name form itself, rather than taking a second name for the same report", async () => {
    const { promise, settle } = deferred<string | null>();
    onSave.mockReturnValue(promise);
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Bericht speichern" }));
    await userEvent.type(nameField() as HTMLElement, "Neu");

    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(nameField()).toBeDisabled();
    expect(screen.getByRole("button", { name: "Speichern" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Abbrechen" })).toBeDisabled();

    settle(null);
    await waitFor(() => expect(nameField()).not.toBeInTheDocument());
  });
});

describe("renaming and deleting from within the tag", () => {
  /** Renaming the tag a teacher is working in stores the report they are looking at with it. */
  it("edits the name in place, storing the report as it now stands along with it", async () => {
    const changed = { ...CURRENT, fields: ["class", "contact"] };
    const { change } = setup();
    await userEvent.click(tag("5AHIF"));
    change(changed);

    await userEvent.click(screen.getByRole("button", { name: "Bericht 5AHIF umbenennen" }));
    const field = nameField() as HTMLElement;
    await userEvent.clear(field);
    await userEvent.type(field, "5CHIF");
    await userEvent.click(screen.getByRole("button", { name: "Umbenennen" }));

    expect(onRename).toHaveBeenCalledWith("r1", { name: "5CHIF", ...changed });
  });

  it("puts the name field where the tag stood, leaving the others alone", async () => {
    setup();
    await userEvent.click(tag("5AHIF"));

    await userEvent.click(screen.getByRole("button", { name: "Bericht 5AHIF umbenennen" }));

    expect(
      screen.queryByRole("button", { name: "Gespeicherter Bericht: 5AHIF" }),
    ).not.toBeInTheDocument();
    expect(tag("Alle Mädchen")).toBeInTheDocument();
    expect(nameField()).toHaveValue("5AHIF");
  });

  it("gives the tag back when the rename is cancelled", async () => {
    setup();
    await userEvent.click(tag("5AHIF"));
    await userEvent.click(screen.getByRole("button", { name: "Bericht 5AHIF umbenennen" }));

    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(onRename).not.toHaveBeenCalled();
    expect(tag("5AHIF")).toBeInTheDocument();
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

/**
 * Viewing a report and keeping one are two permissions (US-2). Somebody who may only view still
 * opens any saved report — they are shared — but is offered no way to change what is stored.
 */
describe("SavedReportTagList — without the permission to edit", () => {
  const viewing = () => render(row(REPORTS, CURRENT, false));

  it("disables saving, and says why", async () => {
    viewing();

    const save = screen.getByRole("button", { name: /Bericht speichern/ });

    expect(save).toBeDisabled();
    expect(screen.getAllByText(MAY_NOT_EDIT_HINT).length).toBeGreaterThan(0);
  });

  it("still lets a saved report be opened", async () => {
    viewing();

    await userEvent.click(screen.getByRole("button", { name: "Gespeicherter Bericht: 5AHIF" }));

    expect(onOpen).toHaveBeenCalled();
  });

  it("offers no controls on the tag that was opened", async () => {
    viewing();

    await userEvent.click(screen.getByRole("button", { name: "Gespeicherter Bericht: 5AHIF" }));

    expect(screen.queryByRole("button", { name: /umbenennen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /löschen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /aktualisieren/ })).not.toBeInTheDocument();
  });

  /** Reordering the row is stored too, so it is not offered either. */
  it("offers no grip to reorder them by", () => {
    viewing();

    expect(screen.queryByRole("button", { name: /verschieben/ })).not.toBeInTheDocument();
  });
});
