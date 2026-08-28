/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const useEventSeries = vi.fn();

vi.mock("@/lib/event-series/use-event-series", () => ({
  useEventSeries: () => useEventSeries(),
}));

const { EventSeriesView } = await import("./event-series-view");

const active = {
  id: "s1",
  name: "Winter 2026",
  isActive: true,
  isArchived: false,
  hasRegistrations: true,
  position: 0,
};
const archived = {
  id: "s2",
  name: "Winter 2025",
  isActive: false,
  isArchived: true,
  hasRegistrations: true,
  position: 0,
};
const inactive = {
  id: "s3",
  name: "Winter 2027",
  isActive: false,
  isArchived: false,
  hasRegistrations: true,
  position: 0,
};
const noStudentData = {
  id: "s4",
  name: "Winter 2024",
  isActive: false,
  isArchived: false,
  hasRegistrations: false,
  position: 0,
};

function stubFetch(implementation: (...args: unknown[]) => unknown) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const noContent = () => Promise.resolve(new Response(null, { status: 204 }));
const okJson = () =>
  Promise.resolve(
    new Response(JSON.stringify({ eventSeries: active }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

afterEach(() => vi.unstubAllGlobals());

function renderView(eventSeries = [active, archived, inactive]) {
  useEventSeries.mockReturnValue({ eventSeries, loading: false, error: null });
  render(<EventSeriesView />);
}

describe("EventSeriesView — archived visibility", () => {
  it("hides archived event series by default", () => {
    stubFetch(noContent);
    renderView();

    expect(screen.queryByText("Winter 2025")).not.toBeInTheDocument();
  });

  it("shows the live event series by default", () => {
    stubFetch(noContent);
    renderView();

    expect(screen.getByText("Winter 2026")).toBeInTheDocument();
    expect(screen.getByText("Winter 2027")).toBeInTheDocument();
  });

  it("reveals archived event series on demand, so unarchiving stays reachable", async () => {
    stubFetch(noContent);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Archivierte Eventreihen anzeigen" }));

    expect(screen.getByText("Winter 2025")).toBeInTheDocument();
  });
});

describe("EventSeriesView — creating and editing", () => {
  it("opens an empty form for a new event series", async () => {
    stubFetch(okJson);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Neue Eventreihe" }));

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Neue Eventreihe");
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });

  it("opens the edit form prefilled with the chosen event series", async () => {
    stubFetch(okJson);
    renderView();

    await userEvent.click(
      screen.getByRole("button", { name: "Eventreihe Winter 2026 bearbeiten" }),
    );

    expect(screen.getByLabelText("Name")).toHaveValue("Winter 2026");
  });
});

describe("EventSeriesView — flags", () => {
  it("archives an event series through the API", async () => {
    const fetchMock = stubFetch(okJson);
    renderView();

    await userEvent.click(
      screen.getByRole("button", { name: "Eventreihe Winter 2027 archivieren" }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/event-series/s3",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isArchived: true }) }),
      ),
    );
  });

  it("unarchives an event series through the API", async () => {
    const fetchMock = stubFetch(okJson);
    renderView([archived]);

    await userEvent.click(screen.getByRole("button", { name: "Archivierte Eventreihen anzeigen" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Eventreihe Winter 2025 wiederherstellen" }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/event-series/s2",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isArchived: false }) }),
      ),
    );
  });

  it("surfaces a refused flag change instead of failing silently", async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ error: { code: "CONFLICT", message: "Keine Anmeldungen." } }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    renderView();

    await userEvent.click(
      screen.getByRole("button", { name: "Eventreihe Winter 2027 archivieren" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Keine Anmeldungen.");
  });
});

describe("EventSeriesView — deleting", () => {
  it("opens the confirmation dialog for an archived event series", async () => {
    stubFetch(noContent);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Archivierte Eventreihen anzeigen" }));
    await userEvent.click(screen.getByRole("button", { name: "Eventreihe Winter 2025 löschen" }));

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Eventreihe löschen");
  });

  it("deletes only after the exact name is typed", async () => {
    const fetchMock = stubFetch(noContent);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Archivierte Eventreihen anzeigen" }));
    await userEvent.click(screen.getByRole("button", { name: "Eventreihe Winter 2025 löschen" }));
    await userEvent.type(screen.getByLabelText(/Name der Eventreihe/), "Winter 2025");
    await userEvent.click(screen.getByRole("button", { name: "Löschen" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/event-series/s2",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("closes the dialog once the event series is gone", async () => {
    stubFetch(noContent);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Archivierte Eventreihen anzeigen" }));
    await userEvent.click(screen.getByRole("button", { name: "Eventreihe Winter 2025 löschen" }));
    await userEvent.type(screen.getByLabelText(/Name der Eventreihe/), "Winter 2025");
    await userEvent.click(screen.getByRole("button", { name: "Löschen" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("deletes directly, without a confirmation dialog, an event series that has no registrations", async () => {
    const fetchMock = stubFetch(noContent);
    renderView([active, archived, inactive, noStudentData]);

    await userEvent.click(screen.getByRole("button", { name: "Eventreihe Winter 2024 löschen" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/event-series/s4",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("surfaces a refused direct deletion instead of failing silently", async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ error: { code: "CONFLICT", message: "Hat noch Anmeldungen." } }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    renderView([active, archived, inactive, noStudentData]);

    await userEvent.click(screen.getByRole("button", { name: "Eventreihe Winter 2024 löschen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Hat noch Anmeldungen.");
  });
});

describe("EventSeriesView — while a write is in flight", () => {
  it("locks the row that is being written to", async () => {
    stubFetch(() => new Promise(() => {}));
    renderView([active, archived, inactive, noStudentData]);

    await userEvent.click(screen.getByRole("button", { name: "Eventreihe Winter 2024 löschen" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Eventreihe Winter 2024 bearbeiten" }),
      ).toBeDisabled(),
    );
  });

  it("releases the row once the write is answered", async () => {
    stubFetch(noContent);
    renderView([active, archived, inactive, noStudentData]);

    await userEvent.click(screen.getByRole("button", { name: "Eventreihe Winter 2024 löschen" }));

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Eventreihe Winter 2024 bearbeiten" }),
      ).not.toBeDisabled(),
    );
  });
});
