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
 * It sits on the line between the header and the content, which is space of its own: centred in
 * the header it was drawn on top of the event series tags and could not be read at all (US-20).
 */
describe("BusyBar — where it reports from", () => {
  async function busyShell() {
    renderShell();
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(spinner()).toBeInTheDocument());
    return spinner()!;
  }

  it("reports as a bar rather than an icon in the header's middle", async () => {
    const bar = await busyShell();

    expect(bar.querySelector("svg")).toBeNull();
  });

  it("spans the width and sits on the header's own edge", async () => {
    const bar = await busyShell();

    expect(bar.className).toContain("inset-x-0");
    expect(bar.className).toContain("absolute");
    expect(bar.className).not.toContain("justify-center");
  });

  /** A bar drawn over the header would take the presses meant for what is under it. */
  it("takes no pointer events, being decoration over a sticky header", async () => {
    const bar = await busyShell();

    expect(bar.className).toContain("pointer-events-none");
  });
});
