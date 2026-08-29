/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BusyProvider } from "@/lib/api/busy";
import { holdRequest } from "@/lib/api/requests";
import { Dialog } from "./dialog";

function renderDialog(props: Partial<React.ComponentProps<typeof Dialog>> = {}) {
  const onClose = vi.fn();
  render(
    <Dialog open title="Eventreihe löschen" onClose={onClose} {...props}>
      <p>Inhalt</p>
    </Dialog>,
  );
  return { onClose };
}

describe("Dialog", () => {
  it("renders a native dialog element rather than a browser popup", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("opens as a modal, so the browser traps focus and handles Escape", () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");

    renderDialog();

    expect(showModal).toHaveBeenCalled();
    showModal.mockRestore();
  });

  it("labels the dialog with its title", () => {
    renderDialog();

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Eventreihe löschen");
  });

  it("stays out of the accessibility tree while closed", () => {
    renderDialog({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reports the native close event, so Escape reaches the caller", async () => {
    const { onClose } = renderDialog();

    screen.getByRole("dialog").dispatchEvent(new Event("close"));

    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the close button is used", async () => {
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Schließen" }));

    expect(onClose).toHaveBeenCalled();
  });

  /**
   * One indicator answers for the whole app, from the header (US-14, US-15). A second one in the
   * footer says the same thing twice, and says it somewhere the eye has to learn separately.
   */
  it("places no busy indicator of its own, even while a write is in flight", async () => {
    const release = holdRequest();
    try {
      render(
        <BusyProvider>
          <Dialog
            open
            title="Anmeldung löschen"
            onClose={vi.fn()}
            footer={<button>Löschen</button>}
          >
            <p>Inhalt</p>
          </Dialog>
        </BusyProvider>,
      );

      await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
      expect(screen.queryByRole("status", { name: "Wird gespeichert" })).not.toBeInTheDocument();
    } finally {
      release();
    }
  });
});
