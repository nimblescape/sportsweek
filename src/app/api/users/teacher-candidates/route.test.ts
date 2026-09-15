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

const listTeacherCandidates = vi.fn();
vi.mock("@/lib/users/user-service", () => ({ listTeacherCandidates }));

const { GET } = await import("@/app/api/users/teacher-candidates/route");

const CANDIDATE = {
  uid: "uid-of-ada",
  firstName: "Ada",
  lastName: "Musterfrau",
  email: "ada@htldornbirn.at",
};

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedUser.mockResolvedValue({
    uid: "uid-of-admin",
    email: "admin@htldornbirn.at",
    accountType: "teacher",
    permissions: ["editMasterData"],
  });
  listTeacherCandidates.mockResolvedValue([CANDIDATE]);
});

describe("GET /api/users/teacher-candidates", () => {
  it("answers with every candidate the service names", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ candidates: [CANDIDATE] });
  });

  /** The editor has no use for either, and a teacher's own record is not this route's to hand out. */
  it("never carries permissions or a photo, only what the service itself returns", async () => {
    const response = await GET();

    const body = (await response.json()) as { candidates: unknown[] };
    for (const candidate of body.candidates) {
      expect(candidate).not.toHaveProperty("permissions");
      expect(candidate).not.toHaveProperty("photo");
    }
  });

  it("refuses a teacher without editMasterData", async () => {
    getAuthenticatedUser.mockResolvedValue({
      uid: "uid-of-other",
      email: "other@htldornbirn.at",
      accountType: "teacher",
      permissions: ["editUsers"],
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(listTeacherCandidates).not.toHaveBeenCalled();
  });

  it("refuses a caller with no session", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(listTeacherCandidates).not.toHaveBeenCalled();
  });

  it("passes a service refusal on in the shared envelope", async () => {
    listTeacherCandidates.mockRejectedValue(
      new ServiceError(ErrorCode.InternalError, "Das hat leider nicht geklappt."),
    );

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: ErrorCode.InternalError },
    });
  });
});
