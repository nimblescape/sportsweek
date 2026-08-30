/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { userLockedFields, accountTypeSchema, userSchema } from "@/lib/schemas/user";

const validUser = {
  id: "jane.doe@htldornbirn.at",
  firstName: "Jane",
  lastName: "Doe",
  email: "jane.doe@htldornbirn.at",
  accountType: "teacher",
  permissions: [],
};

describe("accountTypeSchema", () => {
  it.each(["teacher", "student"])("accepts the %s role", (role) => {
    expect(accountTypeSchema.safeParse(role).success).toBe(true);
  });

  it("rejects an admin role, which this app does not have", () => {
    expect(accountTypeSchema.safeParse("admin").success).toBe(false);
  });
});

describe("userSchema", () => {
  it("parses a valid user record", () => {
    expect(userSchema.parse(validUser)).toEqual(validUser);
  });

  it("uses the address as the document id", () => {
    expect(userSchema.parse(validUser).id).toBe("jane.doe@htldornbirn.at");
  });

  it("rejects a malformed email address", () => {
    expect(userSchema.safeParse({ ...validUser, email: "not-an-email" }).success).toBe(false);
  });

  it.each(["firstName", "lastName"])("requires %s", (field) => {
    expect(userSchema.safeParse({ ...validUser, [field]: "" }).success).toBe(false);
  });

  it("stores exactly one role, not an array", () => {
    expect(userSchema.safeParse({ ...validUser, accountType: ["teacher"] }).success).toBe(false);
  });
});

describe("userLockedFields", () => {
  it("locks what no client may ever write, so firestore.rules can deny it", () => {
    expect(Object.keys(userLockedFields.shape)).toEqual(["accountType", "permissions"]);
  });
});
