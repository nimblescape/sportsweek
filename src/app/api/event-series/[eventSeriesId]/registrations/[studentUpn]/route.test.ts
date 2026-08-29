/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserWithRole = vi.fn();
const deleteRegistration = vi.fn();

vi.mock("@/lib/auth/guards", () => ({ getUserWithRole: () => getUserWithRole() }));
vi.mock("@/lib/registration/registration-service", () => ({
  deleteRegistration: (...args: unknown[]) => deleteRegistration(...args),
}));

const { DELETE } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");
const { ErrorCode } = await import("@/lib/errors");

const TEACHER = "jane.doe@htldornbirn.at";
const STUDENT = "max.mustermann@student.htldornbirn.at";

const request = new Request("https://example.com/api/event-series/s1/registrations/max");
const paramsFor = (studentUpn: string) => Promise.resolve({ eventSeriesId: "s1", studentUpn });

beforeEach(() => {
  vi.clearAllMocks();
  getUserWithRole.mockResolvedValue({ uid: "u1", email: TEACHER, role: "teacher" });
  deleteRegistration.mockResolvedValue(undefined);
});

describe("DELETE /api/event-series/[eventSeriesId]/registrations/[studentUpn]", () => {
  it("removes the registration the address names", async () => {
    const response = await DELETE(request, { params: paramsFor(STUDENT) });

    expect(response.status).toBe(204);
    expect(deleteRegistration).toHaveBeenCalledWith("s1", STUDENT);
  });

  /** A UPN is an address, and an address in a path arrives encoded. */
  it("decodes the student the path names", async () => {
    await DELETE(request, { params: paramsFor(encodeURIComponent(STUDENT)) });

    expect(deleteRegistration).toHaveBeenCalledWith("s1", STUDENT);
  });

  /** A student who is not coming answers "no" (US-11); removing one is a teacher's doing. */
  it("refuses a student, and writes nothing", async () => {
    getUserWithRole.mockResolvedValue({ uid: "u2", email: STUDENT, role: "student" });

    const response = await DELETE(request, { params: paramsFor(STUDENT) });

    expect(response.status).toBe(403);
    expect(deleteRegistration).not.toHaveBeenCalled();
  });

  it("refuses a caller with no session at all", async () => {
    getUserWithRole.mockResolvedValue(null);

    const response = await DELETE(request, { params: paramsFor(STUDENT) });

    expect(response.status).toBe(401);
    expect(deleteRegistration).not.toHaveBeenCalled();
  });

  it("passes on what the service refused, and its wording", async () => {
    deleteRegistration.mockRejectedValue(
      new ServiceError(ErrorCode.Conflict, "Archiviert ist schreibgeschützt."),
    );

    const response = await DELETE(request, { params: paramsFor(STUDENT) });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: "Archiviert ist schreibgeschützt." },
    });
  });
});
