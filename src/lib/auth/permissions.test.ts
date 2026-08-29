/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  permissionSchema,
  permissionsSchema,
  may,
  toggledPermissions,
} from "./permissions";

describe("PERMISSIONS", () => {
  it("runs from the least a teacher may do to the most, which is the order the tags are shown in", () => {
    expect(PERMISSIONS).toEqual([
      "viewReports",
      "editReports",
      "editAssignments",
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

describe("may", () => {
  it("admits a permission the teacher holds", () => {
    expect(may({ accountType: "teacher", permissions: ["editReports"] }, "editReports")).toBe(true);
  });

  /**
   * There is no rank: the order above is the tag row's, so holding the permission that happens
   * to sit highest grants nothing but itself, and each is asked for by name.
   */
  it("refuses a permission the teacher does not hold, whichever others they do", () => {
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
   * and granted by nobody (US-3). A student is therefore refused ahead of anything their record
   * happens to carry, so a set written there by mistake grants nothing.
   */
  it("refuses a student everything, even what their record lists", () => {
    for (const permission of PERMISSIONS) {
      expect(may({ accountType: "student", permissions: [...PERMISSIONS] }, permission)).toBe(
        false,
      );
    }
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
    expect(toggledPermissions(["editUsers", "viewReports"], "editAssignments")).toEqual([
      "viewReports",
      "editAssignments",
      "editUsers",
    ]);
  });

  /** Saving a report you may not see is not a state worth being able to describe. */
  it("presses viewReports along with editReports", () => {
    expect(toggledPermissions([], "editReports")).toEqual(["viewReports", "editReports"]);
  });

  it("releases editReports along with viewReports", () => {
    expect(toggledPermissions(["viewReports", "editReports"], "viewReports")).toEqual([]);
  });

  it("leaves editReports alone when something it does not depend on is released", () => {
    expect(toggledPermissions(["viewReports", "editReports", "editUsers"], "editUsers")).toEqual([
      "viewReports",
      "editReports",
    ]);
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

  it("accepts a list that satisfies what its permissions depend on", () => {
    expect(permissionsSchema.parse(["viewReports", "editReports"])).toEqual([
      "viewReports",
      "editReports",
    ]);
  });

  /** Refused rather than repaired: a caller asking for this has misunderstood something. */
  it("refuses editReports without viewReports", () => {
    expect(permissionsSchema.safeParse(["editReports"]).success).toBe(false);
  });

  it("refuses a repeated permission, which would let one tag be stored twice", () => {
    expect(permissionsSchema.safeParse(["viewReports", "viewReports"]).success).toBe(false);
  });

  it("refuses a list longer than there are permissions", () => {
    expect(permissionsSchema.safeParse([...PERMISSIONS, "viewReports"]).success).toBe(false);
  });
});
