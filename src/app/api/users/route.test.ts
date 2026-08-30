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

const { PATCH } = await import("@/app/api/users/route");

const ADMIN = "ada@htldornbirn.at";
const TARGET = "bob@htldornbirn.at";

const patch = (body: unknown) =>
  PATCH(
    new Request("http://localhost/api/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
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

describe("PATCH /api/users", () => {
  it("grants the set the admin named", async () => {
    const response = await patch({ upn: TARGET, permissions: ["viewReports"] });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ permissions: ["viewReports"] });
    expect(grantPermissions).toHaveBeenCalledWith(TARGET, ["viewReports"], ADMIN);
  });

  /**
   * The subject travels in the body rather than the path, so no address reaches the request log
   * the platform keeps of every URL (US-33).
   */
  it("names nobody in the URL", async () => {
    const response = await patch({ upn: TARGET, permissions: [] });

    expect(new URL(response.url || "http://localhost/api/users").pathname).toBe("/api/users");
  });

  /** Records are keyed by the lower-cased address, so the stored id is what is looked up. */
  it("lower-cases the address it was given", async () => {
    await patch({ upn: "Bob@HTLDornbirn.at", permissions: [] });

    expect(grantPermissions).toHaveBeenCalledWith(TARGET, [], ADMIN);
  });

  it("refuses a body naming nobody", async () => {
    const response = await patch({ permissions: ["viewReports"] });

    expect(response.status).toBe(400);
    expect(grantPermissions).not.toHaveBeenCalled();
  });

  /** An address is a document id once stored, and a path separator would fork the path. */
  it("refuses an address that could not be a document id", async () => {
    const response = await patch({ upn: "a/b@htldornbirn.at", permissions: [] });

    expect(response.status).toBe(400);
    expect(grantPermissions).not.toHaveBeenCalled();
  });

  /** Who is granting comes from the session, so a body cannot name somebody else as the actor. */
  it("takes the granting person from the session and refuses one named in the body", async () => {
    const response = await patch({
      upn: TARGET,
      permissions: [],
      actorUpn: "someone.else@htldornbirn.at",
    });

    expect(response.status).toBe(400);
    expect(grantPermissions).not.toHaveBeenCalled();
  });

  it("refuses a permission nothing offers", async () => {
    const response = await patch({ upn: TARGET, permissions: ["superuser"] });

    expect(response.status).toBe(400);
    expect(grantPermissions).not.toHaveBeenCalled();
  });

  it("refuses a body with nothing to grant", async () => {
    const response = await patch({ upn: TARGET });

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

    const response = await patch({ upn: TARGET, permissions: ["viewReports"] });

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

    expect((await patch({ upn: TARGET, permissions: [] })).status).toBe(403);
    expect(grantPermissions).not.toHaveBeenCalled();
  });

  it("refuses a caller with no session", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    expect((await patch({ upn: TARGET, permissions: [] })).status).toBe(401);
    expect(grantPermissions).not.toHaveBeenCalled();
  });

  it("passes a service refusal on in the shared envelope", async () => {
    grantPermissions.mockRejectedValue(new ServiceError(ErrorCode.Conflict, "self"));

    const response = await patch({ upn: TARGET, permissions: [] });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: ErrorCode.Conflict, message: "self" },
    });
  });
});
