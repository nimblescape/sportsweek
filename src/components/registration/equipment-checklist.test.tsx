/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EquipmentChecklist } from "./equipment-checklist";

const ITEMS = ["Ski", "Skischuhe", "Stöcke", "Helm"];

function setup(value: string[] = [], selectable = true) {
  const onChange = vi.fn();
  render(
    <EquipmentChecklist items={ITEMS} selectable={selectable} value={value} onChange={onChange} />,
  );
  return onChange;
}

const box = (name: string) => screen.getByRole("checkbox", { name });

/** Muted is how an entry the student is not borrowing is told apart from one they are. */
const isMuted = (name: string) =>
  screen.getByText(name).className.includes("text-muted-foreground");

describe("EquipmentChecklist", () => {
  describe("while the student is not borrowing anything", () => {
    it("lists what the program requires, with nothing to tick", () => {
      setup([], false);

      for (const item of ITEMS) expect(box(item)).toBeDisabled();
    });

    /** The boxes stay laid out, only hidden, so the entries do not shift when the answer does. */
    it("keeps the room the checkboxes take", () => {
      setup([], false);

      expect(box("Ski")).toHaveClass("invisible");
    });

    it("shows every entry as one the student is not borrowing", () => {
      setup(["Helm"], false);

      for (const item of ITEMS) expect(isMuted(item)).toBe(true);
      expect(box("Helm")).not.toBeChecked();
    });

    it("offers no 'Alles', which would have nothing to select", () => {
      setup([], false);

      expect(screen.queryByText("Alles")).not.toBeInTheDocument();
    });
  });

  it("offers every item the program requires", () => {
    setup();

    for (const item of ITEMS) expect(box(item)).not.toBeChecked();
  });

  it("checks the items already chosen", () => {
    setup(["Helm"]);

    expect(box("Helm")).toBeChecked();
    expect(box("Ski")).not.toBeChecked();
  });

  it("tells a borrowed item from one the student brings themselves", () => {
    setup(["Helm"]);

    expect(isMuted("Helm")).toBe(false);
    expect(isMuted("Ski")).toBe(true);
  });

  it("adds an item in the order the program lists it, not in the order it was clicked", async () => {
    const onChange = setup(["Helm"]);

    await userEvent.click(box("Ski"));

    expect(onChange).toHaveBeenCalledWith(["Ski", "Helm"]);
  });

  it("removes an item that is unchecked", async () => {
    const onChange = setup(["Ski", "Helm"]);

    await userEvent.click(box("Helm"));

    expect(onChange).toHaveBeenCalledWith(["Ski"]);
  });

  /** "Alles" is a control, not an equipment item — it is never stored (US-11). */
  it("checks every item when 'Alles' is checked", async () => {
    const onChange = setup(["Helm"]);

    await userEvent.click(box("Alles"));

    expect(onChange).toHaveBeenCalledWith(ITEMS);
  });

  it("clears the selection when 'Alles' is unchecked", async () => {
    const onChange = setup(ITEMS);

    await userEvent.click(box("Alles"));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows 'Alles' as checked once every item is checked by hand", () => {
    setup(ITEMS);

    expect(box("Alles")).toBeChecked();
  });

  it("drops 'Alles' as soon as one item is unchecked", () => {
    setup(["Ski", "Skischuhe", "Stöcke"]);

    expect(box("Alles")).not.toBeChecked();
  });

  it("leaves 'Alles' unchecked while the program requires nothing", () => {
    const onChange = vi.fn();
    render(<EquipmentChecklist items={[]} selectable value={[]} onChange={onChange} />);

    expect(box("Alles")).not.toBeChecked();
  });

  it("offers 'Alles' after the items, not before them", () => {
    setup();

    const names = screen.getAllByRole("checkbox").map((entry) => entry.parentElement?.textContent);
    expect(names).toEqual([...ITEMS, "Alles"]);
  });

  it("ignores a stored item the program no longer requires", () => {
    setup(["Ski", "Skischuhe", "Stöcke", "Helm", "Schlitten"]);

    expect(box("Alles")).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Schlitten" })).not.toBeInTheDocument();
  });
});
