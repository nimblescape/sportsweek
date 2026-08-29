/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { storedEventSeries } from "@/test/event-series";
import { DeleteEventSeriesDialog } from "./delete-event-series-dialog";

function stubFetch(implementation: (...args: unknown[]) => unknown) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const noContent = () => Promise.resolve(new Response(null, { status: 204 }));

afterEach(() => vi.unstubAllGlobals());

const eventSeries = {
  id: "s1",
  ...storedEventSeries({ isArchived: true, hasRegistrations: true }),
};

function renderDialog(overrides: Record<string, unknown> = {}) {
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  render(
    <DeleteEventSeriesDialog
      open
      eventSeries={eventSeries}
      onClose={onClose}
      onDeleted={onDeleted}
      {...overrides}
    />,
  );
  return { onClose, onDeleted };
}

const confirmField = () => screen.getByLabelText(/Name der Eventreihe/);
const deleteButton = () => screen.getByRole("button", { name: "Löschen" });

describe("DeleteEventSeriesDialog", () => {
  it("is a native modal dialog rather than a browser popup", () => {
    stubFetch(noContent);
    renderDialog();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows the exact event series name", () => {
    stubFetch(noContent);
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveTextContent("Wintersportwoche 2026");
  });

  it("states that the registrations go with it", () => {
    stubFetch(noContent);
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveTextContent(/Registrierungen/);
  });

  it("warns that the deletion cannot be undone", () => {
    stubFetch(noContent);
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveTextContent(/kann nicht rückgängig gemacht werden/i);
  });

  it("offers both a delete and a cancel button", () => {
    stubFetch(noContent);
    renderDialog();

    expect(deleteButton()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abbrechen" })).toBeInTheDocument();
  });

  it("keeps Delete disabled until something is typed", () => {
    stubFetch(noContent);
    renderDialog();

    expect(deleteButton()).toBeDisabled();
  });

  it("enables Delete only for the exact name", async () => {
    stubFetch(noContent);
    renderDialog();

    await userEvent.type(confirmField(), "Wintersportwoche 2026");

    expect(deleteButton()).toBeEnabled();
  });

  it("keeps Delete disabled for a partial name", async () => {
    stubFetch(noContent);
    renderDialog();

    await userEvent.type(confirmField(), "Wintersportwoche");

    expect(deleteButton()).toBeDisabled();
  });

  it("keeps Delete disabled when the case does not match", async () => {
    stubFetch(noContent);
    renderDialog();

    await userEvent.type(confirmField(), "wintersportwoche 2026");

    expect(deleteButton()).toBeDisabled();
  });

  it("keeps Delete disabled for a trailing space", async () => {
    stubFetch(noContent);
    renderDialog();

    await userEvent.type(confirmField(), "Wintersportwoche 2026 ");

    expect(deleteButton()).toBeDisabled();
  });

  it("deletes the event series once the name matches", async () => {
    const fetchMock = stubFetch(noContent);
    renderDialog();

    await userEvent.type(confirmField(), "Wintersportwoche 2026");
    await userEvent.click(deleteButton());

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/event-series/s1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("tells the caller once the event series is gone", async () => {
    stubFetch(noContent);
    const { onDeleted } = renderDialog();

    await userEvent.type(confirmField(), "Wintersportwoche 2026");
    await userEvent.click(deleteButton());

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it("deletes nothing when cancelled", async () => {
    const fetchMock = stubFetch(noContent);
    const { onClose } = renderDialog();

    await userEvent.type(confirmField(), "Wintersportwoche 2026");
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(onClose).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the server's refusal when the event series still has registrations and is not archived", async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: "CONFLICT",
              message:
                "Eine Eventreihe mit Registrierungen kann nur gelöscht werden, wenn sie archiviert ist.",
            },
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    const { onDeleted } = renderDialog();

    await userEvent.type(confirmField(), "Wintersportwoche 2026");
    await userEvent.click(deleteButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Eine Eventreihe mit Registrierungen kann nur gelöscht werden, wenn sie archiviert ist.",
    );
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

/**
 * Typing the name out is what a series with registrations earns; being asked at all is what
 * every deletion earns. Without registrations there is nothing to lose but the setup, so the
 * dialog states what goes and takes yes for an answer (US-4).
 */
describe("DeleteEventSeriesDialog — with nothing registered", () => {
  const empty = { id: "s2", ...storedEventSeries({ name: "Winter 2027" }) };

  function renderEmpty() {
    const onDeleted = vi.fn();
    render(
      <DeleteEventSeriesDialog open eventSeries={empty} onClose={vi.fn()} onDeleted={onDeleted} />,
    );
    return { onDeleted };
  }

  it("asks for no typed confirmation", () => {
    stubFetch(noContent);
    renderEmpty();

    expect(screen.queryByLabelText(/Name der Eventreihe/)).not.toBeInTheDocument();
  });

  it("offers the deletion straight away", () => {
    stubFetch(noContent);
    renderEmpty();

    expect(deleteButton()).toBeEnabled();
  });

  it("deletes on the press", async () => {
    const fetchMock = stubFetch(noContent);
    const { onDeleted } = renderEmpty();

    await userEvent.click(deleteButton());

    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/event-series/s2",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("still says what is being deleted, and that it cannot be undone", () => {
    stubFetch(noContent);
    renderEmpty();

    expect(screen.getByRole("dialog")).toHaveTextContent("Winter 2027");
    expect(screen.getByRole("dialog")).toHaveTextContent(/nicht rückgängig/i);
  });
});
