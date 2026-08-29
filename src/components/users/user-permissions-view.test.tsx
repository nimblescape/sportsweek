/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PERMISSIONS, PERMISSION_LABELS } from "@/lib/auth/permissions";

const useTeachers = vi.fn();
vi.mock("@/lib/users/use-teachers", () => ({ useTeachers: () => useTeachers() }));

const apiRequest = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }));

const { UserPermissionsView, OWN_GRANT_HINT, NO_PERMISSIONS_LABEL } =
  await import("@/components/users/user-permissions-view");

const ADA = { upn: "ada@htldornbirn.at", firstName: "Ada", lastName: "Auer" };
const BOB = { upn: "bob@htldornbirn.at", firstName: "Bob", lastName: "Berger" };

function teachers(
  ...rows: { upn: string; firstName: string; lastName: string; permissions?: string[] }[]
) {
  useTeachers.mockReturnValue({
    teachers: rows.map((row) => ({ ...row, permissions: row.permissions ?? [] })),
    loading: false,
    error: null,
  });
}

const tagIn = (name: string, label: string) =>
  screen.getByRole("button", { name: `${name}: ${label}` });

beforeEach(() => {
  vi.clearAllMocks();
  apiRequest.mockResolvedValue({ permissions: [] });
  teachers({ ...ADA, permissions: ["editUsers"] }, BOB);
});

function show(signedInAs = ADA.upn) {
  return render(<UserPermissionsView signedInAs={signedInAs} />);
}

describe("UserPermissionsView", () => {
  it("lists every teacher by name", () => {
    show();

    expect(screen.getByText("Auer Ada")).toBeInTheDocument();
    expect(screen.getByText("Berger Bob")).toBeInTheDocument();
  });

  it("offers every permission as a tag against each teacher", () => {
    show();

    for (const permission of PERMISSIONS) {
      expect(tagIn("Berger Bob", PERMISSION_LABELS[permission])).toBeInTheDocument();
    }
  });

  it("presses the tags a teacher holds and leaves the rest unpressed", () => {
    teachers({ ...BOB, permissions: ["viewReports"] });
    show();

    expect(tagIn("Berger Bob", PERMISSION_LABELS.viewReports)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(tagIn("Berger Bob", PERMISSION_LABELS.editMasterData)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("says so when somebody holds nothing at all", () => {
    teachers(BOB);
    show();

    expect(screen.getByText(NO_PERMISSIONS_LABEL)).toBeInTheDocument();
  });

  it("grants the permission that was pressed", async () => {
    show();

    await userEvent.click(tagIn("Berger Bob", PERMISSION_LABELS.editAssignments));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(`/api/users/${encodeURIComponent(BOB.upn)}`, {
        method: "PATCH",
        body: { permissions: ["editAssignments"] },
      }),
    );
  });

  it("withdraws one that was pressed already", async () => {
    teachers({ ...BOB, permissions: ["viewReports", "editAssignments"] });
    show();

    await userEvent.click(tagIn("Berger Bob", PERMISSION_LABELS.editAssignments));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(expect.any(String), {
        method: "PATCH",
        body: { permissions: ["viewReports"] },
      }),
    );
  });

  /** The row sends what the dependency rule makes of a press, not the press itself. */
  it("presses viewReports along with editReports", async () => {
    teachers(BOB);
    show();

    await userEvent.click(tagIn("Berger Bob", PERMISSION_LABELS.editReports));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(expect.any(String), {
        method: "PATCH",
        body: { permissions: ["viewReports", "editReports"] },
      }),
    );
  });

  it("withdraws editReports along with viewReports", async () => {
    teachers({ ...BOB, permissions: ["viewReports", "editReports"] });
    show();

    await userEvent.click(tagIn("Berger Bob", PERMISSION_LABELS.viewReports));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(expect.any(String), {
        method: "PATCH",
        body: { permissions: [] },
      }),
    );
  });

  /**
   * Only the last holder can be the last one, so refusing self-removal is what keeps somebody
   * able to hand permissions out. The row says so rather than offering a control that cannot work.
   */
  it("shows the signed-in admin's own editUsers as a tag with no button", () => {
    show();

    expect(
      screen.queryByRole("button", { name: `Auer Ada: ${PERMISSION_LABELS.editUsers}` }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(OWN_GRANT_HINT)).toBeInTheDocument();
  });

  it("still lets the admin change their own other permissions", async () => {
    show();

    await userEvent.click(tagIn("Auer Ada", PERMISSION_LABELS.editMasterData));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(expect.any(String), {
        method: "PATCH",
        body: { permissions: ["editMasterData", "editUsers"] },
      }),
    );
  });

  it("offers somebody else's editUsers as a button, since that one can be withdrawn", () => {
    teachers({ ...BOB, permissions: ["editUsers"] });
    show();

    expect(tagIn("Berger Bob", PERMISSION_LABELS.editUsers)).toBeInTheDocument();
  });

  it("reports a refusal without pretending the press landed", async () => {
    apiRequest.mockRejectedValue(new Error("Dafür fehlen dir die Rechte."));
    show();

    await userEvent.click(tagIn("Berger Bob", PERMISSION_LABELS.editAssignments));

    expect(await screen.findByRole("alert")).toHaveTextContent("Dafür fehlen dir die Rechte.");
  });
});
