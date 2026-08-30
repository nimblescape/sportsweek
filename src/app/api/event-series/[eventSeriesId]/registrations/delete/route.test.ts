/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthenticatedUser = vi.fn();
const deleteRegistration = vi.fn();

vi.mock("@/lib/auth/guards", () => ({ getAuthenticatedUser: () => getAuthenticatedUser() }));
vi.mock("@/lib/registration/registration-service", () => ({
  deleteRegistration: (...args: unknown[]) => deleteRegistration(...args),
}));

const { POST } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");
const { ErrorCode } = await import("@/lib/errors");

const TEACHER = "jane.doe@htldornbirn.at";
const STUDENT = "max.mustermann@student.htldornbirn.at";

const params = Promise.resolve({ eventSeriesId: "s1" });

const post = (body: unknown) =>
  POST(
    new Request("https://example.com/api/event-series/s1/registrations/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params },
  );

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedUser.mockResolvedValue({
    uid: "u1",
    email: TEACHER,
    accountType: "teacher",
    permissions: ["editRegistrations"],
  });
  deleteRegistration.mockResolvedValue(undefined);
});

describe("POST /api/event-series/[eventSeriesId]/registrations/delete", () => {
  it("removes the registration the body names", async () => {
    const response = await post({ studentUid: STUDENT });

    expect(response.status).toBe(204);
    expect(deleteRegistration).toHaveBeenCalledWith("s1", STUDENT);
  });

  /**
   * A uid is case-sensitive, and Firebase mints them mixed-case. Folding one is not a kindness
   * to the caller, it names a document that does not exist (US-31).
   */
  it("passes the uid on exactly as it was given", async () => {
    await post({ studentUid: "AbCdEf0123456789" });

    expect(deleteRegistration).toHaveBeenCalledWith("s1", "AbCdEf0123456789");
  });

  it("refuses a body naming nobody", async () => {
    const response = await post({});

    expect(response.status).toBe(400);
    expect(deleteRegistration).not.toHaveBeenCalled();
  });

  /** An address is a document id once stored, and a path separator would fork the path. */
  it("refuses an address that could not be a document id", async () => {
    const response = await post({ studentUid: "a/b@student.htldornbirn.at" });

    expect(response.status).toBe(400);
    expect(deleteRegistration).not.toHaveBeenCalled();
  });

  /** Strict, so a body reaching for the series it deletes from fails rather than being dropped. */
  it("refuses a body naming the event series, which the path decides", async () => {
    const response = await post({ studentUid: STUDENT, eventSeriesId: "other" });

    expect(response.status).toBe(400);
    expect(deleteRegistration).not.toHaveBeenCalled();
  });

  /** A student who is not coming answers "no" (US-11); removing one is a teacher's doing. */
  it("refuses a student, and writes nothing", async () => {
    getAuthenticatedUser.mockResolvedValue({ uid: "u2", email: STUDENT, accountType: "student" });

    const response = await post({ studentUid: STUDENT });

    expect(response.status).toBe(403);
    expect(deleteRegistration).not.toHaveBeenCalled();
  });

  /** Removing somebody from the series is planning, not reporting on what was planned. */
  it("refuses a teacher who may not edit registrations", async () => {
    getAuthenticatedUser.mockResolvedValue({
      uid: "u3",
      email: "t2@htldornbirn.at",
      accountType: "teacher",
      permissions: ["viewReports", "editAssignments", "editMasterData"],
    });

    const response = await post({ studentUid: STUDENT });

    expect(response.status).toBe(403);
    expect(deleteRegistration).not.toHaveBeenCalled();
  });

  it("refuses a caller with no session at all", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    const response = await post({ studentUid: STUDENT });

    expect(response.status).toBe(401);
    expect(deleteRegistration).not.toHaveBeenCalled();
  });

  it("passes on what the service refused, and its wording", async () => {
    deleteRegistration.mockRejectedValue(
      new ServiceError(ErrorCode.Conflict, "Archiviert ist schreibgeschützt."),
    );

    const response = await post({ studentUid: STUDENT });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: "Archiviert ist schreibgeschützt." },
    });
  });
});
