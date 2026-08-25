/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const useSeasons = vi.fn();

vi.mock("@/lib/seasons/use-seasons", () => ({
  useSeasons: () => useSeasons(),
}));

const { SeasonsView } = await import("./seasons-view");

const active = {
  id: "s1",
  name: "Winter 2026",
  isActive: true,
  isArchived: false,
  hasStudentData: true,
};
const archived = {
  id: "s2",
  name: "Winter 2025",
  isActive: false,
  isArchived: true,
  hasStudentData: true,
};
const inactive = {
  id: "s3",
  name: "Winter 2027",
  isActive: false,
  isArchived: false,
  hasStudentData: true,
};
const noStudentData = {
  id: "s4",
  name: "Winter 2024",
  isActive: false,
  isArchived: false,
  hasStudentData: false,
};

function stubFetch(implementation: (...args: unknown[]) => unknown) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const noContent = () => Promise.resolve(new Response(null, { status: 204 }));
const okJson = () =>
  Promise.resolve(
    new Response(JSON.stringify({ season: active }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

afterEach(() => vi.unstubAllGlobals());

function renderView(seasons = [active, archived, inactive]) {
  useSeasons.mockReturnValue({ seasons, loading: false, error: null });
  render(<SeasonsView />);
}

describe("SeasonsView — archived visibility", () => {
  it("hides archived seasons by default", () => {
    stubFetch(noContent);
    renderView();

    expect(screen.queryByText("Winter 2025")).not.toBeInTheDocument();
  });

  it("shows the live seasons by default", () => {
    stubFetch(noContent);
    renderView();

    expect(screen.getByText("Winter 2026")).toBeInTheDocument();
    expect(screen.getByText("Winter 2027")).toBeInTheDocument();
  });

  it("reveals archived seasons on demand, so unarchiving stays reachable", async () => {
    stubFetch(noContent);
    renderView();

    await userEvent.click(screen.getByRole("checkbox", { name: /archivierte/i }));

    expect(screen.getByText("Winter 2025")).toBeInTheDocument();
  });
});

describe("SeasonsView — creating and editing", () => {
  it("opens an empty form for a new season", async () => {
    stubFetch(okJson);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Neue Saison" }));

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Neue Saison");
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });

  it("opens the edit form prefilled with the chosen season", async () => {
    stubFetch(okJson);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Saison Winter 2026 bearbeiten" }));

    expect(screen.getByLabelText("Name")).toHaveValue("Winter 2026");
  });
});

describe("SeasonsView — flags", () => {
  it("activates a season through the API", async () => {
    const fetchMock = stubFetch(okJson);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Saison Winter 2027 aktiv setzen" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/seasons/s3",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isActive: true }) }),
      ),
    );
  });

  it("deactivates the active season through the API, leaving none active", async () => {
    const fetchMock = stubFetch(okJson);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Saison Winter 2026 deaktivieren" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/seasons/s1",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isActive: false }) }),
      ),
    );
  });

  it("archives a season through the API", async () => {
    const fetchMock = stubFetch(okJson);
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Saison Winter 2027 archivieren" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/seasons/s3",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isArchived: true }) }),
      ),
    );
  });

  it("unarchives a season through the API", async () => {
    const fetchMock = stubFetch(okJson);
    renderView([archived]);

    await userEvent.click(screen.getByRole("checkbox", { name: /archivierte/i }));
    await userEvent.click(
      screen.getByRole("button", { name: "Saison Winter 2025 wiederherstellen" }),
    );

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/seasons/s2",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ isArchived: false }) }),
      ),
    );
  });

  it("surfaces a refused flag change instead of failing silently", async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ error: { code: "CONFLICT", message: "Archivierte Saison." } }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    renderView();

    await userEvent.click(screen.getByRole("button", { name: "Saison Winter 2027 aktiv setzen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Archivierte Saison.");
  });
});

describe("SeasonsView — deleting", () => {
  it("opens the confirmation dialog for an archived season", async () => {
    stubFetch(noContent);
    renderView();

    await userEvent.click(screen.getByRole("checkbox", { name: /archivierte/i }));
    await userEvent.click(screen.getByRole("button", { name: "Saison Winter 2025 löschen" }));

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Saison löschen");
  });

  it("deletes only after the exact name is typed", async () => {
    const fetchMock = stubFetch(noContent);
    renderView();

    await userEvent.click(screen.getByRole("checkbox", { name: /archivierte/i }));
    await userEvent.click(screen.getByRole("button", { name: "Saison Winter 2025 löschen" }));
    await userEvent.type(screen.getByLabelText(/Name der Saison/), "Winter 2025");
    await userEvent.click(screen.getByRole("button", { name: "Löschen" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/seasons/s2",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("closes the dialog once the season is gone", async () => {
    stubFetch(noContent);
    renderView();

    await userEvent.click(screen.getByRole("checkbox", { name: /archivierte/i }));
    await userEvent.click(screen.getByRole("button", { name: "Saison Winter 2025 löschen" }));
    await userEvent.type(screen.getByLabelText(/Name der Saison/), "Winter 2025");
    await userEvent.click(screen.getByRole("button", { name: "Löschen" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("deletes directly, without a confirmation dialog, a season that has no student data", async () => {
    const fetchMock = stubFetch(noContent);
    renderView([active, archived, inactive, noStudentData]);

    await userEvent.click(screen.getByRole("button", { name: "Saison Winter 2024 löschen" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/seasons/s4",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("surfaces a refused direct deletion instead of failing silently", async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ error: { code: "CONFLICT", message: "Hat noch Schülerdaten." } }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    renderView([active, archived, inactive, noStudentData]);

    await userEvent.click(screen.getByRole("button", { name: "Saison Winter 2024 löschen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Hat noch Schülerdaten.");
  });
});
