/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useHoverCapability } from "./use-hover-capability";

type Listener = () => void;

/** Stands in for the media query jsdom parses but never evaluates. */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>();
  const query = {
    matches,
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
  };

  vi.spyOn(window, "matchMedia").mockImplementation(() => query as unknown as MediaQueryList);

  return {
    change(next: boolean) {
      query.matches = next;
      act(() => listeners.forEach((listener) => listener()));
    },
  };
}

function Probe() {
  return <span>{useHoverCapability() ? "hover" : "kein Hover"}</span>;
}

afterEach(() => vi.restoreAllMocks());

describe("useHoverCapability", () => {
  it("answers yes on a device that can hover", () => {
    stubMatchMedia(true);

    render(<Probe />);

    expect(screen.getByText("hover")).toBeInTheDocument();
  });

  it("answers no on a touch screen, where nothing may hide behind a hover", () => {
    stubMatchMedia(false);

    render(<Probe />);

    expect(screen.getByText("kein Hover")).toBeInTheDocument();
  });

  it("follows the device changing its mind, as a detachable keyboard does", () => {
    const query = stubMatchMedia(false);

    render(<Probe />);
    query.change(true);

    expect(screen.getByText("hover")).toBeInTheDocument();
  });
});
