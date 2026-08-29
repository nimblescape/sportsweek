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
const apiRequest = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => pathname(),
  useRouter: () => ({ push }),
}));
vi.mock("@/lib/event-series/use-event-series", () => ({ useEventSeries: () => eventSeries() }));
vi.mock("@/lib/api/busy", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useBusyWhile: () => {},
}));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const { ApiRequestError } = await import("@/lib/api/client");

const {
  EventSeriesTagRows,
  EVENT_SERIES_ROW_LABEL,
  TEMPLATE_ROW_LABEL,
  OPEN_TO_STUDENTS_LABEL,
  CLOSED_TO_STUDENTS_LABEL,
  TEMPLATE_LABEL,
  openActionLabel,
  closeActionLabel,
} = await import("@/components/layout/event-series-tag-rows");

function seriesNamed(id: string, name: string, overrides = {}) {
  return { id, ...storedEventSeries({ name, ...overrides }) };
}

function showing(...list: ReturnType<typeof seriesNamed>[]) {
  eventSeries.mockReturnValue({ eventSeries: list });
}

describe("EventSeriesTagRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiRequest.mockResolvedValue(undefined);
    pathname.mockReturnValue("/app/s1/report");
    document.cookie = "sportsweek_event_series=; max-age=0; path=/";
  });

  it("puts the series that carry data in their own named row", () => {
    showing(seriesNamed("s1", "Wintersportwoche"), seriesNamed("s2", "Kulturwoche"));

    render(<EventSeriesTagRows />);

    const row = screen.getByRole("group", { name: EVENT_SERIES_ROW_LABEL });
    expect(within(row).getByRole("button", { name: "Wintersportwoche" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Kulturwoche" })).toBeInTheDocument();
  });

  it("puts the templates in a row of their own", () => {
    pathname.mockReturnValue("/app/s1/master-data/classes");
    showing(
      seriesNamed("s1", "Wintersportwoche"),
      seriesNamed("t1", "Wintersportwochen", { isTemplate: true }),
    );

    render(<EventSeriesTagRows />);

    const templates = screen.getByRole("group", { name: TEMPLATE_ROW_LABEL });
    expect(
      within(templates).getByRole("button", { name: "Wintersportwochen" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("group", { name: EVENT_SERIES_ROW_LABEL })).queryByRole("button", {
        name: "Wintersportwochen",
      }),
    ).not.toBeInTheDocument();
  });

  /** A school that never makes one never sees a space set aside for it (US-20). */
  it("leaves the template row out entirely when there are none", () => {
    pathname.mockReturnValue("/app/s1/master-data/classes");
    showing(seriesNamed("s1", "Wintersportwoche"));

    render(<EventSeriesTagRows />);

    expect(screen.queryByRole("group", { name: TEMPLATE_ROW_LABEL })).not.toBeInTheDocument();
  });

  /**
   * A template holds lists and no registrations, so it has nothing an overview, an assignment or
   * a report could show. Only where the lists themselves are maintained is it worth offering.
   */
  it.each(["/app/s1/overview", "/app/s1/assignment", "/app/s1/report"])(
    "offers no template on %s, leaving the series the whole width",
    (path) => {
      pathname.mockReturnValue(path);
      showing(
        seriesNamed("s1", "Wintersportwoche"),
        seriesNamed("t1", "Wintersportwochen", { isTemplate: true }),
      );

      render(<EventSeriesTagRows />);

      expect(screen.queryByRole("group", { name: TEMPLATE_ROW_LABEL })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Wintersportwochen" })).not.toBeInTheDocument();
    },
  );

  it.each(["/app/event-series", "/app/s1/master-data/programs"])(
    "offers the templates on %s, where the lists are maintained",
    (path) => {
      pathname.mockReturnValue(path);
      showing(
        seriesNamed("s1", "Wintersportwoche"),
        seriesNamed("t1", "Wintersportwochen", { isTemplate: true }),
      );

      render(<EventSeriesTagRows />);

      expect(screen.getByRole("group", { name: TEMPLATE_ROW_LABEL })).toBeInTheDocument();
    },
  );

  /** Archived is what takes a series off every screen, the header included (US-19). */
  it("shows an archived series in neither row", () => {
    pathname.mockReturnValue("/app/s1/master-data/classes");
    showing(
      seriesNamed("s1", "Wintersportwoche"),
      seriesNamed("old", "Letztes Jahr", { isArchived: true }),
      seriesNamed("t1", "Vorlage", { isTemplate: true, isArchived: true }),
    );

    render(<EventSeriesTagRows />);

    expect(screen.queryByRole("button", { name: "Letztes Jahr" })).not.toBeInTheDocument();
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

    expect(screen.getByRole("button", { name: "Vorlage" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Wintersportwoche" })).toHaveAttribute(
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

  /** A closed series says so too: silence would read as an icon that failed to load. */
  it("names the closed state as well, so no tag is left saying nothing", () => {
    showing(
      seriesNamed("s1", "Wintersportwoche", { isOpenToStudents: true }),
      seriesNamed("s2", "Kulturwoche"),
    );

    render(<EventSeriesTagRows />);

    expect(screen.getAllByLabelText(CLOSED_TO_STUDENTS_LABEL)).toHaveLength(1);
  });

  /** A template is neither open nor closed — it can never be opened at all (US-22). */
  it("marks a template as one rather than as a door", () => {
    pathname.mockReturnValue("/app/s1/master-data/classes");
    showing(
      seriesNamed("s1", "Wintersportwoche"),
      seriesNamed("t1", "Wintersportwochen", { isTemplate: true }),
    );

    render(<EventSeriesTagRows />);

    expect(screen.getAllByLabelText(TEMPLATE_LABEL)).toHaveLength(1);
    expect(screen.queryAllByLabelText(OPEN_TO_STUDENTS_LABEL)).toHaveLength(0);
  });

  it("re-scopes the page that is open rather than navigating away from it", async () => {
    pathname.mockReturnValue("/app/s1/master-data/classes");
    showing(seriesNamed("s1", "Wintersportwoche"), seriesNamed("s2", "Kulturwoche"));

    render(<EventSeriesTagRows />);
    await userEvent.click(screen.getByRole("button", { name: "Kulturwoche" }));

    expect(push).toHaveBeenCalledWith("/app/s2/master-data/classes");
  });

  it("remembers the selection, so the landing route can restore it", async () => {
    showing(seriesNamed("s1", "Wintersportwoche"), seriesNamed("s2", "Kulturwoche"));

    render(<EventSeriesTagRows />);
    await userEvent.click(screen.getByRole("button", { name: "Kulturwoche" }));

    expect(document.cookie).toContain("sportsweek_event_series=s2");
  });

  /** With none at all there is nothing to choose between, and every view says so for itself. */
  it("renders nothing when there is no event series to select", () => {
    showing();

    const { container } = render(<EventSeriesTagRows />);

    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * Opening registration to students is done on the tag of the series it concerns (US-19, US-29).
 * There is no second control anywhere else — two controls for one decision would be two answers
 * to it — and it is offered only on the tag that is selected, so a press cannot land on the
 * wrong series.
 */
describe("EventSeriesTagRows — opening and closing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiRequest.mockResolvedValue(undefined);
    pathname.mockReturnValue("/app/s1/report");
    document.cookie = "sportsweek_event_series=; max-age=0; path=/";
  });

  it("offers the action on the selected tag and on no other", () => {
    showing(seriesNamed("s1", "Wintersportwoche"), seriesNamed("s2", "Kulturwoche"));

    render(<EventSeriesTagRows />);

    expect(
      screen.getByRole("button", { name: openActionLabel("Wintersportwoche") }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: openActionLabel("Kulturwoche") }),
    ).not.toBeInTheDocument();
  });

  it("offers closing instead while the series is open", () => {
    showing(seriesNamed("s1", "Wintersportwoche", { isOpenToStudents: true }));

    render(<EventSeriesTagRows />);

    expect(
      screen.getByRole("button", { name: closeActionLabel("Wintersportwoche") }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: openActionLabel("Wintersportwoche") }),
    ).not.toBeInTheDocument();
  });

  /** A tag that offers to open what cannot be opened is a tag explaining a refusal (US-22). */
  it("offers no action on a template, which can never be opened", () => {
    pathname.mockReturnValue("/app/t1/master-data/classes");
    showing(seriesNamed("t1", "Vorlage", { isTemplate: true }));

    render(<EventSeriesTagRows />);

    expect(
      screen.queryByRole("button", { name: openActionLabel("Vorlage") }),
    ).not.toBeInTheDocument();
  });

  it("opens the series when the action is pressed", async () => {
    showing(seriesNamed("s1", "Wintersportwoche"));

    render(<EventSeriesTagRows />);
    await userEvent.click(
      screen.getByRole("button", { name: openActionLabel("Wintersportwoche") }),
    );

    expect(apiRequest).toHaveBeenCalledWith("/api/event-series/s1", {
      method: "PATCH",
      body: { isOpenToStudents: true },
    });
  });

  it("closes it again when pressed while open", async () => {
    showing(seriesNamed("s1", "Wintersportwoche", { isOpenToStudents: true }));

    render(<EventSeriesTagRows />);
    await userEvent.click(
      screen.getByRole("button", { name: closeActionLabel("Wintersportwoche") }),
    );

    expect(apiRequest).toHaveBeenCalledWith("/api/event-series/s1", {
      method: "PATCH",
      body: { isOpenToStudents: false },
    });
  });

  /** The tag is already the selected one, so the action has no series to move to. */
  it("does not navigate when the action rather than the name is pressed", async () => {
    showing(seriesNamed("s1", "Wintersportwoche"));

    render(<EventSeriesTagRows />);
    await userEvent.click(
      screen.getByRole("button", { name: openActionLabel("Wintersportwoche") }),
    );

    expect(push).not.toHaveBeenCalled();
  });

  /**
   * A series with no class has nobody to invite, so the server refuses (US-19). The header is
   * where the press happened, so it is where the answer has to appear.
   */
  it("says what the server said when the change is refused", async () => {
    apiRequest.mockRejectedValue(new ApiRequestError("Ohne Klasse geht das nicht."));
    showing(seriesNamed("s1", "Wintersportwoche"));

    render(<EventSeriesTagRows />);
    await userEvent.click(
      screen.getByRole("button", { name: openActionLabel("Wintersportwoche") }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Ohne Klasse geht das nicht.");
  });
});
