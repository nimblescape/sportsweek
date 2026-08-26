/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { BusyProvider, useBusyWhile } from "@/lib/api/busy";
import { useRowAction } from "@/lib/api/use-row-action";
import { HeaderSpinner } from "./header-spinner";

/** A promise plus the handle to settle it, so a test can hold a write open. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const write = deferred();

function Writer() {
  const { run } = useRowAction();

  return <button onClick={() => void run("s1", () => write.promise)}>Speichern</button>;
}

function renderShell() {
  render(
    <BusyProvider>
      <HeaderSpinner />
      <Writer />
    </BusyProvider>,
  );
}

const spinner = () => screen.queryByRole("status", { name: "Wird gespeichert" });

describe("HeaderSpinner", () => {
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
        <HeaderSpinner />
        <Loading loading />
      </BusyProvider>,
    );

    await waitFor(() => expect(spinner()).toBeInTheDocument());

    rerender(
      <BusyProvider>
        <HeaderSpinner />
        <Loading loading={false} />
      </BusyProvider>,
    );

    await waitFor(() => expect(spinner()).not.toBeInTheDocument());
  });
});
