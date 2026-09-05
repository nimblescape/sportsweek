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
    <RecordHeader trail={TRAIL} tabs={TABS} marked="classes" onAdd={vi.fn()} {...overrides} />,
  );

/** The marked tag is the control, so it says both what it is and what pressing it does. */
const markedTag = () => screen.getByRole("button", { name: "Klassen: Neue Klasse" });

describe("RecordHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("heads the page with the record its path ends at", () => {
    setup();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Wintersportwoche");
    expect(screen.getByRole("navigation", { name: "Pfad" })).toBeInTheDocument();
  });

  it("offers one tag per child collection of the record", () => {
    setup();

    expect(screen.getByRole("group", { name: RECORD_TABS_LABEL })).toBeInTheDocument();
    expect(markedTag()).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Events" })).toHaveAttribute("aria-pressed", "false");
  });

  it("opens the collection a tag names when it is pressed", async () => {
    setup();

    await userEvent.click(screen.getByRole("button", { name: "Events" }));

    expect(push).toHaveBeenCalledWith("/app/event-series/s1/events");
  });

  /** The marked tag is already open, so the whole of it adds rather than navigating nowhere. */
  it("adds to the marked collection when its tag is pressed", async () => {
    const onAdd = vi.fn();
    setup({ onAdd });

    await userEvent.click(markedTag());

    expect(onAdd).toHaveBeenCalledOnce();
    expect(push).not.toHaveBeenCalled();
  });

  it("adds on Enter, the tag being the control rather than holding one", async () => {
    const onAdd = vi.fn();
    setup({ onAdd });

    markedTag().focus();
    await userEvent.keyboard("{Enter}");

    expect(onAdd).toHaveBeenCalledOnce();
  });

  /** Adding is what the screen is for, so Enter does it wherever the teacher happens to be. */
  it("adds on Enter from anywhere on the screen", async () => {
    const onAdd = vi.fn();
    setup({ onAdd });

    document.body.focus();
    await userEvent.keyboard("{Enter}");

    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("leaves Enter alone on a control that answers it itself", async () => {
    const onAdd = vi.fn();
    setup({ onAdd });

    screen.getByRole("button", { name: "Events" }).focus();
    await userEvent.keyboard("{Enter}");

    expect(onAdd).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith("/app/event-series/s1/events");
  });

  it("leaves Enter alone while a write of the screen's is out", async () => {
    const onAdd = vi.fn();
    setup({ onAdd, disabled: true });

    document.body.focus();
    await userEvent.keyboard("{Enter}");

    expect(onAdd).not.toHaveBeenCalled();
  });

  /** The wording is the collection's own, and only the marked tag says it. */
  it("says what adding means on the marked tag alone", () => {
    setup();

    expect(markedTag()).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Neues Event/ })).not.toBeInTheDocument();
  });

  it("moves the mark, and with it what a press does", async () => {
    const onAdd = vi.fn();
    setup({ marked: "events", onAdd });

    await userEvent.click(screen.getByRole("button", { name: "Events: Neues Event" }));

    expect(onAdd).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Klassen" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
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
    });

    expect(screen.getByRole("button", { name: "Eventreihen: Neue Eventreihe" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("holds every tag while a write of the screen's is out", () => {
    setup({ disabled: true });

    expect(screen.getByRole("button", { name: "Events" })).toBeDisabled();
    expect(markedTag()).toBeDisabled();
  });
});
