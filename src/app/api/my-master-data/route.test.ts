/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserWithRole = vi.fn();
const saveStudentMasterData = vi.fn();

vi.mock("@/lib/auth/guards", () => ({
  getUserWithRole: () => getUserWithRole(),
}));

vi.mock("@/lib/student-master-data/student-master-data-service", () => ({
  saveStudentMasterData: (...args: unknown[]) => saveStudentMasterData(...args),
}));

const { PUT } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");
const { NO_ACTIVE_SEASON_HINT } = await import("@/lib/student-master-data/registration");

const STUDENT = "jane.doe@student.htldornbirn.at";

const body = {
  isAttendingSportsWeek: true,
  class: "3AHME",
  program: "Ski",
  skillLevel: "Anfänger",
  busPickupPoint: "HTL Dornbirn",
  foodOption: "Vegetarisch",
  foodOtherText: null,
  seasonPassOption: "Keine",
  dateOfBirth: "2008-05-04",
  gender: "female",
  phoneNumber: "+436601234567",
  emergencyContact: {
    firstName: "Maria",
    lastName: "Doe",
    relationship: "mother",
    relationshipOtherText: null,
    phoneNumber: "+436501234567",
  },
  healthNotes: null,
  hasMedication: false,
  equipmentRentalNeeded: false,
  rentedEquipment: [],
  shoeSize: null,
  heightCm: null,
  weightKg: null,
};

function putRequest(payload: unknown) {
  return new Request("https://example.com/api/my-master-data", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  getUserWithRole.mockReset();
  saveStudentMasterData.mockReset();
  getUserWithRole.mockResolvedValue({ uid: "u1", email: STUDENT, role: "student" });
  saveStudentMasterData.mockResolvedValue({ id: "s1__jane", seasonId: "s1", ...body });
});

describe("PUT /api/my-master-data", () => {
  it("saves the registration and returns it", async () => {
    const response = await PUT(putRequest(body));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ record: { id: "s1__jane" } });
  });

  /** The record is keyed by who is signed in, never by a user id the caller supplies (US-11). */
  it("saves it for the signed-in student, not for whoever the body names", async () => {
    await PUT(putRequest(body));

    expect(saveStudentMasterData).toHaveBeenCalledWith(STUDENT, expect.objectContaining(body));
  });

  it("rejects an anonymous caller with 401", async () => {
    getUserWithRole.mockResolvedValue(null);

    const response = await PUT(putRequest(body));

    expect(response.status).toBe(401);
    expect(saveStudentMasterData).not.toHaveBeenCalled();
  });

  it("rejects a teacher with 403, since a teacher keeps no master data of their own", async () => {
    getUserWithRole.mockResolvedValue({ uid: "u2", email: "t@htldornbirn.at", role: "teacher" });

    const response = await PUT(putRequest(body));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "PERMISSION_DENIED" } });
    expect(saveStudentMasterData).not.toHaveBeenCalled();
  });

  it("rejects a student whose session carries no address to key the record by", async () => {
    getUserWithRole.mockResolvedValue({ uid: "u1", email: null, role: "student" });

    const response = await PUT(putRequest(body));

    expect(response.status).toBe(401);
    expect(saveStudentMasterData).not.toHaveBeenCalled();
  });

  it("returns the shared validation envelope for an incomplete registration", async () => {
    const response = await PUT(putRequest({ ...body, program: null }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error.code).toBe("VALIDATION_ERROR");
    expect(payload.error.details).toBeDefined();
    expect(saveStudentMasterData).not.toHaveBeenCalled();
  });

  it("refuses a body that names the season or the student itself", async () => {
    const response = await PUT(putRequest({ ...body, seasonId: "other" }));

    expect(response.status).toBe(400);
    expect(saveStudentMasterData).not.toHaveBeenCalled();
  });

  it("passes the service's own answer through when no season is active", async () => {
    saveStudentMasterData.mockRejectedValue(new ServiceError("CONFLICT", NO_ACTIVE_SEASON_HINT));

    const response = await PUT(putRequest(body));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "CONFLICT", message: NO_ACTIVE_SEASON_HINT },
    });
  });

  it("sanitises an unexpected failure into a 500", async () => {
    saveStudentMasterData.mockRejectedValue(new Error("Firestore is down"));

    const response = await PUT(putRequest(body));

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("Firestore is down");
  });

  it("rejects a body that is not JSON at all", async () => {
    const response = await PUT(
      new Request("https://example.com/api/my-master-data", { method: "PUT", body: "not json" }),
    );

    expect(response.status).toBe(400);
    expect(saveStudentMasterData).not.toHaveBeenCalled();
  });
});
