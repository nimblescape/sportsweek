/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PERMISSIONS, PERMISSION_LABELS } from "@/lib/auth/permissions";
import { LOGIN_FILTER_LABELS } from "@/lib/users/teacher-filter";

const useTeachers = vi.fn();
vi.mock("@/lib/users/use-teachers", () => ({ useTeachers: () => useTeachers() }));

const useEventSeries = vi.fn();
vi.mock("@/lib/event-series/use-event-series", () => ({ useEventSeries: () => useEventSeries() }));

const useRecentLogins = vi.fn();
vi.mock("@/lib/users/use-recent-logins", () => ({ useRecentLogins: () => useRecentLogins() }));

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
  LOGIN_HISTORY_LABEL,
  NO_LOGINS_HINT,
  RIGHTS_REPORT_LABEL,
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

function eventSeries(
  ...rows: { name: string; classOptions: { name: string; teacherUids: string[] }[] }[]
) {
  useEventSeries.mockReturnValue({ eventSeries: rows, loading: false, error: null });
}

const tagIn = (name: string, label: string) =>
  screen.getByRole("button", { name: `${name}: ${label}` });

beforeEach(() => {
  vi.clearAllMocks();
  apiRequest.mockResolvedValue({ permissions: [] });
  teachers({ ...ADA, permissions: ["editUsers"] }, BOB);
  eventSeries();
  useRecentLogins.mockReturnValue(new Map());
});

function show(signedInUid = ADA.uid) {
  return render(<UserPermissionsView signedInUid={signedInUid} />);
}

