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
  OPEN_TO_STUDENTS_LABEL,
  CLOSED_TO_STUDENTS_LABEL,
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

  it("puts every live series in one named row", () => {
    showing(seriesNamed("s1", "Wintersportwoche"), seriesNamed("s2", "Kulturwoche"));

    render(<EventSeriesTagRows mayOpen />);

    const row = screen.getByRole("group", { name: EVENT_SERIES_ROW_LABEL });
    expect(within(row).getByRole("button", { name: "Wintersportwoche" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Kulturwoche" })).toBeInTheDocument();
  });

  /** Every page can be about every series, so the row is the same wherever the teacher is. */
  it.each([
    "/app/s1/registrations",
    "/app/s1/assignment",
    "/app/s1/report",
    "/app/s1/master-data/programs",
    "/app/event-series",
  ])("offers the same row on %s", (path) => {
    pathname.mockReturnValue(path);
    showing(seriesNamed("s1", "Wintersportwoche"), seriesNamed("s2", "Kulturwoche"));

    render(<EventSeriesTagRows mayOpen />);

    const row = screen.getByRole("group", { name: EVENT_SERIES_ROW_LABEL });
    expect(within(row).getByRole("button", { name: "Wintersportwoche" })).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Kulturwoche" })).toBeInTheDocument();
  });

  /** Archived is what takes a series off every screen, the header included (US-19). */
  it("shows an archived series in no row at all", () => {
    showing(
      seriesNamed("s1", "Wintersportwoche"),
      seriesNamed("old", "Letztes Jahr", { isArchived: true }),
    );

    render(<EventSeriesTagRows mayOpen />);

    expect(screen.queryByRole("button", { name: "Letztes Jahr" })).not.toBeInTheDocument();
  });

  it("presses exactly one tag, since exactly one thing is scoped", () => {
    showing(
      seriesNamed("s1", "Wintersportwoche"),
      seriesNamed("s2", "Kulturwoche"),
      seriesNamed("s3", "Projektwoche"),
    );

    render(<EventSeriesTagRows mayOpen />);

    const pressed = screen
      .getAllByRole("button")
      .filter((button) => button.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0]).toHaveTextContent("Wintersportwoche");
  });

  it("marks whichever series the URL names", () => {
    pathname.mockReturnValue("/app/s2/master-data/classes");
    showing(seriesNamed("s1", "Wintersportwoche"), seriesNamed("s2", "Kulturwoche"));

    render(<EventSeriesTagRows mayOpen />);

    expect(screen.getByRole("button", { name: "Kulturwoche" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
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

    render(<EventSeriesTagRows mayOpen />);

    expect(screen.getByLabelText(OPEN_TO_STUDENTS_LABEL)).toBeInTheDocument();
    expect(screen.getAllByLabelText(OPEN_TO_STUDENTS_LABEL)).toHaveLength(1);
  });

  /** A closed series says so too: silence would read as an icon that failed to load. */
  it("names the closed state as well, so no tag is left saying nothing", () => {
    showing(
      seriesNamed("s1", "Wintersportwoche", { isOpenToStudents: true }),
      seriesNamed("s2", "Kulturwoche"),
    );

    render(<EventSeriesTagRows mayOpen />);

    expect(screen.getAllByLabelText(CLOSED_TO_STUDENTS_LABEL)).toHaveLength(1);
  });

  it("re-scopes the page that is open rather than navigating away from it", async () => {
    pathname.mockReturnValue("/app/s1/master-data/classes");
    showing(seriesNamed("s1", "Wintersportwoche"), seriesNamed("s2", "Kulturwoche"));

    render(<EventSeriesTagRows mayOpen />);
    await userEvent.click(screen.getByRole("button", { name: "Kulturwoche" }));

    expect(push).toHaveBeenCalledWith("/app/s2/master-data/classes");
  });

  it("remembers the selection, so the landing route can restore it", async () => {
    showing(seriesNamed("s1", "Wintersportwoche"), seriesNamed("s2", "Kulturwoche"));

    render(<EventSeriesTagRows mayOpen />);
    await userEvent.click(screen.getByRole("button", { name: "Kulturwoche" }));

    expect(document.cookie).toContain("sportsweek_event_series=s2");
  });

  /** With none at all there is nothing to choose between, and every view says so for itself. */
  it("renders nothing when there is no event series to select", () => {
    showing();

    const { container } = render(<EventSeriesTagRows mayOpen />);

    expect(container).toBeEmptyDOMElement();
  });
});

/**
 * Two colours and no more: the accent for the series being worked in, and the plain outline for
 * every other. Whether a series is open is said by its icon, not by its fill, so the row carries
 * one question at a time.
 */
describe("EventSeriesTagRows — colour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname.mockReturnValue("/app/s1/report");
    document.cookie = "sportsweek_event_series=; max-age=0; path=/";
  });

  const tagFor = (name: string) =>
    screen.getByRole("button", { name }).closest('[data-slot="tag"]')!.className;

  it("fills the selected series with the accent", () => {
    showing(seriesNamed("s1", "Wintersportwoche"));

    render(<EventSeriesTagRows mayOpen />);

    expect(tagFor("Wintersportwoche")).toContain("bg-primary");
  });

  it("leaves an unselected tag with the plain outline", () => {
    showing(seriesNamed("s1", "Wintersportwoche"), seriesNamed("s2", "Kulturwoche"));

    render(<EventSeriesTagRows mayOpen />);

    expect(tagFor("Kulturwoche")).toContain("bg-background");
  });

  /** Open is said by the door on the tag; a second colour for it would say it twice. */
  it("gives an open series no colour of its own once it is not the selected one", () => {
    showing(
      seriesNamed("s1", "Wintersportwoche"),
      seriesNamed("s2", "Kulturwoche", { isOpenToStudents: true }),
      seriesNamed("s3", "Projektwoche"),
    );

    render(<EventSeriesTagRows mayOpen />);

    expect(tagFor("Kulturwoche")).toBe(tagFor("Projektwoche"));
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

    render(<EventSeriesTagRows mayOpen />);

    expect(
      screen.getByRole("button", { name: openActionLabel("Wintersportwoche") }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: openActionLabel("Kulturwoche") }),
    ).not.toBeInTheDocument();
  });

  it("offers closing instead while the series is open", () => {
    showing(seriesNamed("s1", "Wintersportwoche", { isOpenToStudents: true }));

    render(<EventSeriesTagRows mayOpen />);

    expect(
      screen.getByRole("button", { name: closeActionLabel("Wintersportwoche") }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: openActionLabel("Wintersportwoche") }),
    ).not.toBeInTheDocument();
  });

  it("opens the series when the action is pressed", async () => {
    showing(seriesNamed("s1", "Wintersportwoche"));

    render(<EventSeriesTagRows mayOpen />);
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

    render(<EventSeriesTagRows mayOpen />);
    await userEvent.click(
      screen.getByRole("button", { name: closeActionLabel("Wintersportwoche") }),
    );

    expect(apiRequest).toHaveBeenCalledWith("/api/event-series/s1", {
      method: "PATCH",
      body: { isOpenToStudents: false },
    });
  });

  /**
   * Opening a series is what lets registrations arrive, so it goes with the permission that
   * edits them. Without it the control is absent rather than offered and refused (US-2).
   */
  it("offers no way to open or close it without the permission", () => {
    showing(seriesNamed("s1", "Wintersportwoche"));

    render(<EventSeriesTagRows />);

    expect(
      screen.queryByRole("button", { name: openActionLabel("Wintersportwoche") }),
    ).not.toBeInTheDocument();
  });

  it("still names which series is selected, and whether it is open", () => {
    showing(seriesNamed("s1", "Wintersportwoche", { isOpenToStudents: true }));

    render(<EventSeriesTagRows />);

    expect(screen.getByRole("button", { name: "Wintersportwoche" })).toBeInTheDocument();
    expect(screen.getAllByLabelText(OPEN_TO_STUDENTS_LABEL).length).toBeGreaterThan(0);
  });

  /** The tag is already the selected one, so the action has no series to move to. */
  it("does not navigate when the action rather than the name is pressed", async () => {
    showing(seriesNamed("s1", "Wintersportwoche"));

    render(<EventSeriesTagRows mayOpen />);
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

    render(<EventSeriesTagRows mayOpen />);
    await userEvent.click(
      screen.getByRole("button", { name: openActionLabel("Wintersportwoche") }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Ohne Klasse geht das nicht.");
  });

  /** An icon on its own says nothing to a teacher who has not met it before (US-19). */
  it("says on hover what the icon would do", async () => {
    showing(seriesNamed("s1", "Wintersportwoche"));

    render(<EventSeriesTagRows mayOpen />);
    await userEvent.hover(
      screen.getByRole("button", { name: openActionLabel("Wintersportwoche") }),
    );

    expect(await screen.findByText(openActionLabel("Wintersportwoche"))).toBeInTheDocument();
  });

  it("says closing instead once the series is open", async () => {
    showing(seriesNamed("s1", "Wintersportwoche", { isOpenToStudents: true }));

    render(<EventSeriesTagRows mayOpen />);
    await userEvent.hover(
      screen.getByRole("button", { name: closeActionLabel("Wintersportwoche") }),
    );

    expect(await screen.findByText(closeActionLabel("Wintersportwoche"))).toBeInTheDocument();
  });
});

