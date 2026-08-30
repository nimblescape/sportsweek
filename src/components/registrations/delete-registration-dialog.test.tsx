/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteRegistrationDialog } from "@/components/registrations/delete-registration-dialog";
import { rosterStudent } from "@/test/roster-student";

const apiRequest = vi.fn();
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return { ...actual, apiRequest: (...args: unknown[]) => apiRequest(...args) };
});

const student = rosterStudent({ firstName: "Max", lastName: "Mustermann" });
const onDeleted = vi.fn();

function show() {
  render(
    <DeleteRegistrationDialog
      open
      eventSeriesId="s1"
      student={student}
      onClose={vi.fn()}
      onDeleted={onDeleted}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  apiRequest.mockResolvedValue(undefined);
});

describe("DeleteRegistrationDialog", () => {
  /**
   * The student travels in the body, so no address reaches the log the platform keeps of every
   * URL it is asked for (US-33).
   */
  it("names the student in the body and nobody in the URL", async () => {
    show();

    await userEvent.click(screen.getByRole("button", { name: "Löschen" }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/api/event-series/s1/registrations/delete", {
        method: "POST",
        body: { studentUpn: student.id },
      }),
    );
    expect(onDeleted).toHaveBeenCalled();
  });

  it("says so and keeps the dialog open when the request is refused", async () => {
    apiRequest.mockRejectedValue(new Error("Archiviert ist schreibgeschützt."));

    show();
    await userEvent.click(screen.getByRole("button", { name: "Löschen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Das hat leider nicht geklappt.");
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
