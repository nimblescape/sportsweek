/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { storedEventSeries } from "@/test/event-series";

const push = vi.fn();
const pathname = vi.fn(() => "/app/s1/report");
const eventSeries = vi.fn<() => { eventSeries: unknown[] }>(() => ({ eventSeries: [] }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathname(),
  useRouter: () => ({ push }),
}));
vi.mock("@/lib/event-series/use-event-series", () => ({ useEventSeries: () => eventSeries() }));

const { EventSeriesTagRows, EVENT_SERIES_ROW_LABEL, TEMPLATE_ROW_LABEL, OPEN_TO_STUDENTS_LABEL } =
  await import("@/components/layout/event-series-tag-rows");

function seriesNamed(id: string, name: string, overrides = {}) {
  return { id, ...storedEventSeries({ name, ...overrides }) };
}

function showing(...list: ReturnType<typeof seriesNamed>[]) {
  eventSeries.mockReturnValue({ eventSeries: list });
}

describe("EventSeriesTagRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname.mockReturnValue("/app/s1/report");
    document.cookie = "sportsweek_event_series=; max-age=0; path=/";
  });

  it("puts the series that carry data in their own named row", () => {
    showing(seriesNamed("s1", "Wintersportwoche"), seriesNamed("s2", "Kulturwoche"));

    render(<EventSeriesTagRows />);

    const row = screen.getByRole("group", { name: EVENT_SERIES_ROW_LABEL });
    expect(within(row).getByRole("button", { name: /Wintersportwoche/ })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: /Kulturwoche/ })).toBeInTheDocument();
  });

  it("puts the templates in a row of their own", () => {
    showing(
      seriesNamed("s1", "Wintersportwoche"),
      seriesNamed("t1", "Wintersportwochen", { isTemplate: true }),
    );

    render(<EventSeriesTagRows />);

    const templates = screen.getByRole("group", { name: TEMPLATE_ROW_LABEL });
    expect(
      within(templates).getByRole("button", { name: /Wintersportwochen/ }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: EVENT_SERIES_ROW_LABEL })).queryByRole("button", {
        name: /Wintersportwochen/,
      }),
    ).not.toBeInTheDocument();
  });

  /** A school that never makes one never sees a space set aside for it (US-20). */
  it("leaves the template row out entirely when there are none", () => {
    showing(seriesNamed("s1", "Wintersportwoche"));

    render(<EventSeriesTagRows />);

    expect(screen.queryByRole("group", { name: TEMPLATE_ROW_LABEL })).not.toBeInTheDocument();
  });

  /** Archived is what takes a series off every screen, the header included (US-19). */
  it("shows an archived series in neither row", () => {
    showing(
      seriesNamed("s1", "Wintersportwoche"),
      seriesNamed("old", "Letztes Jahr", { isArchived: true }),
      seriesNamed("t1", "Vorlage", { isTemplate: true, isArchived: true }),
    );

    render(<EventSeriesTagRows />);

    expect(screen.queryByRole("button", { name: /Letztes Jahr/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: TEMPLATE_ROW_LABEL })).not.toBeInTheDocument();
  });

  it("presses exactly one tag across both rows, since exactly one thing is scoped", () => {
    showing(
      seriesNamed("s1", "Wintersportwoche"),
      seriesNamed("s2", "Kulturwoche"),
      seriesNamed("t1", "Vorlage", { isTemplate: true }),
    );

    render(<EventSeriesTagRows />);

    const pressed = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveTextContent("Wintersportwoche");
  });

  it("marks a selected template instead when the URL names one", () => {
    pathname.mockReturnValue("/app/t1/master-data/classes");
    showing(
      seriesNamed("s1", "Wintersportwoche"),
      seriesNamed("t1", "Vorlage", { isTemplate: true }),
    );

    render(<EventSeriesTagRows />);

    expect(screen.getByRole("button", { name: /Vorlage/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Wintersportwoche/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  /** Several may be open at once, which is precisely the state that is easy to lose track of. */
  it("names the open state on the tag rather than leaving it to sight", () => {
    showing(
      seriesNamed("s1", "Wintersportwoche", { isOpenToStudents: true }),
      seriesNamed("s2", "Kulturwoche"),
    );

    render(<EventSeriesTagRows />);

    expect(screen.getByLabelText(OPEN_TO_STUDENTS_LABEL)).toBeInTheDocument();
    expect(screen.getAllByLabelText(OPEN_TO_STUDENTS_LABEL)).toHaveLength(1);
  });

  it("re-scopes the page that is open rather than navigating away from it", async () => {
    pathname.mockReturnValue("/app/s1/master-data/classes");
    showing(seriesNamed("s1", "Wintersportwoche"), seriesNamed("s2", "Kulturwoche"));

    render(<EventSeriesTagRows />);
    await userEvent.click(screen.getByRole("button", { name: /Kulturwoche/ }));

    expect(push).toHaveBeenCalledWith("/app/s2/master-data/classes");
  });

  it("remembers the selection, so the landing route can restore it", async () => {
    showing(seriesNamed("s1", "Wintersportwoche"), seriesNamed("s2", "Kulturwoche"));

    render(<EventSeriesTagRows />);
    await userEvent.click(screen.getByRole("button", { name: /Kulturwoche/ }));

    expect(document.cookie).toContain("sportsweek_event_series=s2");
  });

  /** With none at all there is nothing to choose between, and every view says so for itself. */
  it("renders nothing when there is no event series to select", () => {
    showing();

    const { container } = render(<EventSeriesTagRows />);

    expect(container).toBeEmptyDOMElement();
  });
});
