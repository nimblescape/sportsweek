/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "@/components/ui/card";

describe("Card design tokens", () => {
  it("applies the shared subtle elevation token", () => {
    render(<Card data-testid="card" />);

    expect(screen.getByTestId("card").className).toContain("shadow-card");
  });
});
