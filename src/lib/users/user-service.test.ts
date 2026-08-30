/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";
import { ErrorCode } from "@/lib/errors";

const firestore = new FakeFirestore();
vi.mock("@/lib/firebase/admin", () => ({ adminDb: firestore }));

const { grantPermissions, SELF_DEMOTION_HINT, NOT_A_TEACHER_HINT } =
  await import("@/lib/users/user-service");

const USERS = "users";
const ADMIN = "uidAda";
const OTHER = "uidBob";
const STUDENT = "uidSam";

function seedTeacher(uid: string, permissions: string[]) {
  firestore.seed(USERS, uid, {
    firstName: "T",
    lastName: uid,
    email: `${uid}@htldornbirn.at`,
    accountType: "teacher",
    permissions,
  });
}

beforeEach(() => {
  firestore.reset();
  seedTeacher(ADMIN, ["editUsers"]);
  seedTeacher(OTHER, []);
});

describe("grantPermissions", () => {
  it("stores what the admin granted", async () => {
    await grantPermissions(OTHER, ["viewReports", "editAssignments"], ADMIN);

    expect(firestore.get(USERS, OTHER)?.permissions).toEqual(["viewReports", "editAssignments"]);
  });

  it("stores an empty set, which is how somebody is shut out again", async () => {
    seedTeacher(OTHER, ["editMasterData"]);

    await grantPermissions(OTHER, [], ADMIN);

    expect(firestore.get(USERS, OTHER)?.permissions).toEqual([]);
  });

  it("leaves every other field of the record alone", async () => {
    await grantPermissions(OTHER, ["viewReports"], ADMIN);

    expect(firestore.get(USERS, OTHER)).toMatchObject({
      email: `${OTHER}@htldornbirn.at`,
      accountType: "teacher",
      firstName: "T",
    });
  });

  /**
   * The guard that keeps somebody able to hand permissions out. Only the holder can be the last
   * one, since anyone else removing it would need it themselves — so refusing self-removal is
   * what keeps at least one, without ever counting them (US-2).
   */
  it("refuses to take editUsers off the person doing the granting", async () => {
    await expect(grantPermissions(ADMIN, ["viewReports"], ADMIN)).rejects.toMatchObject({
      code: ErrorCode.Conflict,
      message: SELF_DEMOTION_HINT,
    });

    expect(firestore.get(USERS, ADMIN)?.permissions).toEqual(["editUsers"]);
  });

  it("lets an admin change their own other permissions", async () => {
    seedTeacher(ADMIN, ["editUsers", "editMasterData"]);

    await grantPermissions(ADMIN, ["editUsers", "viewReports"], ADMIN);

    expect(firestore.get(USERS, ADMIN)?.permissions).toEqual(["editUsers", "viewReports"]);
  });

  it("lets an admin take editUsers off somebody else", async () => {
    seedTeacher(OTHER, ["editUsers"]);

    await grantPermissions(OTHER, [], ADMIN);

    expect(firestore.get(USERS, OTHER)?.permissions).toEqual([]);
  });

  /** A permission says what a teacher may do; a student is not one, so there is nothing to say. */
  it("refuses to grant anything to a student", async () => {
    firestore.seed(USERS, STUDENT, { email: STUDENT, accountType: "student", permissions: [] });

    await expect(grantPermissions(STUDENT, ["viewReports"], ADMIN)).rejects.toMatchObject({
      code: ErrorCode.Conflict,
      message: NOT_A_TEACHER_HINT,
    });

    expect(firestore.get(USERS, STUDENT)?.permissions).toEqual([]);
  });

  it("refuses a person who has never signed in", async () => {
    await expect(
      grantPermissions("nobody@htldornbirn.at", ["viewReports"], ADMIN),
    ).rejects.toMatchObject({ code: ErrorCode.NotFound });
  });

  /** A caller cannot name a permission that does not exist, nor two that exclude each other. */
  it("refuses a set the schema will not have", async () => {
    await expect(
      grantPermissions(OTHER, ["viewReports", "editReports"], ADMIN),
    ).rejects.toMatchObject({ code: ErrorCode.ValidationError });

    expect(firestore.get(USERS, OTHER)?.permissions).toEqual([]);
  });
});