/**
 * The door says whether students can register, and the name is truncated where it is long. Both
 * say on hover what they already say to a screen reader (US-19, US-20).
 */
describe("EventSeriesTagRows — what a tag says on hover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname.mockReturnValue("/app/s1/report");
    document.cookie = "sportsweek_event_series=; max-age=0; path=/";
  });

  it("says a series is open", async () => {
    showing(seriesNamed("s1", "Wintersportwoche", { isOpenToStudents: true }));

    render(<EventSeriesTagRows mayOpen />);
    await userEvent.hover(screen.getByLabelText(OPEN_TO_STUDENTS_LABEL));

    expect(await screen.findByText(OPEN_TO_STUDENTS_LABEL)).toBeInTheDocument();
  });

  it("says a series is closed", async () => {
    showing(seriesNamed("s1", "Wintersportwoche"));

    render(<EventSeriesTagRows mayOpen />);
    await userEvent.hover(screen.getByLabelText(CLOSED_TO_STUDENTS_LABEL));

    expect(await screen.findByText(CLOSED_TO_STUDENTS_LABEL)).toBeInTheDocument();
  });

  /** A long name is truncated to keep the row on one line, so hovering is how it is read whole. */
  /** The state is what the tag reports, so hovering anywhere on it gives the same answer. */
  it.each([
    [true, OPEN_TO_STUDENTS_LABEL],
    [false, CLOSED_TO_STUDENTS_LABEL],
  ])("says the state on the name too when open is %s", async (isOpenToStudents, label) => {
    showing(seriesNamed("s1", "Wintersportwoche", { isOpenToStudents }));

    render(<EventSeriesTagRows mayOpen />);
    await userEvent.hover(screen.getByRole("button", { name: "Wintersportwoche" }));

    expect(
      await screen.findByText(label, { selector: "[data-slot='tooltip-popup']" }),
    ).toBeInTheDocument();
  });
});
