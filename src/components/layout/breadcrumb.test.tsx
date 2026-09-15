/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
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

    const trail = screen.getByRole("navigation", { name: BREADCRUMB_LABEL });

    expect(trail).toHaveTextContent("StammdatenEventreihenWintersportwoche");
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

  /** The last step is where the teacher already is, and it is the page's heading. */
  it("heads the page with its last step", () => {
    render(<Breadcrumb trail={TRAIL} />);

    const heading = screen.getByRole("heading", { level: 1 });

    expect(heading).toHaveTextContent("Wintersportwoche");
    expect(heading).toHaveAttribute("aria-current", "page");
  });

  /** A page with no ancestors is a trail of one step, which is still its heading. */
  it("draws a path of one step", () => {
    render(<Breadcrumb trail={[{ label: "Benutzerrechte", href: "/app/users" }]} />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Benutzerrechte");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps whatever controls belong beside the heading", () => {
    render(<Breadcrumb trail={TRAIL} actions={<button type="button">Exportieren</button>} />);

    expect(screen.getByRole("button", { name: "Exportieren" })).toBeInTheDocument();
  });
});
