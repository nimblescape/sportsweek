/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ShowArchivedProvider, useShowArchived } from "./show-archived";

function Probe({ name }: { name: string }) {
  const { showArchived, setShowArchived } = useShowArchived();

  return (
    <button type="button" onClick={() => setShowArchived(!showArchived)}>
      {name}: {showArchived ? "sichtbar" : "verborgen"}
    </button>
  );
}

describe("useShowArchived", () => {
  it("gives everything under the provider the same answer", async () => {
    render(
      <ShowArchivedProvider>
        <Probe name="Liste" />
        <Probe name="Events" />
      </ShowArchivedProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Liste: verborgen" }));

    expect(screen.getByRole("button", { name: "Events: sichtbar" })).toBeInTheDocument();
  });

  /** A view rendered on its own still works; what it loses is only surviving a navigation. */
  it("falls back to an answer of its own where no provider is mounted", async () => {
    render(<Probe name="Liste" />);

    await userEvent.click(screen.getByRole("button", { name: "Liste: verborgen" }));

    expect(screen.getByRole("button", { name: "Liste: sichtbar" })).toBeInTheDocument();
  });
});
