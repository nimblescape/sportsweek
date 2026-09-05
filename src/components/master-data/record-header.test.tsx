/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { RecordHeader, RECORD_TABS_LABEL } = await import("./record-header");

const TRAIL = [
  { label: "Stammdaten", href: "/app/event-series" },
  { label: "Eventreihen", href: "/app/event-series" },
  { label: "Wintersportwoche", href: "/app/event-series/s1/classes" },
];

const TABS = [
  {
    key: "classes",
    label: "Klassen",
    href: "/app/event-series/s1/classes",
    addLabel: "Neue Klasse",
  },
  { key: "events", label: "Events", href: "/app/event-series/s1/events", addLabel: "Neues Event" },
];

const setup = (overrides: Partial<Parameters<typeof RecordHeader>[0]> = {}) =>
  render(
    <RecordHeader
      trail={TRAIL}
      title="Wintersportwoche"
      tabs={TABS}
      marked="classes"
      onAdd={vi.fn()}
      {...overrides}
    />,
  );

describe("RecordHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("names the record it is about, and the path down to it", () => {
    setup();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Wintersportwoche");
    expect(screen.getByRole("navigation", { name: "Pfad" })).toBeInTheDocument();
  });

  it("offers one tag per child collection of the record", () => {
    setup();

    const row = screen.getByRole("group", { name: RECORD_TABS_LABEL });

    expect(row).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Klassen" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Events" })).toHaveAttribute("aria-pressed", "false");
  });

  it("opens the collection a tag names when it is pressed", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Events" }));

    expect(push).toHaveBeenCalledWith("/app/event-series/s1/events");
  });

  /** The marked tag is already open, so pressing it does what its control does. */
  it("adds to the marked collection when its own tag is pressed", async () => {
    const onAdd = vi.fn();
    setup({ onAdd });

    await userEvent.click(screen.getByRole("button", { name: "Klassen" }));

    expect(onAdd).toHaveBeenCalledOnce();
    expect(push).not.toHaveBeenCalled();
  });

  /** The control's accessible name is the collection's own wording, not one shared word. */
  it("carries the add control on the marked tag alone, worded as that collection", () => {
    setup();

    expect(screen.getByRole("button", { name: "Neue Klasse" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Neues Event" })).not.toBeInTheDocument();
  });

  it("moves the add control with the mark", () => {
    setup({ marked: "events" });

    expect(screen.getByRole("button", { name: "Neues Event" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Neue Klasse" })).not.toBeInTheDocument();
  });

  it("asks the screen to add, rather than deciding how a name is taken", async () => {
    const onAdd = vi.fn();
    setup({ onAdd });

    await userEvent.click(screen.getByRole("button", { name: "Neue Klasse" }));

    expect(onAdd).toHaveBeenCalledOnce();
  });

  /** A row of one tag is the same row with fewer tags — the root, and the equipment leaf. */
  it("draws a row of one tag", () => {
    setup({
      tabs: [
        {
          key: "event-series",
          label: "Eventreihen",
          href: "/app/event-series",
          addLabel: "Neue Eventreihe",
        },
      ],
      marked: "event-series",
      title: "Stammdaten",
    });

    expect(screen.getByRole("button", { name: "Eventreihen" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Neue Eventreihe" })).toBeInTheDocument();
  });

  it("holds every tag while a write of the screen's is out", () => {
    setup({ disabled: true });

    expect(screen.getByRole("button", { name: "Events" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Neue Klasse" })).toBeDisabled();
  });
});
