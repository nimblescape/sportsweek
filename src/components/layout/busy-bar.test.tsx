/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { BusyProvider, useBusyWhile } from "@/lib/api/busy";
import { useRowAction } from "@/lib/api/use-row-action";
import { BusyBar } from "./busy-bar";

/** A promise plus the handle to settle it, so a test can hold a write open. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// Its own write per test: one left resolved by the test before would never be in flight here.
let write = deferred();

beforeEach(() => {
  write = deferred();
});

function Writer() {
  const { run } = useRowAction();

  return <button onClick={() => void run("s1", () => write.promise)}>Speichern</button>;
}

function renderShell() {
  render(
    <BusyProvider>
      <BusyBar />
      <Writer />
    </BusyProvider>,
  );
}

const spinner = () => screen.queryByRole("status", { name: "Wird gespeichert" });

describe("BusyBar", () => {
  it("keeps out of the way while nothing is being written", () => {
    renderShell();

    expect(spinner()).not.toBeInTheDocument();
  });

  it("appears while a write anywhere in the app is in flight", async () => {
    renderShell();

    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    await waitFor(() => expect(spinner()).toBeInTheDocument());
  });

  it("goes once the write is answered", async () => {
    renderShell();

    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(spinner()).toBeInTheDocument());

    write.resolve();

    await waitFor(() => expect(spinner()).not.toBeInTheDocument());
  });

  /** A list still loading from its subscription is a wait like any other (see useBusyWhile). */
  it("answers for a view that is still loading, not only for writes", async () => {
    function Loading({ loading }: { loading: boolean }) {
      useBusyWhile(loading);
      return null;
    }

    const { rerender } = render(
      <BusyProvider>
        <BusyBar />
        <Loading loading />
      </BusyProvider>,
    );

    await waitFor(() => expect(spinner()).toBeInTheDocument());

    rerender(
      <BusyProvider>
        <BusyBar />
        <Loading loading={false} />
      </BusyProvider>,
    );

    await waitFor(() => expect(spinner()).not.toBeInTheDocument());
  });
});

/**
 * Centred on the screen rather than in the header, whose middle the event series tags now hold
 * (US-20). Bars rather than a sweep: most writes are answered before a sweep has crossed once,
 * so it read as nothing happening at all.
 */
describe("BusyBar — where it reports from", () => {
  async function busyShell() {
    renderShell();
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(spinner()).toBeInTheDocument());
    return spinner()!;
  }

  it("reports with bars, each animated, so a short wait still shows something", async () => {
    const bar = await busyShell();
    const bars = bar.querySelectorAll("[data-busy-bar]");

    expect(bars.length).toBeGreaterThan(1);
    for (const one of bars) expect(one.className).toContain("animate-busy-bar");
  });

  /** Out of phase, or they would rise and fall as one block and read as a single bar. */
  it("starts each bar at a different point in the cycle", async () => {
    const bar = await busyShell();
    const delays = [...bar.querySelectorAll<HTMLElement>("[data-busy-bar]")].map(
      (one) => one.style.animationDelay,
    );

    expect(new Set(delays).size).toBe(delays.length);
  });

  it("sits on the header's own line, centred across it", async () => {
    const bar = await busyShell();

    expect(bar.className).toContain("absolute");
    expect(bar.className).toContain("inset-x-0");
    expect(bar.className).toContain("justify-center");
  });

  /** Short, so it stays on the line rather than reaching up into the event series tags (US-20). */
  it("keeps the bars shorter than the header's own row", async () => {
    const bar = await busyShell();

    for (const one of bar.querySelectorAll("[data-busy-bar]")) {
      expect(one.className).toContain("h-2");
    }
  });

  /** Grey, but darker than the line it sits on, which was too faint to notice at a glance. */
  it("draws the bars in the muted foreground grey", async () => {
    const bar = await busyShell();

    for (const one of bar.querySelectorAll("[data-busy-bar]")) {
      expect(one.className).toContain("bg-muted-foreground");
    }
  });

  /** A bar drawn over the header would take the presses meant for what is under it. */
  it("takes no pointer events, being decoration over a sticky header", async () => {
    const bar = await busyShell();

    expect(bar.className).toContain("pointer-events-none");
  });
});
