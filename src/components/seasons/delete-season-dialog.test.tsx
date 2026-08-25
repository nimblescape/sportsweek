import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteSeasonDialog } from "./delete-season-dialog";

function stubFetch(implementation: (...args: unknown[]) => unknown) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const noContent = () => Promise.resolve(new Response(null, { status: 204 }));

afterEach(() => vi.unstubAllGlobals());

const season = { id: "s1", name: "Wintersportwoche 2026", isActive: false, isArchived: true };

function renderDialog(overrides: Record<string, unknown> = {}) {
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  render(
    <DeleteSeasonDialog
      open
      season={season}
      onClose={onClose}
      onDeleted={onDeleted}
      {...overrides}
    />,
  );
  return { onClose, onDeleted };
}

const confirmField = () => screen.getByLabelText(/Name der Saison/);
const deleteButton = () => screen.getByRole("button", { name: "Löschen" });

describe("DeleteSeasonDialog", () => {
  it("is a native modal dialog rather than a browser popup", () => {
    stubFetch(noContent);
    renderDialog();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows the exact season name", () => {
    stubFetch(noContent);
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveTextContent("Wintersportwoche 2026");
  });

  it("states that the master data records go with it", () => {
    stubFetch(noContent);
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveTextContent(/Stammdaten/);
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

  it("deletes the season once the name matches", async () => {
    const fetchMock = stubFetch(noContent);
    renderDialog();

    await userEvent.type(confirmField(), "Wintersportwoche 2026");
    await userEvent.click(deleteButton());

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/seasons/s1",
        expect.objectContaining({ method: "DELETE" }),
      ),
    );
  });

  it("tells the caller once the season is gone", async () => {
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

  it("shows the server's refusal when the season turns out not to be archived", async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: "CONFLICT",
              message: "Nur archivierte Saisonen können gelöscht werden.",
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
      "Nur archivierte Saisonen können gelöscht werden.",
    );
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
