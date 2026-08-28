/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const useEvents = vi.fn();
const useEventSeries = vi.fn();

vi.mock("@/lib/events/use-events", () => ({
  useEvents: (...args: unknown[]) => useEvents(...args),
}));

vi.mock("@/lib/event-series/use-event-series", () => ({
  useEventSeries: () => useEventSeries(),
}));

const { EventsView } = await import("./events-view");

const eventSeries = { id: "s1", name: "Winter 2026", isActive: true, isArchived: false };
const events = ["Montafon", "Lech"];

function stubFetch(implementation: (...args: unknown[]) => unknown) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const created = () =>
  Promise.resolve(
    new Response(JSON.stringify({ event: { eventSeriesId: "s1", name: "Neu" } }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }),
  );

const noContent = () => Promise.resolve(new Response(null, { status: 204 }));

afterEach(() => vi.unstubAllGlobals());

function renderView(overrides: { events?: string[]; eventSeries?: unknown[] } = {}) {
  useEvents.mockReturnValue({ events: overrides.events ?? events, loading: false, error: null });
  useEventSeries.mockReturnValue({
    eventSeries: overrides.eventSeries ?? [eventSeries],
    loading: false,
    error: null,
  });
  render(<EventsView eventSeriesId="s1" />);
}

describe("EventsView", () => {
  it("names the event series the events belong to", () => {
    stubFetch(created);
    renderView();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Winter 2026");
  });

  it("scopes the subscription to the event series, so other event series never leak in", () => {
    stubFetch(created);
    renderView();

    expect(useEvents).toHaveBeenCalledWith("s1");
  });

  it("lists the events of the event series", () => {
    stubFetch(created);
    renderView();

    expect(screen.getByText("Montafon")).toBeInTheDocument();
    expect(screen.getByText("Lech")).toBeInTheDocument();
  });

  it("says so when the event series has no events yet", () => {
    stubFetch(created);
    renderView({ events: [] });

    expect(screen.getByText(/noch keine events/i)).toBeInTheDocument();
  });

  it("links back to the event series list", () => {
    stubFetch(created);
    renderView();

    expect(screen.getByRole("link", { name: /eventreihen/i })).toHaveAttribute(
      "href",
      "/app/master-data/event-series",
    );
  });
});

describe("EventsView — adding", () => {
  it("creates an event in this event series", async () => {
    const fetchMock = stubFetch(created);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Neues Event" }));
    await userEvent.type(screen.getByLabelText("Name"), "Kaunertal");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/events",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ eventSeriesId: "s1", name: "Kaunertal" }),
        }),
      ),
    );
  });

  it("blocks a blank name before it reaches the server", async () => {
    const fetchMock = stubFetch(created);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Neues Event" }));
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    expect(await screen.findByText("Pflichtfeld.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("EventsView — editing", () => {
  it("prefills the form with the event being edited", async () => {
    stubFetch(created);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Event Montafon bearbeiten" }));

    expect(screen.getByLabelText("Name")).toHaveValue("Montafon");
  });

  // The event travels in the body, since a name may contain a slash and a path segment may not.
  it("patches the event, naming it and the event series it belongs to", async () => {
    const fetchMock = stubFetch(created);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Event Montafon bearbeiten" }));
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Montafon Nord");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/events",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            eventSeriesId: "s1",
            event: "Montafon",
            name: "Montafon Nord",
          }),
        }),
      ),
    );
  });
});

describe("EventsView — removing", () => {
  it("warns that the assigned students will be unassigned", async () => {
    stubFetch(noContent);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Event Montafon löschen" }));

    expect(screen.getByRole("dialog")).toHaveTextContent(/zugeteilt/i);
  });

  it("deletes the event once confirmed", async () => {
    const fetchMock = stubFetch(noContent);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Event Montafon löschen" }));
    await userEvent.click(screen.getByRole("button", { name: "Löschen" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/events",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ eventSeriesId: "s1", event: "Montafon" }),
        }),
      ),
    );
  });

  it("deletes nothing when the confirmation is cancelled", async () => {
    const fetchMock = stubFetch(noContent);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Event Montafon löschen" }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

// The list refreshes from a separate subscription, so between the answer and the refresh a row
// still offers actions against an event the write it is waiting on may already have removed.
describe("EventsView — while a write is in flight", () => {
  async function confirmDelete() {
    await userEvent.click(screen.getByRole("button", { name: "Event Montafon löschen" }));
    await userEvent.click(screen.getByRole("button", { name: "Löschen" }));
  }

  it("locks the row that is being written to", async () => {
    stubFetch(() => new Promise(() => {}));
    renderView();

    await confirmDelete();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Event Montafon bearbeiten" })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "Montafon verschieben" })).toBeDisabled();
  });

  it("leaves every other row alone", async () => {
    stubFetch(() => new Promise(() => {}));
    renderView();

    await confirmDelete();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Event Montafon bearbeiten" })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "Event Lech bearbeiten" })).toBeEnabled();
  });

  it("releases the row once the write is answered", async () => {
    stubFetch(noContent);
    renderView();

    await confirmDelete();

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Event Montafon bearbeiten" })).toBeEnabled();
  });
});

describe("EventsView — archived event series", () => {
  it("does not offer adding events to an archived event series", () => {
    stubFetch(created);
    renderView({ eventSeries: [{ ...eventSeries, isActive: false, isArchived: true }] });

    expect(screen.queryByRole("button", { name: "Neues Event" })).not.toBeInTheDocument();
  });
});

describe("EventsView — tooltips", () => {
  it("explains the edit icon on hover", async () => {
    stubFetch(created);
    renderView();

    await userEvent.hover(screen.getByRole("button", { name: "Event Montafon bearbeiten" }));

    expect(await screen.findByText("Bearbeiten")).toBeInTheDocument();
  });

  it("warns on hover that deleting an event takes its assignments with it", async () => {
    stubFetch(created);
    renderView();

    await userEvent.hover(screen.getByRole("button", { name: "Event Montafon löschen" }));

    expect(await screen.findByText(/verlieren ihre Zuteilung/i)).toBeInTheDocument();
  });
});

describe("EventsView — duplicate event names", () => {
  const conflict = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          error: {
            code: "CONFLICT",
            message: 'Den Namen „Montafon" gibt es in dieser Eventreihe bereits.',
          },
        }),
        { status: 409, headers: { "content-type": "application/json" } },
      ),
    );

  it("reports the clash on the name field", async () => {
    stubFetch(conflict);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Neues Event" }));
    await userEvent.type(screen.getByLabelText("Name"), "Montafon");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(
        /gibt es in dieser Eventreihe/,
      ),
    );
  });

  it("keeps the dialog open so the name can be corrected", async () => {
    stubFetch(conflict);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Neues Event" }));
    await userEvent.type(screen.getByLabelText("Name"), "Montafon");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await screen.findByText(/gibt es in dieser Eventreihe/);
    expect(screen.getByLabelText("Name")).toHaveValue("Montafon");
  });
});
