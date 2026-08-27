/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EventSeriesList } from "@/components/event-series/event-series-list";

const allEventSeries = [
  {
    id: "s1",
    name: "Wintersportwoche 2026",
    isActive: true,
    isArchived: false,
    hasRegistrations: true,
    position: 0,
  },
  {
    id: "s2",
    name: "Wintersportwoche 2025",
    isActive: false,
    isArchived: true,
    hasRegistrations: true,
    position: 0,
  },
  {
    id: "s3",
    name: "Wintersportwoche 2027",
    isActive: false,
    isArchived: false,
    hasRegistrations: true,
    position: 0,
  },
  {
    id: "s4",
    name: "Wintersportwoche 2024",
    isActive: false,
    isArchived: false,
    hasRegistrations: false,
    position: 0,
  },
];

function renderList(overrides: Record<string, unknown> = {}) {
  const handlers = {
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onActiveChange: vi.fn(),
    onArchivedChange: vi.fn(),
    onReorder: vi.fn(),
  };
  render(
    <EventSeriesList
      eventSeries={allEventSeries}
      loading={false}
      error={null}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

const rowOf = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

describe("EventSeriesList", () => {
  it("shows one row per event series", () => {
    renderList();

    for (const eventSeries of allEventSeries) {
      expect(screen.getByText(eventSeries.name)).toBeInTheDocument();
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

  it("tells the teacher when no event series exists yet", () => {
    renderList({ eventSeries: [] });

    expect(screen.getByText(/noch keine eventreihe/i)).toBeInTheDocument();
  });

  /** The header spinner answers for the wait, so the list itself says nothing at all. */
  it("shows nothing while it is still loading, rather than an empty list", () => {
    renderList({ eventSeries: [], loading: true });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/noch keine eventreihe/i)).not.toBeInTheDocument();
  });

  it("reports a failed read instead of pretending the list is empty", () => {
    renderList({ eventSeries: [], error: "Zugriff verweigert" });

    expect(screen.getByRole("alert")).toHaveTextContent(/nicht geladen/i);
    expect(screen.queryByText(/noch keine eventreihe/i)).not.toBeInTheDocument();
  });
});

describe("EventSeriesList — row actions", () => {
  it("gives every event series a delete button", () => {
    renderList();

    for (const eventSeries of allEventSeries) {
      expect(
        screen.getByRole("button", { name: `Eventreihe ${eventSeries.name} löschen` }),
      ).toBeInTheDocument();
    }
  });

  it.each([["Wintersportwoche 2026"], ["Wintersportwoche 2027"]])(
    "disables deleting %s, because it still has registrations and is not archived",
    (name) => {
      renderList();

      expect(screen.getByRole("button", { name: `Eventreihe ${name} löschen` })).toBeDisabled();
    },
  );

  it("explains why deleting is unavailable", () => {
    renderList();

    expect(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2026 löschen" }),
    ).toHaveAccessibleDescription(/anmeldungen/i);
  });

  it("allows deleting an archived event series, even though it still has registrations", async () => {
    const { onDelete } = renderList();

    await userEvent.click(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2025 löschen" }),
    );

    expect(onDelete).toHaveBeenCalledWith(allEventSeries[1]);
  });

  it("allows deleting an unarchived event series that has no registrations", async () => {
    const { onDelete } = renderList();

    expect(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2024 löschen" }),
    ).not.toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2024 löschen" }),
    );

    expect(onDelete).toHaveBeenCalledWith(allEventSeries[3]);
  });

  it("edits the event series that was clicked", async () => {
    const { onEdit } = renderList();

    await userEvent.click(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2027 bearbeiten" }),
    );

    expect(onEdit).toHaveBeenCalledWith(allEventSeries[2]);
  });

  it("offers activation for an inactive event series", async () => {
    const { onActiveChange } = renderList();

    await userEvent.click(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2027 aktiv setzen" }),
    );

    expect(onActiveChange).toHaveBeenCalledWith(allEventSeries[2], true);
  });

  it("offers deactivation for the active event series, so no event series can be active at all", async () => {
    const { onActiveChange } = renderList();

    await userEvent.click(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2026 deaktivieren" }),
    );

    expect(onActiveChange).toHaveBeenCalledWith(allEventSeries[0], false);
  });

  it("does not offer activation for the event series that is already active", () => {
    renderList();

    expect(
      screen.queryByRole("button", { name: "Eventreihe Wintersportwoche 2026 aktiv setzen" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer deactivation for an event series that is not active", () => {
    renderList();

    expect(
      screen.queryByRole("button", { name: "Eventreihe Wintersportwoche 2027 deaktivieren" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer activation for an archived event series, which cannot be active", () => {
    renderList();

    expect(
      screen.queryByRole("button", { name: "Eventreihe Wintersportwoche 2025 aktiv setzen" }),
    ).not.toBeInTheDocument();
  });

  it("archives an event series that is not archived yet", async () => {
    const { onArchivedChange } = renderList();

    await userEvent.click(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2027 archivieren" }),
    );

    expect(onArchivedChange).toHaveBeenCalledWith(allEventSeries[2], true);
  });

  it("unarchives an archived event series, so archiving stays reversible", async () => {
    const { onArchivedChange } = renderList();

    await userEvent.click(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2025 wiederherstellen" }),
    );

    expect(onArchivedChange).toHaveBeenCalledWith(allEventSeries[1], false);
  });

  it("offers no rename for an archived event series, which is signed off rather than edited", () => {
    renderList();

    expect(
      screen.queryByRole("button", { name: "Eventreihe Wintersportwoche 2025 bearbeiten" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2026 bearbeiten" }),
    ).toBeInTheDocument();
  });

  it("disables archiving the active event series, which must be deactivated first", () => {
    renderList();

    expect(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2026 archivieren" }),
    ).toBeDisabled();
  });

  it("explains why archiving the active event series is unavailable", () => {
    renderList();

    expect(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2026 archivieren" }),
    ).toHaveAccessibleDescription(/zuerst deaktiviert/i);
  });

  it("disables archiving an event series with no registrations", () => {
    renderList();

    expect(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2024 archivieren" }),
    ).toBeDisabled();
  });

  it("explains why archiving an event series with no registrations is unavailable", () => {
    renderList();

    expect(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2024 archivieren" }),
    ).toHaveAccessibleDescription(/anmeldungen/i);
  });

  it("allows unarchiving an event series with no registrations, since that rule only gates archiving", () => {
    renderList({
      eventSeries: [
        {
          id: "s5",
          name: "Wintersportwoche 2023",
          isActive: false,
          isArchived: true,
          hasRegistrations: false,
          position: 0,
        },
      ],
    });

    expect(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2023 wiederherstellen" }),
    ).not.toBeDisabled();
  });

  it("links to the events of the event series", () => {
    renderList();

    expect(
      screen.getByRole("link", { name: "Events der Eventreihe Wintersportwoche 2026" }),
    ).toHaveAttribute("href", "/app/master-data/event-series/s1");
  });
});

// Everything on a row acts on the same event series, so while one control is waiting for its round
// trip the rest must not offer a second action against an event series the first one is removing.
describe("EventSeriesList — while a row is busy", () => {
  const busy = { busyEventSeriesId: "s1" };

  it.each([
    ["Eventreihe Wintersportwoche 2026 deaktivieren"],
    ["Eventreihe Wintersportwoche 2026 bearbeiten"],
    ["Eventreihe Wintersportwoche 2026 löschen"],
    ["Eventreihe Wintersportwoche 2026 archivieren"],
  ])("locks the %s button", (accessibleName) => {
    renderList(busy);

    expect(screen.getByRole("button", { name: accessibleName })).toBeDisabled();
  });

  it("locks the events link, which a disabled button would not cover", async () => {
    renderList(busy);
    const link = screen.getByRole("link", { name: "Events der Eventreihe Wintersportwoche 2026" });

    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).toHaveAttribute("tabindex", "-1");

    await userEvent.click(link);
    expect(window.location.pathname).not.toBe("/app/master-data/event-series/s1");
  });

  it("locks the drag handle, so the row cannot be reordered mid-write", () => {
    renderList(busy);

    expect(
      screen.getByRole("button", { name: "Wintersportwoche 2026 verschieben" }),
    ).toBeDisabled();
  });

  it("leaves every other row alone", () => {
    renderList(busy);

    expect(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2027 bearbeiten" }),
    ).not.toBeDisabled();
    expect(
      screen.getByRole("link", { name: "Events der Eventreihe Wintersportwoche 2027" }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });
});

describe("EventSeriesList — tooltips", () => {
  it.each([
    ["Eventreihe Wintersportwoche 2027 bearbeiten", "Bearbeiten"],
    ["Eventreihe Wintersportwoche 2027 archivieren", "Archivieren"],
    ["Eventreihe Wintersportwoche 2027 aktiv setzen", "Aktiv setzen"],
    ["Eventreihe Wintersportwoche 2026 deaktivieren", "Deaktivieren"],
  ])("explains the %s icon on hover", async (accessibleName, tooltip) => {
    renderList();

    await userEvent.hover(screen.getByRole("button", { name: accessibleName }));

    expect(await screen.findByText(tooltip)).toBeInTheDocument();
  });

  it("explains the events icon, which is a link rather than a button", async () => {
    renderList();

    await userEvent.hover(
      screen.getByRole("link", { name: "Events der Eventreihe Wintersportwoche 2027" }),
    );

    expect(await screen.findByText("Events")).toBeInTheDocument();
  });

  it("labels the restore icon differently from the archive icon", async () => {
    renderList();

    await userEvent.hover(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2025 wiederherstellen" }),
    );

    expect(await screen.findByText("Wiederherstellen")).toBeInTheDocument();
  });

  it("shows a plain label for an event series that may be deleted", async () => {
    renderList();

    await userEvent.hover(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2025 löschen" }),
    );

    expect(await screen.findByText("Löschen")).toBeInTheDocument();
  });

  it("explains on hover why deleting is unavailable, which the sr-only hint cannot do", async () => {
    renderList();
    const hint =
      "Eine Eventreihe mit Anmeldungen kann nur gelöscht werden, wenn sie archiviert ist.";
    // One sr-only copy already exists per disabled row; hovering adds the visible one.
    const before = screen.getAllByText(hint).length;

    await userEvent.hover(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2026 löschen" })
        .parentElement!,
    );

    await waitFor(() => expect(screen.getAllByText(hint)).toHaveLength(before + 1));
    expect(screen.getAllByText(hint).some((node) => !node.className.includes("sr-only"))).toBe(
      true,
    );
  });

  it("explains on hover why the active event series cannot be archived", async () => {
    renderList();
    const hint =
      "Eine aktive Eventreihe muss zuerst deaktiviert werden, damit sie archiviert werden kann.";
    const before = screen.getAllByText(hint).length;

    await userEvent.hover(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2026 archivieren" })
        .parentElement!,
    );

    await waitFor(() => expect(screen.getAllByText(hint)).toHaveLength(before + 1));
    expect(screen.getAllByText(hint).some((node) => !node.className.includes("sr-only"))).toBe(
      true,
    );
  });

  it("explains on hover why an event series without registrations cannot be archived", async () => {
    renderList();
    const hint = "Eine Eventreihe ohne Anmeldungen kann nicht archiviert werden.";
    const before = screen.getAllByText(hint).length;

    await userEvent.hover(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2024 archivieren" })
        .parentElement!,
    );

    await waitFor(() => expect(screen.getAllByText(hint)).toHaveLength(before + 1));
    expect(screen.getAllByText(hint).some((node) => !node.className.includes("sr-only"))).toBe(
      true,
    );
  });
});
