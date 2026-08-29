/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { storedEventSeries } from "@/test/event-series";
import { EventSeriesList } from "@/components/event-series/event-series-list";

const allEventSeries = [
  { id: "s1", ...storedEventSeries({ name: "Wintersportwoche 2026", isOpenToStudents: true, hasRegistrations: true }) }, // prettier-ignore
  { id: "s2", ...storedEventSeries({ name: "Wintersportwoche 2025", isArchived: true, hasRegistrations: true }) }, // prettier-ignore
  { id: "s3", ...storedEventSeries({ name: "Wintersportwoche 2027", hasRegistrations: true }) },
  { id: "s4", ...storedEventSeries({ name: "Wintersportwoche 2024" }) },
  { id: "s5", ...storedEventSeries({ name: "Wintersportwochen", isTemplate: true }) },
];

function renderList(overrides: Record<string, unknown> = {}) {
  const handlers = {
    onEdit: vi.fn(),
    onDelete: vi.fn(),
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
    ["Wintersportwoche 2026", "Schüler:innen-Anmeldung offen"],
    ["Wintersportwoche 2025", "Archiviert"],
    ["Wintersportwoche 2027", "Schüler:innen-Anmeldung geschlossen"],
    ["Wintersportwochen", "Vorlage"],
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

  /** Every teacher view is scoped to a selection, so the last one has to stay (US-19, US-22). */
  it("disables deleting the only unarchived template, and says why", () => {
    renderList();

    const control = screen.getByRole("button", { name: "Eventreihe Wintersportwochen löschen" });

    expect(control).toBeDisabled();
    expect(control).toHaveAccessibleDescription(/letzte vorlage/i);
  });

  it("allows deleting a template while another one remains", () => {
    renderList({
      eventSeries: [
        ...allEventSeries,
        { id: "s6", ...storedEventSeries({ name: "Sommersportwochen", isTemplate: true }) },
      ],
    });

    expect(
      screen.getByRole("button", { name: "Eventreihe Wintersportwochen löschen" }),
    ).not.toBeDisabled();
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

  /** Opening a series is the invitation link's doing, on the overview page (US-23, US-29). */
  it("offers no way to open or close a series to students", () => {
    renderList();

    expect(screen.queryByRole("button", { name: /freischalten|aktiv/i })).not.toBeInTheDocument();
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
          ...storedEventSeries({
            name: "Wintersportwoche 2023",
            isArchived: true,
            hasRegistrations: false,
          }),
        },
      ],
    });

    expect(
      screen.getByRole("button", { name: "Eventreihe Wintersportwoche 2023 wiederherstellen" }),
    ).not.toBeDisabled();
  });

  /** The header rows are the only way to choose what is scoped (US-20), so no row links inward. */
  it("offers no link into a series, which is chosen from the header instead", () => {
    renderList();

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

// Everything on a row acts on the same event series, so while one control is waiting for its round
// trip the rest must not offer a second action against an event series the first one is removing.
describe("EventSeriesList — while a row is busy", () => {
  const busy = { busyEventSeriesId: "s1" };

  it.each([
    ["Eventreihe Wintersportwoche 2026 bearbeiten"],
    ["Eventreihe Wintersportwoche 2026 löschen"],
    ["Eventreihe Wintersportwoche 2026 archivieren"],
  ])("locks the %s button", (accessibleName) => {
    renderList(busy);

    expect(screen.getByRole("button", { name: accessibleName })).toBeDisabled();
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
  });
});

describe("EventSeriesList — tooltips", () => {
  it.each([
    ["Eventreihe Wintersportwoche 2027 bearbeiten", "Bearbeiten"],
    ["Eventreihe Wintersportwoche 2027 archivieren", "Archivieren"],
  ])("explains the %s icon on hover", async (accessibleName, tooltip) => {
    renderList();

    await userEvent.hover(screen.getByRole("button", { name: accessibleName }));

    expect(await screen.findByText(tooltip)).toBeInTheDocument();
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

  it("explains on hover why the archive icon is unavailable, which the sr-only hint cannot do", async () => {
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
