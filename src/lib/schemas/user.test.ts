import { describe, expect, it } from "vitest";
import { userLockedFields, userRoleSchema, userSchema } from "@/lib/schemas/user";

const validUser = {
  id: "jane.doe@htldornbirn.at",
  firstName: "Jane",
  lastName: "Doe",
  email: "jane.doe@htldornbirn.at",
  role: "teacher",
};

describe("userRoleSchema", () => {
  it.each(["teacher", "student"])("accepts the %s role", (role) => {
    expect(userRoleSchema.safeParse(role).success).toBe(true);
  });

  it("rejects an admin role, which this app does not have", () => {
    expect(userRoleSchema.safeParse("admin").success).toBe(false);
  });
});

describe("userSchema", () => {
  it("parses a valid user record", () => {
    expect(userSchema.parse(validUser)).toEqual(validUser);
  });

  it("uses the UPN as the document id", () => {
    expect(userSchema.parse(validUser).id).toBe("jane.doe@htldornbirn.at");
  });

  it("rejects a malformed email address", () => {
    expect(userSchema.safeParse({ ...validUser, email: "not-an-email" }).success).toBe(false);
  });

  it.each(["firstName", "lastName"])("requires %s", (field) => {
    expect(userSchema.safeParse({ ...validUser, [field]: "" }).success).toBe(false);
  });

  it("stores exactly one role, not an array", () => {
    expect(userSchema.safeParse({ ...validUser, role: ["teacher"] }).success).toBe(false);
  });
});

describe("userLockedFields", () => {
  it("locks the role so firestore.rules can deny every client write to it", () => {
    expect(Object.keys(userLockedFields.shape)).toEqual(["role"]);
  });
});
