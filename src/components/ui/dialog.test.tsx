/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "./dialog";

function renderDialog(props: Partial<React.ComponentProps<typeof Dialog>> = {}) {
  const onClose = vi.fn();
  render(
    <Dialog open title="Saison löschen" onClose={onClose} {...props}>
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

    expect(screen.getByRole("dialog")).toHaveAccessibleName("Saison löschen");
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
});
