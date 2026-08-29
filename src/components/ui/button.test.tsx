/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, buttonVariants } from "@/components/ui/button";

const VARIANTS = [
  "default",
  "outline",
  "secondary",
  "neutral",
  "template",
  "ghost",
  "destructive",
  "link",
] as const;

describe("Button design tokens", () => {
  it("renders the default variant from the accent-backed primary token", () => {
    render(<Button>Speichern</Button>);

    expect(screen.getByRole("button").className).toContain("bg-primary");
  });

  it.each(VARIANTS)("gives the %s variant hover feedback", (variant) => {
    expect(buttonVariants({ variant })).toMatch(/hover:(bg-|text-|underline)/);
  });

  it.each(VARIANTS)("gives the %s variant pressed feedback", (variant) => {
    expect(buttonVariants({ variant })).toMatch(/active:[\w[\]()/.,-]*(bg-|text-)/);
  });

  /**
   * One height for everything that can be pressed, and it is not this component's to choose: it
   * comes from the shared token, so a button, a field and a select cannot disagree about it.
   */
  it("takes its height from the shared control token", () => {
    expect(buttonVariants({ size: "default" })).toContain("h-(--control-height)");
    expect(buttonVariants({ size: "icon" })).toContain("size-(--control-height)");
  });
});
