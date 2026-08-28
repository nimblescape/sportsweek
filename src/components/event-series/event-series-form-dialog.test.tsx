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
import type { EventSeries } from "@/lib/schemas/event-series";
import { storedEventSeries } from "@/test/event-series";
import { EventSeriesFormDialog } from "./event-series-form-dialog";

const eventSeries: EventSeries = { id: "s1", ...storedEventSeries({ name: "Winter 2026" }) };

/**
 * The dialog owns the form and nothing else — which endpoint a name goes to is the list's
 * business, so that it can hold itself still for the round trip (see useRowAction).
 */
function renderDialog(
  options: {
    eventSeries?: EventSeries | null;
    onSubmit?: (name: string, eventSeries: EventSeries | null) => Promise<void>;
  } = {},
) {
  const onSubmit = options.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const onSaved = vi.fn();

  render(
    <EventSeriesFormDialog
      open
      eventSeries={options.eventSeries ?? null}
      onSubmit={onSubmit}
      onClose={onClose}
      onSaved={onSaved}
    />,
  );

  return { onSubmit, onClose, onSaved };
}

const rejectWith = (code: ErrorCode, message: string) =>
  vi.fn().mockRejectedValue(new ApiRequestError(message, code));

describe("EventSeriesFormDialog — creating", () => {
  it("hands the new name to the list", async () => {
    const { onSubmit } = renderDialog();

    await userEvent.type(screen.getByLabelText("Name"), "Wintersportwoche 2026");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("Wintersportwoche 2026", null));
  });

  it("reports the saved event series to the caller so the list can react", async () => {
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
    renderDialog({ onSubmit: rejectWith("NOT_FOUND", "Diese Eventreihe gibt es nicht.") });

    await userEvent.type(screen.getByLabelText("Name"), "Winter 2026");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Diese Eventreihe gibt es nicht.");
  });
});

describe("EventSeriesFormDialog — editing", () => {
  it("prefills the current name", () => {
    renderDialog({ eventSeries });

    expect(screen.getByLabelText("Name")).toHaveValue("Winter 2026");
  });

  it("hands the new name and the event series it belongs to back", async () => {
    const { onSubmit } = renderDialog({ eventSeries });

    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Winter 2027");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("Winter 2027", eventSeries));
  });

  it("closes without writing when cancelled", async () => {
    const { onSubmit, onClose } = renderDialog({ eventSeries });

    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(onClose).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("EventSeriesFormDialog — duplicate names", () => {
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
      eventSeries,
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
