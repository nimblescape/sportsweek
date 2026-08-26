/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BusyRegion } from "./busy-region";

function renderRegion(busy: boolean) {
  render(
    <BusyRegion busy={busy}>
      <button>Neue Klasse</button>
    </BusyRegion>,
  );
}

const control = () => screen.getByRole("button", { name: "Neue Klasse" });

describe("BusyRegion", () => {
  it("leaves the section alone while nothing is being written", () => {
    renderRegion(false);

    expect(control().closest("[inert]")).toBeNull();
  });

  /**
   * `inert` rather than `disabled` on each control: it takes the whole section out of reach at
   * once, for pointer, keyboard and screen reader alike, and needs no control to opt in.
   */
  it("takes everything underneath out of reach while a write is in flight", () => {
    renderRegion(true);

    expect(control().closest("[inert]")).not.toBeNull();
  });

  /** The spinner belongs to the header, where one of them speaks for the whole app. */
  it("shows no spinner of its own", () => {
    renderRegion(true);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
