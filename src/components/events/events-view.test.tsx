import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const useEvents = vi.fn();
const useSeasons = vi.fn();

vi.mock("@/lib/events/use-events", () => ({
  useEvents: (...args: unknown[]) => useEvents(...args),
}));

vi.mock("@/lib/seasons/use-seasons", () => ({
  useSeasons: () => useSeasons(),
}));

const { EventsView } = await import("./events-view");

const season = { id: "s1", name: "Winter 2026", isActive: true, isArchived: false };
const events = [
  { id: "e1", seasonId: "s1", name: "Montafon" },
  { id: "e2", seasonId: "s1", name: "Lech" },
];

function stubFetch(implementation: (...args: unknown[]) => unknown) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const created = () =>
  Promise.resolve(
    new Response(JSON.stringify({ event: { id: "e3", seasonId: "s1", name: "Neu" } }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }),
  );

const noContent = () => Promise.resolve(new Response(null, { status: 204 }));

afterEach(() => vi.unstubAllGlobals());

function renderView(overrides: { events?: typeof events; seasons?: unknown[] } = {}) {
  useEvents.mockReturnValue({ events: overrides.events ?? events, loading: false, error: null });
  useSeasons.mockReturnValue({
    seasons: overrides.seasons ?? [season],
    loading: false,
    error: null,
  });
  render(<EventsView seasonId="s1" />);
}

describe("EventsView", () => {
  it("names the season the events belong to", () => {
    stubFetch(created);
    renderView();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Winter 2026");
  });

  it("scopes the subscription to the season, so other seasons never leak in", () => {
    stubFetch(created);
    renderView();

    expect(useEvents).toHaveBeenCalledWith("s1");
  });

  it("lists the events of the season", () => {
    stubFetch(created);
    renderView();

    expect(screen.getByText("Montafon")).toBeInTheDocument();
    expect(screen.getByText("Lech")).toBeInTheDocument();
  });

  it("says so when the season has no events yet", () => {
    stubFetch(created);
    renderView({ events: [] });

    expect(screen.getByText(/noch keine events/i)).toBeInTheDocument();
  });

  it("links back to the season list", () => {
    stubFetch(created);
    renderView();

    expect(screen.getByRole("link", { name: /saisonen/i })).toHaveAttribute(
      "href",
      "/app/master-data/seasons",
    );
  });
});

describe("EventsView — adding", () => {
  it("creates an event in this season", async () => {
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
          body: JSON.stringify({ seasonId: "s1", name: "Kaunertal" }),
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

  it("patches the event", async () => {
    const fetchMock = stubFetch(created);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Event Montafon bearbeiten" }));
    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Montafon Nord");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/events/e1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ name: "Montafon Nord" }),
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
        "/api/events/e1",
        expect.objectContaining({ method: "DELETE" }),
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

describe("EventsView — archived season", () => {
  it("does not offer adding events to an archived season", () => {
    stubFetch(created);
    renderView({ seasons: [{ ...season, isActive: false, isArchived: true }] });

    expect(screen.queryByRole("button", { name: "Neues Event" })).not.toBeInTheDocument();
  });
});

describe("EventsView — tooltips", () => {
  it.each([
    ["Event Montafon bearbeiten", "Bearbeiten"],
    ["Event Montafon löschen", "Löschen"],
  ])("explains the %s icon on hover", async (accessibleName, tooltip) => {
    stubFetch(created);
    renderView();

    await userEvent.hover(screen.getByRole("button", { name: accessibleName }));

    expect(await screen.findByText(tooltip)).toBeInTheDocument();
  });
});
