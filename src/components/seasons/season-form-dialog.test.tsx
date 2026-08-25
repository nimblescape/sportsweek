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

  it("shows the server's message when the write is rejected", async () => {
    stubFetch(() =>
      okResponse({ error: { code: "CONFLICT", message: "Diese Saison gibt es schon." } }, 409),
    );
    render(<SeasonFormDialog open season={null} onClose={vi.fn()} onSaved={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Name"), "Winter 2026");
    await userEvent.click(screen.getByRole("button", { name: "Anlegen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Diese Saison gibt es schon.");
  });
});

describe("SeasonFormDialog — editing", () => {
  const season = { id: "s1", name: "Winter 2026", isActive: false, isArchived: false };

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
