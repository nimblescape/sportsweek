/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PERMISSIONS, PERMISSION_LABELS } from "@/lib/auth/permissions";

const useTeachers = vi.fn();
vi.mock("@/lib/users/use-teachers", () => ({ useTeachers: () => useTeachers() }));

const apiRequest = vi.fn();
vi.mock("@/lib/api/client", () => ({ apiRequest: (...args: unknown[]) => apiRequest(...args) }));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const {
  UserPermissionsView,
  OWN_GRANT_HINT,
  NO_PERMISSIONS_LABEL,
  FILTER_LABEL,
  NONE_MATCHING_HINT,
} = await import("@/components/users/user-permissions-view");

const ADA = { uid: "uid-of-ada", email: "ada@htldornbirn.at", firstName: "Ada", lastName: "Auer" };
const BOB = {
  uid: "uid-of-bob",
  email: "bob@htldornbirn.at",
  firstName: "Bob",
  lastName: "Berger",
};

function teachers(
  ...rows: {
    uid: string;
    email: string;
    firstName: string;
    lastName: string;
    permissions?: string[];
  }[]
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

function show(signedInAs = ADA.uid) {
  return render(<UserPermissionsView signedInAs={signedInAs} />);
}

describe("UserPermissionsView", () => {
  it("lists every teacher by name", () => {
    show();

    expect(screen.getByText("Auer Ada")).toBeInTheDocument();
    expect(screen.getByText("Berger Bob")).toBeInTheDocument();
  });

  /** Two teachers can share a name, and the address is what tells a reader which one this is. */
  it("names each teacher by their address rather than by the uid keying them", () => {
    show();

    expect(screen.getByText(ADA.email)).toBeInTheDocument();
    expect(screen.queryByText(ADA.uid)).not.toBeInTheDocument();
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

    // Scoped to the row: the filter offers a tag by the same name, which is a different thing.
    expect(
      within(screen.getByRole("listitem")).getByText(NO_PERMISSIONS_LABEL),
    ).toBeInTheDocument();
  });

  it("grants the permission that was pressed", async () => {
    show();

    await userEvent.click(tagIn("Berger Bob", PERMISSION_LABELS.editAssignments));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/api/users", {
        method: "PATCH",
        body: { uid: BOB.uid, permissions: ["editAssignments"] },
      }),
    );
  });

  it("withdraws one that was pressed already", async () => {
    teachers({ ...BOB, permissions: ["viewReports", "editAssignments"] });
    show();

    await userEvent.click(tagIn("Berger Bob", PERMISSION_LABELS.editAssignments));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/api/users", {
        method: "PATCH",
        body: { uid: BOB.uid, permissions: ["viewReports"] },
      }),
    );
  });

  /** The row sends what the exclusivity rule makes of a press, not the press itself. */
  it("clears viewReports when editReports is pressed", async () => {
    teachers({ ...BOB, permissions: ["viewReports"] });
    show();

    await userEvent.click(tagIn("Berger Bob", PERMISSION_LABELS.editReports));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/api/users", {
        method: "PATCH",
        body: { uid: BOB.uid, permissions: ["editReports"] },
      }),
    );
  });

  it("clears editReports when viewReports is pressed", async () => {
    teachers({ ...BOB, permissions: ["editReports"] });
    show();

    await userEvent.click(tagIn("Berger Bob", PERMISSION_LABELS.viewReports));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith("/api/users", {
        method: "PATCH",
        body: { uid: BOB.uid, permissions: ["viewReports"] },
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
      expect(apiRequest).toHaveBeenCalledWith("/api/users", {
        method: "PATCH",
        body: { uid: ADA.uid, permissions: ["editMasterData", "editUsers"] },
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

  /**
   * The navigation bar is rendered by a server layout above this page, which does not run again
   * on its own — so withdrawing something from yourself would leave the bar offering a page you
   * may no longer open until the next navigation.
   */
  it("re-runs the server tree after changing your own permissions", async () => {
    show();

    await userEvent.click(tagIn("Auer Ada", PERMISSION_LABELS.editMasterData));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("leaves it alone when the change was to somebody else", async () => {
    show();

    await userEvent.click(tagIn("Berger Bob", PERMISSION_LABELS.editMasterData));

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not re-run it when the change was refused", async () => {
    apiRequest.mockRejectedValue(new Error("Nein."));
    show();

    await userEvent.click(tagIn("Auer Ada", PERMISSION_LABELS.editMasterData));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

/** The same row the report is filtered by (US-13), over the staff instead of the students. */
describe("UserPermissionsView — filtering", () => {
  const nameField = () => screen.getByRole("textbox", { name: `${FILTER_LABEL}: Name` });
  const filterTag = (label: string) =>
    screen.getByRole("button", { name: `${FILTER_LABEL}: ${label}` });
  const shown = () =>
    screen
      .getAllByRole("listitem")
      .map((item) => item.querySelector("[data-slot='card'] span")?.textContent);

  beforeEach(() => {
    teachers(
      { ...ADA, permissions: ["editUsers"] },
      { ...BOB, permissions: ["editMasterData"] },
      { uid: "uid-of-clara", email: "cla@htldornbirn.at", firstName: "Clara", lastName: "Cerny" },
    );
  });

  it("shows everybody before anything is filtered", () => {
    show();

    expect(shown()).toEqual(["Auer Ada", "Berger Bob", "Cerny Clara"]);
  });

  it("narrows to the name that was typed", async () => {
    show();

    await userEvent.type(nameField(), "berg");

    expect(shown()).toEqual(["Berger Bob"]);
  });

  it("narrows to whoever holds a pressed permission", async () => {
    show();

    await userEvent.click(filterTag(PERMISSION_LABELS.editUsers));

    expect(shown()).toEqual(["Auer Ada"]);
  });

  it("shows everybody again when Alle is pressed", async () => {
    show();
    await userEvent.click(filterTag(PERMISSION_LABELS.editUsers));

    await userEvent.click(screen.getByRole("button", { name: `${FILTER_LABEL}: Alle` }));

    expect(shown()).toHaveLength(3);
  });

  it("says so when the filter matches nobody", async () => {
    show();

    await userEvent.type(nameField(), "zzz");

    expect(screen.getByText(NONE_MATCHING_HINT)).toBeInTheDocument();
  });

  /** A tag on a row is what a teacher holds; a tag in the filter is what to narrow by. */
  it("keeps the filter tags apart from the tags that grant", async () => {
    show();

    await userEvent.click(filterTag(PERMISSION_LABELS.editUsers));

    expect(apiRequest).not.toHaveBeenCalled();
  });

  /** Who is waiting for access, which is the question this page is most often opened to answer. */
  it("narrows to whoever holds nothing", async () => {
    show();

    await userEvent.click(filterTag(NO_PERMISSIONS_LABEL));

    expect(shown()).toEqual(["Cerny Clara"]);
  });

  it("reads that tag as an alternative beside a permission", async () => {
    show();

    await userEvent.click(filterTag(NO_PERMISSIONS_LABEL));
    await userEvent.click(filterTag(PERMISSION_LABELS.editUsers));

    expect(shown()).toEqual(["Auer Ada", "Cerny Clara"]);
  });

  it("releases it again when pressed twice", async () => {
    show();

    await userEvent.click(filterTag(NO_PERMISSIONS_LABEL));
    await userEvent.click(filterTag(NO_PERMISSIONS_LABEL));

    expect(shown()).toHaveLength(3);
  });

  it("is cleared by Alle along with the rest", async () => {
    show();
    await userEvent.click(filterTag(NO_PERMISSIONS_LABEL));

    await userEvent.click(screen.getByRole("button", { name: `${FILTER_LABEL}: Alle` }));

    expect(shown()).toHaveLength(3);
  });
});
