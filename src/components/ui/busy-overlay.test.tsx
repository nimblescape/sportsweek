/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BusyOverlay } from "./busy-overlay";

function renderOverlay(busy: boolean) {
  render(
    <BusyOverlay busy={busy} label="Wird gespeichert">
      <button>Neue Klasse</button>
    </BusyOverlay>,
  );
}

describe("BusyOverlay", () => {
  it("leaves the section alone while nothing is being written", () => {
    renderOverlay(false);

    expect(screen.getByRole("button", { name: "Neue Klasse" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows a spinner while a write is in flight", () => {
    renderOverlay(true);

    expect(screen.getByRole("status", { name: "Wird gespeichert" })).toBeInTheDocument();
  });

  /**
   * `inert` rather than `disabled` on each control: it takes the whole section out of reach at
   * once, for pointer, keyboard and screen reader alike, and needs no control to opt in.
   */
  it("takes everything underneath out of reach", () => {
    renderOverlay(true);

    expect(screen.getByRole("button", { name: "Neue Klasse" }).closest("[inert]")).not.toBeNull();
  });

  it("hands it back once the write is answered", () => {
    renderOverlay(false);

    expect(screen.getByRole("button", { name: "Neue Klasse" }).closest("[inert]")).toBeNull();
  });
});