describe("UserPermissionsView", () => {
  it("lists every teacher by name", () => {
    show();

    expect(screen.getByText("Ada Auer")).toBeInTheDocument();
    expect(screen.getByText("Bob Berger")).toBeInTheDocument();
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
      expect(tagIn("Bob Berger", PERMISSION_LABELS[permission])).toBeInTheDocument();
    }
  });

  it("presses the tags a teacher holds and leaves the rest unpressed", () => {
    teachers({ ...BOB, permissions: ["viewReports"] });
    show();

    expect(tagIn("Bob Berger", PERMISSION_LABELS.viewReports)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(tagIn("Bob Berger", PERMISSION_LABELS.editMasterData)).toHaveAttribute(
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

  /** US-41: which classes somebody looks after, read-only, beneath their permission tags. */
  it("names the event series and class pairs a teacher looks after", () => {
    teachers(BOB);
    eventSeries({
      name: "Wintersportwoche 2026/2027",
      classOptions: [
        { name: "2aWI", teacherUids: [BOB.uid] },
        { name: "2bWI", teacherUids: [] },
      ],
    });
    show();

    expect(screen.getByText("Wintersportwoche 2026/2027: 2aWI")).toBeInTheDocument();
    expect(screen.queryByText(/2bWI/)).not.toBeInTheDocument();
  });

  it("names every class the same teacher looks after, comma-separated", () => {
    teachers(BOB);
    eventSeries(
      {
        name: "Wintersportwoche 2026/2027",
        classOptions: [{ name: "2aWI", teacherUids: [BOB.uid] }],
      },
      {
        name: "Sommersportwoche 2026/2027",
        classOptions: [{ name: "2aWI", teacherUids: [BOB.uid] }],
      },
    );
    show();

    expect(
      screen.getByText("Wintersportwoche 2026/2027: 2aWI, Sommersportwoche 2026/2027: 2aWI"),
    ).toBeInTheDocument();
  });

  it("shows nothing at all for a teacher who looks after no class", () => {
    teachers(BOB);
    eventSeries({
      name: "Wintersportwoche 2026/2027",
      classOptions: [{ name: "2aWI", teacherUids: [] }],
    });
    show();

    expect(screen.queryByText(/2aWI/)).not.toBeInTheDocument();
  });

  it("offers no control on the assignment line — it is edited on the class", () => {
    teachers(BOB);
    eventSeries({
      name: "Wintersportwoche 2026/2027",
      classOptions: [{ name: "2aWI", teacherUids: [BOB.uid] }],
    });
    show();

    expect(screen.queryByRole("button", { name: /2aWI/ })).not.toBeInTheDocument();
  });

  /** US-47: the last sign-in shown against a name, once the read has settled. */
  it("shows the last sign-in against a teacher", () => {
    teachers(BOB);
    useRecentLogins.mockReturnValue(new Map([[BOB.uid, ["Fr., 06.09.2026, 14:30:45"]]]));
    show();

    expect(
      screen.getByText(`${LOGIN_HISTORY_LABEL}: Fr., 06.09.2026, 14:30:45`),
    ).toBeInTheDocument();
  });

  it("says a teacher has never signed in, rather than showing nothing", () => {
    teachers(BOB);
    useRecentLogins.mockReturnValue(new Map([[BOB.uid, []]]));
    show();

    expect(screen.getByText(`${LOGIN_HISTORY_LABEL}: ${NO_LOGINS_HINT}`)).toBeInTheDocument();
  });

  it("shows no login line at all while the read has not settled or was refused", () => {
    teachers(BOB);
    useRecentLogins.mockReturnValue(new Map());
    show();

    expect(screen.queryByText(new RegExp(LOGIN_HISTORY_LABEL))).not.toBeInTheDocument();
  });

  it("grants the permission that was pressed", async () => {
    show();

    await userEvent.click(tagIn("Bob Berger", PERMISSION_LABELS.editAssignments));

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

    await userEvent.click(tagIn("Bob Berger", PERMISSION_LABELS.editAssignments));

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

    await userEvent.click(tagIn("Bob Berger", PERMISSION_LABELS.editReports));

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

    await userEvent.click(tagIn("Bob Berger", PERMISSION_LABELS.viewReports));

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
      screen.queryByRole("button", { name: `Ada Auer: ${PERMISSION_LABELS.editUsers}` }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(OWN_GRANT_HINT)).toBeInTheDocument();
  });

  it("still lets the admin change their own other permissions", async () => {
    show();

    await userEvent.click(tagIn("Ada Auer", PERMISSION_LABELS.editMasterData));

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

    expect(tagIn("Bob Berger", PERMISSION_LABELS.editUsers)).toBeInTheDocument();
  });

  it("reports a refusal without pretending the press landed", async () => {
    apiRequest.mockRejectedValue(new Error("Dafür fehlen dir die Rechte."));
    show();

    await userEvent.click(tagIn("Bob Berger", PERMISSION_LABELS.editAssignments));

    expect(await screen.findByRole("alert")).toHaveTextContent("Dafür fehlen dir die Rechte.");
  });

  /**
   * The navigation bar is rendered by a server layout above this page, which does not run again
   * on its own — so withdrawing something from yourself would leave the bar offering a page you
   * may no longer open until the next navigation.
   */
  it("re-runs the server tree after changing your own permissions", async () => {
    show();

    await userEvent.click(tagIn("Ada Auer", PERMISSION_LABELS.editMasterData));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("leaves it alone when the change was to somebody else", async () => {
    show();

    await userEvent.click(tagIn("Bob Berger", PERMISSION_LABELS.editMasterData));

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
  });

  /**
   * The one it is given is a uid, and a record is keyed by one. Handed an address it matched
   * nobody, so neither the refresh nor the guard on your own row ever fired (US-31).
   */
  it("recognises nobody as itself when given something that is not a uid", async () => {
    show(ADA.email);

    await userEvent.click(tagIn("Ada Auer", PERMISSION_LABELS.editMasterData));

    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(refresh).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: `Ada Auer: ${PERMISSION_LABELS.editUsers}` }),
    ).toBeInTheDocument();
  });

  it("does not re-run it when the change was refused", async () => {
    apiRequest.mockRejectedValue(new Error("Nein."));
    show();

    await userEvent.click(tagIn("Ada Auer", PERMISSION_LABELS.editMasterData));

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

    expect(shown()).toEqual(["Ada Auer", "Bob Berger", "Clara Cerny"]);
  });

  it("narrows to the name that was typed", async () => {
    show();

    await userEvent.type(nameField(), "berg");

    expect(shown()).toEqual(["Bob Berger"]);
  });

  it("narrows to whoever holds a pressed permission", async () => {
    show();

    await userEvent.click(filterTag(PERMISSION_LABELS.editUsers));

    expect(shown()).toEqual(["Ada Auer"]);
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

    expect(shown()).toEqual(["Clara Cerny"]);
  });

  it("reads that tag as an alternative beside a permission", async () => {
    show();

    await userEvent.click(filterTag(NO_PERMISSIONS_LABEL));
    await userEvent.click(filterTag(PERMISSION_LABELS.editUsers));

    expect(shown()).toEqual(["Ada Auer", "Clara Cerny"]);
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

  /** US-48: whether somebody has ever signed in, its own row beside what a teacher may do. */
  it("narrows to whoever has signed in", async () => {
    useRecentLogins.mockReturnValue(new Map([[ADA.uid, ["Fr., 06.09.2026, 14:30:45"]]]));
    show();

    await userEvent.click(filterTag(LOGIN_FILTER_LABELS.some));

    expect(shown()).toEqual(["Ada Auer"]);
  });

  it("narrows to whoever never has", async () => {
    useRecentLogins.mockReturnValue(new Map([[ADA.uid, []]]));
    show();

    await userEvent.click(filterTag(LOGIN_FILTER_LABELS.none));

    expect(shown()).toEqual(["Ada Auer"]);
  });

  it("releases the other side of the same question when pressed", async () => {
    useRecentLogins.mockReturnValue(new Map([[ADA.uid, ["Fr., 06.09.2026, 14:30:45"]]]));
    show();

    await userEvent.click(filterTag(LOGIN_FILTER_LABELS.some));
    await userEvent.click(filterTag(LOGIN_FILTER_LABELS.none));

    expect(filterTag(LOGIN_FILTER_LABELS.some)).toHaveAttribute("aria-pressed", "false");
    expect(filterTag(LOGIN_FILTER_LABELS.none)).toHaveAttribute("aria-pressed", "true");
  });

  it("is cleared by Alle as well", async () => {
    useRecentLogins.mockReturnValue(new Map([[ADA.uid, []]]));
    show();
    await userEvent.click(filterTag(LOGIN_FILTER_LABELS.none));

    await userEvent.click(screen.getByRole("button", { name: `${FILTER_LABEL}: Alle` }));

    expect(shown()).toHaveLength(3);
  });
});

/** US-49: the same names, expanded into a report, in place of the cards a filter narrows. */
describe("UserPermissionsView — the report", () => {
  const reportButton = () => screen.getByRole("button", { name: RIGHTS_REPORT_LABEL });

  it("shows the report in place of the cards, and the filter row either way", async () => {
    show();

    await userEvent.click(reportButton());

    expect(
      screen.queryByRole("textbox", { name: `${FILTER_LABEL}: Name` }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(ADA.email)).toBeInTheDocument();
    expect(reportButton()).toHaveAttribute("aria-pressed", "true");
  });

  it("goes back to the cards when the report is closed again", async () => {
    show();
    await userEvent.click(reportButton());

    await userEvent.click(reportButton());

    expect(screen.getByRole("textbox", { name: `${FILTER_LABEL}: Name` })).toBeInTheDocument();
    expect(reportButton()).toHaveAttribute("aria-pressed", "false");
  });

  it("reports only whoever the filter still shows", async () => {
    teachers({ ...ADA, permissions: ["editUsers"] }, BOB);
    show();
    await userEvent.type(screen.getByRole("textbox", { name: `${FILTER_LABEL}: Name` }), "auer");

    await userEvent.click(reportButton());

    expect(screen.getByText(ADA.email)).toBeInTheDocument();
    expect(screen.queryByText(BOB.email)).not.toBeInTheDocument();
  });

  it("names what the filter is narrowing by, above the report", async () => {
    useRecentLogins.mockReturnValue(new Map([[ADA.uid, ["Fr., 06.09.2026, 14:30:45"]]]));
    show();
    await userEvent.click(
      screen.getByRole("button", { name: `${FILTER_LABEL}: ${LOGIN_FILTER_LABELS.some}` }),
    );

    await userEvent.click(reportButton());

    expect(screen.getByText(LOGIN_FILTER_LABELS.some)).toBeInTheDocument();
  });

  it("says nothing above the report when nothing narrows it", async () => {
    show();

    await userEvent.click(reportButton());

    expect(screen.queryByText(LOGIN_FILTER_LABELS.some)).not.toBeInTheDocument();
  });
});
