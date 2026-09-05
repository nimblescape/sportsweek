/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Breadcrumb, BREADCRUMB_LABEL } from "./breadcrumb";

const TRAIL = [
  { label: "Stammdaten", href: "/app/event-series" },
  { label: "Eventreihen", href: "/app/event-series" },
  { label: "Wintersportwoche", href: "/app/event-series/s1/classes" },
];

describe("Breadcrumb", () => {
  it("names every step of the path, in order", () => {
    render(<Breadcrumb trail={TRAIL} />);

    const steps = within(screen.getByRole("navigation", { name: BREADCRUMB_LABEL })).getAllByRole(
      "listitem",
    );

    expect(steps.map((step) => step.textContent)).toEqual([
      "Stammdaten",
      "Eventreihen",
      "Wintersportwoche",
    ]);
  });

  it("makes every step but the last a way back", () => {
    render(<Breadcrumb trail={TRAIL} />);

    expect(screen.getByRole("link", { name: "Stammdaten" })).toHaveAttribute(
      "href",
      "/app/event-series",
    );
    expect(screen.getByRole("link", { name: "Eventreihen" })).toHaveAttribute(
      "href",
      "/app/event-series",
    );
    expect(screen.queryByRole("link", { name: "Wintersportwoche" })).not.toBeInTheDocument();
  });

  /** The last step is where the teacher already is, and the title beneath repeats it. */
  it("marks the last step as the page itself", () => {
    render(<Breadcrumb trail={TRAIL} />);

    expect(screen.getByText("Wintersportwoche")).toHaveAttribute("aria-current", "page");
  });

  /** The root is one step deep, and still draws a path rather than an empty row. */
  it("draws a path of one step", () => {
    render(<Breadcrumb trail={[{ label: "Stammdaten", href: "/app/event-series" }]} />);

    expect(screen.getByText("Stammdaten")).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
