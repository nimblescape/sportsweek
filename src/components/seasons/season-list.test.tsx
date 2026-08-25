/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SeasonList } from "@/components/seasons/season-list";

const seasons = [
  { id: "s1", name: "Wintersportwoche 2026", isActive: true, isArchived: false },
  { id: "s2", name: "Wintersportwoche 2025", isActive: false, isArchived: true },
  { id: "s3", name: "Wintersportwoche 2027", isActive: false, isArchived: false },
];

function renderList(overrides: Record<string, unknown> = {}) {
  const handlers = {
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onActivate: vi.fn(),
    onArchivedChange: vi.fn(),
  };
  render(
    <SeasonList seasons={seasons} loading={false} error={null} {...handlers} {...overrides} />,
  );
  return handlers;
}

const rowOf = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

describe("SeasonList", () => {
  it("shows one row per season", () => {
    renderList();

    for (const season of seasons) {
      expect(screen.getByText(season.name)).toBeInTheDocument();
    }
  });

  it.each([
    ["Wintersportwoche 2026", "Aktiv"],
    ["Wintersportwoche 2025", "Archiviert"],
    ["Wintersportwoche 2027", "Inaktiv"],
  ])("shows %s with the state %s", (name, state) => {
    renderList();

    expect(rowOf(name)).toHaveTextContent(state);
  });

  it("tells the teacher when no season exists yet", () => {
    renderList({ seasons: [] });

    expect(screen.getByText(/noch keine saison/i)).toBeInTheDocument();
  });

  it("announces that it is still loading", () => {
    renderList({ seasons: [], loading: true });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText(/noch keine saison/i)).not.toBeInTheDocument();
  });

  it("reports a failed read instead of pretending the list is empty", () => {
    renderList({ seasons: [], error: "Zugriff verweigert" });

    expect(screen.getByRole("alert")).toHaveTextContent(/nicht geladen/i);
    expect(screen.queryByText(/noch keine saison/i)).not.toBeInTheDocument();
  });
});

describe("SeasonList — row actions", () => {
  it("gives every season a delete button", () => {
    renderList();

    for (const season of seasons) {
      expect(
        screen.getByRole("button", { name: `Saison ${season.name} löschen` }),
      ).toBeInTheDocument();
    }
  });

  it.each([["Wintersportwoche 2026"], ["Wintersportwoche 2027"]])(
    "disables deleting %s, because the season is not archived",
    (name) => {
      renderList();

      expect(screen.getByRole("button", { name: `Saison ${name} löschen` })).toBeDisabled();
    },
  );

  it("explains why deleting is unavailable", () => {
    renderList();

    expect(
      screen.getByRole("button", { name: "Saison Wintersportwoche 2026 löschen" }),
    ).toHaveAccessibleDescription(/nur archivierte/i);
  });

  it("allows deleting an archived season", async () => {
    const { onDelete } = renderList();

    await userEvent.click(
      screen.getByRole("button", { name: "Saison Wintersportwoche 2025 löschen" }),
    );

    expect(onDelete).toHaveBeenCalledWith(seasons[1]);
  });

  it("edits the season that was clicked", async () => {
    const { onEdit } = renderList();

    await userEvent.click(
      screen.getByRole("button", { name: "Saison Wintersportwoche 2027 bearbeiten" }),
    );

    expect(onEdit).toHaveBeenCalledWith(seasons[2]);
  });

  it("offers activation for an inactive season", async () => {
    const { onActivate } = renderList();

    await userEvent.click(
      screen.getByRole("button", { name: "Saison Wintersportwoche 2027 aktiv setzen" }),
    );

    expect(onActivate).toHaveBeenCalledWith(seasons[2]);
  });

  it("does not offer activation for the season that is already active", () => {
    renderList();

    expect(
      screen.queryByRole("button", { name: "Saison Wintersportwoche 2026 aktiv setzen" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer activation for an archived season, which cannot be active", () => {
    renderList();

    expect(
      screen.queryByRole("button", { name: "Saison Wintersportwoche 2025 aktiv setzen" }),
    ).not.toBeInTheDocument();
  });

  it("archives a season that is not archived yet", async () => {
    const { onArchivedChange } = renderList();

    await userEvent.click(
      screen.getByRole("button", { name: "Saison Wintersportwoche 2027 archivieren" }),
    );

    expect(onArchivedChange).toHaveBeenCalledWith(seasons[2], true);
  });

  it("unarchives an archived season, so archiving stays reversible", async () => {
    const { onArchivedChange } = renderList();

    await userEvent.click(
      screen.getByRole("button", { name: "Saison Wintersportwoche 2025 wiederherstellen" }),
    );

    expect(onArchivedChange).toHaveBeenCalledWith(seasons[1], false);
  });

  it("links to the events of the season", () => {
    renderList();

    expect(
      screen.getByRole("link", { name: "Events der Saison Wintersportwoche 2026" }),
    ).toHaveAttribute("href", "/app/master-data/seasons/s1");
  });
});

describe("SeasonList — tooltips", () => {
  it.each([
    ["Saison Wintersportwoche 2027 bearbeiten", "Bearbeiten"],
    ["Saison Wintersportwoche 2027 archivieren", "Archivieren"],
    ["Saison Wintersportwoche 2027 aktiv setzen", "Aktiv setzen"],
  ])("explains the %s icon on hover", async (accessibleName, tooltip) => {
    renderList();

    await userEvent.hover(screen.getByRole("button", { name: accessibleName }));

    expect(await screen.findByText(tooltip)).toBeInTheDocument();
  });

  it("explains the events icon, which is a link rather than a button", async () => {
    renderList();

    await userEvent.hover(
      screen.getByRole("link", { name: "Events der Saison Wintersportwoche 2027" }),
    );

    expect(await screen.findByText("Events")).toBeInTheDocument();
  });

  it("labels the restore icon differently from the archive icon", async () => {
    renderList();

    await userEvent.hover(
      screen.getByRole("button", { name: "Saison Wintersportwoche 2025 wiederherstellen" }),
    );

    expect(await screen.findByText("Wiederherstellen")).toBeInTheDocument();
  });

  it("shows a plain label for a season that may be deleted", async () => {
    renderList();

    await userEvent.hover(
      screen.getByRole("button", { name: "Saison Wintersportwoche 2025 löschen" }),
    );

    expect(await screen.findByText("Löschen")).toBeInTheDocument();
  });

  it("explains on hover why deleting is unavailable, which the sr-only hint cannot do", async () => {
    renderList();
    const hint = "Nur archivierte Saisonen können gelöscht werden.";
    // One sr-only copy already exists per non-archived row; hovering adds the visible one.
    const before = screen.getAllByText(hint).length;

    await userEvent.hover(
      screen.getByRole("button", { name: "Saison Wintersportwoche 2026 löschen" }).parentElement!,
    );

    await waitFor(() => expect(screen.getAllByText(hint)).toHaveLength(before + 1));
    expect(screen.getAllByText(hint).some((node) => !node.className.includes("sr-only"))).toBe(
      true,
    );
  });
});
