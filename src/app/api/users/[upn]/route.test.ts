/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";

const getAuthenticatedUser = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ getAuthenticatedUser }));

const grantPermissions = vi.fn();
vi.mock("@/lib/users/user-service", () => ({
  grantPermissions,
  SELF_DEMOTION_HINT: "self",
  NOT_A_TEACHER_HINT: "not a teacher",
}));

const { PATCH } = await import("@/app/api/users/[upn]/route");

const ADMIN = "ada@htldornbirn.at";
const TARGET = "bob@htldornbirn.at";

const patch = (body: unknown, upn = TARGET) =>
  PATCH(
    new Request("http://localhost/api/users/x", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ upn: encodeURIComponent(upn) }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedUser.mockResolvedValue({
    uid: "u1",
    email: ADMIN,
    accountType: "teacher",
    permissions: ["editUsers"],
  });
  grantPermissions.mockResolvedValue(["viewReports"]);
});

describe("PATCH /api/users/[upn]", () => {
  it("grants the set the admin named", async () => {
    const response = await patch({ permissions: ["viewReports"] });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ permissions: ["viewReports"] });
    expect(grantPermissions).toHaveBeenCalledWith(TARGET, ["viewReports"], ADMIN);
  });

  /** A UPN is an address, and an address in a path arrives encoded. */
  it("decodes the person the path names", async () => {
    await patch({ permissions: [] }, "o'neill@htldornbirn.at");

    expect(grantPermissions).toHaveBeenCalledWith("o'neill@htldornbirn.at", [], ADMIN);
  });

  /** Who is granting comes from the session, so a body cannot name somebody else as the actor. */
  it("takes the granting person from the session and refuses one named in the body", async () => {
    const response = await patch({ permissions: [], actorUpn: "someone.else@htldornbirn.at" });

    expect(response.status).toBe(400);
    expect(grantPermissions).not.toHaveBeenCalled();
  });

  it("refuses a permission nothing offers", async () => {
    const response = await patch({ permissions: ["superuser"] });

    expect(response.status).toBe(400);
    expect(grantPermissions).not.toHaveBeenCalled();
  });

  it("refuses a body with nothing to grant", async () => {
    const response = await patch({});

    expect(response.status).toBe(400);
    expect(grantPermissions).not.toHaveBeenCalled();
  });

  it("refuses a teacher who may not edit users", async () => {
    getAuthenticatedUser.mockResolvedValue({
      uid: "u2",
      email: "t2@htldornbirn.at",
      accountType: "teacher",
      permissions: ["editMasterData", "editAssignments", "viewReports"],
    });

    const response = await patch({ permissions: ["viewReports"] });

    expect(response.status).toBe(403);
    expect(grantPermissions).not.toHaveBeenCalled();
  });

  it("refuses a student", async () => {
    getAuthenticatedUser.mockResolvedValue({
      uid: "u3",
      email: "s@student.htldornbirn.at",
      accountType: "student",
      permissions: ["editUsers"],
    });

    expect((await patch({ permissions: [] })).status).toBe(403);
    expect(grantPermissions).not.toHaveBeenCalled();
  });

  it("refuses a caller with no session", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    expect((await patch({ permissions: [] })).status).toBe(401);
    expect(grantPermissions).not.toHaveBeenCalled();
  });

  it("passes a service refusal on in the shared envelope", async () => {
    grantPermissions.mockRejectedValue(new ServiceError(ErrorCode.Conflict, "self"));

    const response = await patch({ permissions: [] });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: ErrorCode.Conflict, message: "self" },
    });
  });
});
