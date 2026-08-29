/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function Example({ onValueChange }: { onValueChange?: (value: unknown) => void }) {
  return (
    <Select
      items={[
        { label: "Ski", value: "Ski" },
        { label: "Snowboard", value: "Snowboard" },
      ]}
      value="Ski"
      onValueChange={onValueChange}
    >
      <SelectTrigger aria-label="Programm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="Ski">Ski</SelectItem>
        <SelectItem value="Snowboard">Snowboard</SelectItem>
      </SelectContent>
    </Select>
  );
}

describe("Select", () => {
  it("shows the selected value on its trigger", () => {
    render(<Example />);

    expect(screen.getByLabelText("Programm")).toHaveTextContent("Ski");
  });

  it("reports the item the user picks", async () => {
    const onValueChange = vi.fn();
    render(<Example onValueChange={onValueChange} />);

    await userEvent.click(screen.getByLabelText("Programm"));
    await userEvent.click(await screen.findByRole("option", { name: "Snowboard" }));

    expect(onValueChange).toHaveBeenCalledWith("Snowboard", expect.anything());
  });
});
