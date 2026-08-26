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

function setup(value: string[] = []) {
  const onChange = vi.fn();
  render(<EquipmentChecklist items={ITEMS} value={value} onChange={onChange} />);
  return onChange;
}

const box = (name: string) => screen.getByRole("checkbox", { name });

describe("EquipmentChecklist", () => {
  it("offers every item the program requires", () => {
    setup();

    for (const item of ITEMS) expect(box(item)).not.toBeChecked();
  });

  it("checks the items already chosen", () => {
    setup(["Helm"]);

    expect(box("Helm")).toBeChecked();
    expect(box("Ski")).not.toBeChecked();
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

  /** "Alle" is a control, not an equipment item — it is never stored (US-11). */
  it("checks every item when 'Alle' is checked", async () => {
    const onChange = setup(["Helm"]);

    await userEvent.click(box("Alle"));

    expect(onChange).toHaveBeenCalledWith(ITEMS);
  });

  it("clears the selection when 'Alle' is unchecked", async () => {
    const onChange = setup(ITEMS);

    await userEvent.click(box("Alle"));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("shows 'Alle' as checked once every item is checked by hand", () => {
    setup(ITEMS);

    expect(box("Alle")).toBeChecked();
  });

  it("drops 'Alle' as soon as one item is unchecked", () => {
    setup(["Ski", "Skischuhe", "Stöcke"]);

    expect(box("Alle")).not.toBeChecked();
  });

  it("leaves 'Alle' unchecked while the program requires nothing", () => {
    const onChange = vi.fn();
    render(<EquipmentChecklist items={[]} value={[]} onChange={onChange} />);

    expect(box("Alle")).not.toBeChecked();
  });

  it("ignores a stored item the program no longer requires", () => {
    setup(["Ski", "Skischuhe", "Stöcke", "Helm", "Schlitten"]);

    expect(box("Alle")).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Schlitten" })).not.toBeInTheDocument();
  });
});
