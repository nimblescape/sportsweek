/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SeasonFormDialog } from "./season-form-dialog";

function stubFetch(implementation: (...args: unknown[]) => unknown) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function okResponse(body: unknown = {}, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("SeasonFormDialog — creating", () => {
  it("posts the new season", async () => {
    const fetchMock = stubFetch(() => okResponse({ season: { id: "s1" } }, 201));
    render(<SeasonFormDialog open season={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Name"), "Wintersportwoche 2026");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/seasons",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "Wintersportwoche 2026" }),
        }),
      ),
    );
  });

  it("reports the saved season to the caller so the list can react", async () => {
    stubFetch(() => okResponse({ season: { id: "s1" } }, 201));
    const onSaved = vi.fn();
    render(<SeasonFormDialog open season={null} onClose={vi.fn()} onSaved={onSaved} />);

    await userEvent.type(screen.getByLabelText("Name"), "Winter 2026");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("blocks an empty name and never reaches the server", async () => {
    const fetchMock = stubFetch(() => okResponse());
    render(<SeasonFormDialog open season={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    expect(await screen.findByText("Pflichtfeld.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a whitespace-only name as empty", async () => {
    const fetchMock = stubFetch(() => okResponse());
    render(<SeasonFormDialog open season={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Name"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    expect(await screen.findByText("Pflichtfeld.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks the field as invalid for assistive technology", async () => {
    stubFetch(() => okResponse());
    render(<SeasonFormDialog open season={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true"),
    );
  });

  it("shows a rejection that is not about the name as a general alert", async () => {
    stubFetch(() =>
      okResponse({ error: { code: "NOT_FOUND", message: "Diese Saison gibt es nicht." } }, 404),
    );
    render(<SeasonFormDialog open season={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Name"), "Winter 2026");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Diese Saison gibt es nicht.");
  });
});

describe("SeasonFormDialog — editing", () => {
  const season = {
    id: "s1",
    name: "Winter 2026",
    isActive: false,
    isArchived: false,
    hasStudentData: false,
    position: 0,
  };

  it("prefills the current name", () => {
    stubFetch(() => okResponse());
    render(<SeasonFormDialog open season={season} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByLabelText("Name")).toHaveValue("Winter 2026");
  });

  it("patches only the season being edited", async () => {
    const fetchMock = stubFetch(() => okResponse({ season }));
    render(<SeasonFormDialog open season={season} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Winter 2027");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/seasons/s1",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ name: "Winter 2027" }) }),
      ),
    );
  });

  it("closes without writing when cancelled", async () => {
    const fetchMock = stubFetch(() => okResponse());
    const onClose = vi.fn();
    render(<SeasonFormDialog open season={season} onClose={onClose} onSaved={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));

    expect(onClose).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("SeasonFormDialog — duplicate names", () => {
  const conflict = () =>
    okResponse(
      { error: { code: "CONFLICT", message: 'Den Namen „Winter 2026" gibt es bereits.' } },
      409,
    );

  it("reports the clash on the name field rather than as a detached alert", async () => {
    stubFetch(conflict);
    render(<SeasonFormDialog open season={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Name"), "Winter 2026");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(/gibt es bereits/),
    );
  });

  it("marks the field invalid, so the problem is obvious", async () => {
    stubFetch(conflict);
    render(<SeasonFormDialog open season={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Name"), "Winter 2026");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true"),
    );
  });

  it("keeps the dialog open so the name can be corrected", async () => {
    stubFetch(conflict);
    const onSaved = vi.fn();
    render(<SeasonFormDialog open season={null} onClose={vi.fn()} onSaved={onSaved} />);

    await userEvent.type(screen.getByLabelText("Name"), "Winter 2026");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    await screen.findByText(/gibt es bereits/);
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveValue("Winter 2026");
  });

  it("still shows an unrelated failure as a general alert", async () => {
    stubFetch(() =>
      okResponse({ error: { code: "INTERNAL_ERROR", message: "Serverfehler." } }, 500),
    );
    render(<SeasonFormDialog open season={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Name"), "Winter 2026");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Serverfehler.");
  });
});

describe("SeasonFormDialog — duplicate name while editing", () => {
  const season = {
    id: "s1",
    name: "Winter 2026",
    isActive: false,
    isArchived: false,
    hasStudentData: false,
    position: 0,
  };

  it("reports the clash on the field when renaming onto a taken name", async () => {
    stubFetch(() =>
      okResponse(
        { error: { code: "CONFLICT", message: 'Den Namen \u201eWinter 2027" gibt es bereits.' } },
        409,
      ),
    );
    render(<SeasonFormDialog open season={season} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.clear(screen.getByLabelText("Name"));
    await userEvent.type(screen.getByLabelText("Name"), "Winter 2027");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveAccessibleDescription(/gibt es bereits/),
    );
  });
});
