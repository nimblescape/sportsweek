/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InvitationQr } from "./invitation-qr";

function show(onClose = vi.fn()) {
  render(
    <div className="overflow-hidden" data-testid="card">
      <InvitationQr
        eventSeriesName="Wintersportwoche 2026"
        className="5AHIF"
        link="https://sportwoche.example/join/tok"
        onClose={onClose}
      />
    </div>,
  );
  return onClose;
}

describe("InvitationQr", () => {
  /**
   * A teacher projecting an invitation reads the class off the same screen the room is looking
   * at, rather than trusting the card they pressed a moment ago (US-29). Getting it wrong enrols
   * one class into another, and nothing else on the screen would say so.
   */
  it("names the event series and the class the code is for", () => {
    show();

    expect(screen.getByRole("dialog")).toHaveTextContent("Wintersportwoche 2026");
    expect(screen.getByRole("dialog")).toHaveTextContent("5AHIF");
  });

  /** A token handed to an image service is a token that service holds (US-29). */
  it("draws the code in the browser rather than fetching one", () => {
    show();

    expect(screen.getByRole("dialog").querySelector("img")).toBeNull();
    expect(screen.getByRole("dialog").querySelector("svg")).not.toBeNull();
  });

  it("encodes the link itself, so scanning it is following it", () => {
    show();

    expect(screen.getByRole("img", { name: /5AHIF/ })).toBeInTheDocument();
  });

  /** The one control on the surface, and one nobody can name is one a screen reader cannot offer. */
  it("closes on the cross, which carries an accessible name", async () => {
    const onClose = show();

    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape as well as on the cross", async () => {
    const onClose = show();

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  /**
   * It opens from a card, and a card clips what overflows it — so the surface is put on the
   * document instead of left where the press came from.
   */
  it("leaves the card it was opened from, which would otherwise clip it", () => {
    show();

    expect(screen.getByTestId("card")).not.toContainElement(screen.getByRole("dialog"));
  });

  /**
   * White explicitly, not the page's own background: a code is read by a camera, and one drawn
   * dark-on-dark in the evening theme does not scan at all.
   */
  it("stands on white, whatever the rest of the application is wearing", () => {
    expect(show() && screen.getByRole("dialog").className).toContain("bg-white");
  });

  /**
   * A projector has poor contrast and a phone camera focuses on whatever it finds first, so a
   * quiet field around the code is the difference between scanning once and scanning three times.
   */
  it("carries nothing but the two names, the code and the way out", () => {
    show();

    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
