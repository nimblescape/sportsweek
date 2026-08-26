/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiRequestError } from "@/lib/api/client";
import type { ErrorCode } from "@/lib/errors";
import type { Season } from "@/lib/schemas/season";
import { SeasonFormDialog } from "./season-form-dialog";

const season: Season = {
  id: "s1",
  name: "Winter 2026",
  isActive: false,
  isArchived: false,
  hasStudentData: false,
  position: 0,
};

/**
 * The dialog owns the form and nothing else — which endpoint a name goes to is the list's
 * business, so that it can hold itself still for the round trip (see useRowAction).
 */
function renderDialog(
  options: {
    season?: Season | null;
    onSubmit?: (name: string, season: Season | null) => Promise<void>;
  } = {},
) {
  const onSubmit = options.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const onSaved = vi.fn();

  render(
    <SeasonFormDialog
      open
      season={options.season ?? null}
      onSubmit={onSubmit}
      onClose={onClose}
      onSaved={onSaved}
    />,
  );

  return { onSubmit, onClose, onSaved };
}

const rejectWith = (code: ErrorCode, message: string) =>
  vi.fn().mockRejectedValue(new ApiRequestError(message, code));

describe("SeasonFormDialog — creating", () => {
  it("hands the new name to the list", async () => {
    const { onSubmit } = renderDialog();

    await userEvent.type(screen.getByLabelText("Name"), "Wintersportwoche 2026");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("Wintersportwoche 2026", null));
  });

  it("reports the saved season to the caller so the list can react", async () => {
    const { onSaved } = renderDialog();

    await userEvent.type(screen.getByLabelText("Name"), "Winter 2026");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("blocks an empty name and never reaches the server", async () => {
    const { onSubmit } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    expect(await screen.findByText("Pflichtfeld.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only name as empty", async () => {
    const { onSubmit } = renderDialog();

    await userEvent.type(screen.getByLabelText("Name"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    expect(await screen.findByText("Pflichtfeld.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("marks the field as invalid for assistive technology", async () => {
    renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true"),
    );
  });

  it("shows a rejection that is not about the name as a general alert", async () => {
    renderDialog({ onSubmit: rejectWith("NOT_FOUND", "Diese Saison gibt es nicht.") });

    await userEvent.type(screen.getByLabelText("Name"), "Winter 2026");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Diese Saison gibt es nicht.");
  });
});

describe("SeasonFormDialog — editing", () => {
  it("prefills the current name", () => {
    renderDialog({ season });

    expect(screen.getByLabelText("Name")).toHaveValue("Winter 2026");
  });

  it("hands the new name and the season it belongs to back", async () => {
    const { onSubmit } = renderDialog({ season });

    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Winter 2027");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("Winter 2027", season));
  });

  it("closes without writing when cancelled", async () => {
    const { onSubmit, onClose } = renderDialog({ season });

    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(onClose).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("SeasonFormDialog — duplicate names", () => {
  const conflict = () => rejectWith("CONFLICT", 'Den Namen „Winter 2026" gibt es bereits.');

  it("reports the clash on the name field rather than as a detached alert", async () => {
    renderDialog({ onSubmit: conflict() });

    await userEvent.type(screen.getByLabelText("Name"), "Winter 2026");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(/gibt es bereits/),
    );
  });

  it("marks the field invalid, so the problem is obvious", async () => {
    renderDialog({ onSubmit: conflict() });

    await userEvent.type(screen.getByLabelText("Name"), "Winter 2026");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true"),
    );
  });

  it("keeps the dialog open so the name can be corrected", async () => {
    const { onSaved } = renderDialog({ onSubmit: conflict() });

    await userEvent.type(screen.getByLabelText("Name"), "Winter 2026");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await screen.findByText(/gibt es bereits/);
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveValue("Winter 2026");
  });

  it("still shows an unrelated failure as a general alert", async () => {
    renderDialog({ onSubmit: rejectWith("INTERNAL_ERROR", "Serverfehler.") });

    await userEvent.type(screen.getByLabelText("Name"), "Winter 2026");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Serverfehler.");
  });

  it("reports the clash on the field when renaming onto a taken name", async () => {
    renderDialog({
      season,
      onSubmit: rejectWith("CONFLICT", 'Den Namen „Winter 2027" gibt es bereits.'),
    });

    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Winter 2027");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(/gibt es bereits/),
    );
  });
});
