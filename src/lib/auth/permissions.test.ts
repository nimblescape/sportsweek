/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  FULL_PERMISSIONS,
  permissionSchema,
  permissionsSchema,
  may,
  mayAny,
  toggledPermissions,
} from "./permissions";

describe("PERMISSIONS", () => {
  /** The navigation's order, which is the one source of order everything else follows. */
  it("runs in the order the pages are shown in", () => {
    expect(PERMISSIONS).toEqual([
      "editRegistrations",
      "editAssignments",
      "viewReports",
      "editReports",
      "editMasterData",
      "editUsers",
    ]);
  });

  it("labels every permission, so a tag can never render undefined", () => {
    for (const permission of PERMISSIONS) {
      expect(PERMISSION_LABELS[permission]).toBeTruthy();
    }
  });
});

/**
 * What the school's first teacher is provisioned with. Not the list itself: two of those cannot
 * be held at once, so "everything" is everything the rules allow together — the stronger of the
 * exclusive pair, never both.
 */
describe("FULL_PERMISSIONS", () => {
  it("is a set the schema accepts", () => {
    expect(permissionsSchema.safeParse([...FULL_PERMISSIONS]).success).toBe(true);
  });

  it("takes the stronger of two that exclude each other", () => {
    expect(FULL_PERMISSIONS).toContain("editReports");
    expect(FULL_PERMISSIONS).not.toContain("viewReports");
  });

  it("leaves out nothing else", () => {
    expect(PERMISSIONS.filter((one) => !FULL_PERMISSIONS.includes(one))).toEqual(["viewReports"]);
  });
});

describe("may", () => {
  it("admits a permission the teacher holds", () => {
    expect(may({ accountType: "teacher", permissions: ["editReports"] }, "editReports")).toBe(true);
  });

  it("refuses one they do not hold, whichever others they do", () => {
    expect(may({ accountType: "teacher", permissions: ["editUsers"] }, "editMasterData")).toBe(
      false,
    );
  });

  it("refuses everything to a teacher holding none at all", () => {
    for (const permission of PERMISSIONS) {
      expect(may({ accountType: "teacher", permissions: [] }, permission)).toBe(false);
    }
  });

  /**
   * An account type is which population somebody belongs to, derived once from the UPN domain
   * and granted by nobody (US-3). A student is refused ahead of anything their record lists.
   */
  it("refuses a student everything, even what their record lists", () => {
    for (const permission of PERMISSIONS) {
      expect(may({ accountType: "student", permissions: [...PERMISSIONS] }, permission)).toBe(
        false,
      );
    }
  });
});

/** The report page is reached by either of two permissions, so some questions take a list. */
describe("mayAny", () => {
  it("admits somebody holding any one of them", () => {
    const holder = { accountType: "teacher", permissions: ["viewReports"] } as const;

    expect(mayAny(holder, ["viewReports", "editReports"])).toBe(true);
  });

  it("refuses somebody holding none of them", () => {
    const holder = { accountType: "teacher", permissions: ["editMasterData"] } as const;

    expect(mayAny(holder, ["viewReports", "editReports"])).toBe(false);
  });

  it("refuses a student holding all of them", () => {
    const holder = { accountType: "student", permissions: ["viewReports", "editReports"] } as const;

    expect(mayAny(holder, ["viewReports", "editReports"])).toBe(false);
  });
});

describe("toggledPermissions", () => {
  it("presses one that was not held", () => {
    expect(toggledPermissions([], "editAssignments")).toEqual(["editAssignments"]);
  });

  it("releases one that was held", () => {
    expect(toggledPermissions(["editAssignments", "editUsers"], "editUsers")).toEqual([
      "editAssignments",
    ]);
  });

  it("returns them in the order the tags are shown, however they arrived", () => {
    expect(toggledPermissions(["editUsers", "editRegistrations"], "editAssignments")).toEqual([
      "editRegistrations",
      "editAssignments",
      "editUsers",
    ]);
  });

  /**
   * Both open the report page, so holding both says nothing the stronger does not say already.
   * Pressing either clears the other rather than adding to it.
   */
  it("clears viewReports when editReports is pressed", () => {
    expect(toggledPermissions(["viewReports"], "editReports")).toEqual(["editReports"]);
  });

  it("clears editReports when viewReports is pressed", () => {
    expect(toggledPermissions(["editReports"], "viewReports")).toEqual(["viewReports"]);
  });

  it("leaves the rest alone while swapping the two", () => {
    expect(
      toggledPermissions(["editAssignments", "viewReports", "editUsers"], "editReports"),
    ).toEqual(["editAssignments", "editReports", "editUsers"]);
  });

  it("releases the one that was pressed, leaving neither", () => {
    expect(toggledPermissions(["editReports"], "editReports")).toEqual([]);
    expect(toggledPermissions(["viewReports"], "viewReports")).toEqual([]);
  });
});

describe("permissionSchema", () => {
  it("accepts every permission", () => {
    for (const permission of PERMISSIONS) {
      expect(permissionSchema.parse(permission)).toBe(permission);
    }
  });

  it("refuses one nothing offers", () => {
    expect(permissionSchema.safeParse("superuser").success).toBe(false);
  });

  it("refuses the words that say what somebody is rather than what they may do", () => {
    expect(permissionSchema.safeParse("teacher").success).toBe(false);
    expect(permissionSchema.safeParse("student").success).toBe(false);
  });
});

describe("permissionsSchema", () => {
  it("reads a missing list as none, so a record written before this existed grants nothing", () => {
    expect(permissionsSchema.parse(undefined)).toEqual([]);
  });

  it("accepts either of the two on its own", () => {
    expect(permissionsSchema.safeParse(["viewReports"]).success).toBe(true);
    expect(permissionsSchema.safeParse(["editReports"]).success).toBe(true);
  });

  /** Refused rather than repaired: a caller asking for both has misunderstood something. */
  it("refuses holding both of two that exclude each other", () => {
    expect(permissionsSchema.safeParse(["viewReports", "editReports"]).success).toBe(false);
  });

  it("refuses a repeated permission, which would let one tag be stored twice", () => {
    expect(permissionsSchema.safeParse(["viewReports", "viewReports"]).success).toBe(false);
  });

  it("refuses a list longer than there are permissions", () => {
    expect(permissionsSchema.safeParse([...PERMISSIONS, "viewReports"]).success).toBe(false);
  });
});
