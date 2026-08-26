/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserWithRole = vi.fn();
const assignStudents = vi.fn();

vi.mock("@/lib/auth/guards", () => ({
  getUserWithRole: () => getUserWithRole(),
}));

vi.mock("@/lib/assignment/assignment-service", () => ({
  assignStudents: (...args: unknown[]) => assignStudents(...args),
}));

const { PATCH } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");

function patchRequest(body: unknown) {
  return new Request("https://example.com/api/assignments", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getUserWithRole.mockReset();
  assignStudents.mockReset();
  getUserWithRole.mockResolvedValue({ uid: "u1", email: "t@htldornbirn.at", role: "teacher" });
  assignStudents.mockResolvedValue(undefined);
});

describe("PATCH /api/assignments", () => {
  it("assigns the whole selection in one call", async () => {
    const response = await PATCH(patchRequest({ recordIds: ["r1", "r2"], eventId: "event1" }));

    expect(response.status).toBe(204);
    expect(assignStudents).toHaveBeenCalledWith(["r1", "r2"], "event1");
  });

  it("unassigns when no event is named", async () => {
    const response = await PATCH(patchRequest({ recordIds: ["r1"], eventId: null }));

    expect(response.status).toBe(204);
    expect(assignStudents).toHaveBeenCalledWith(["r1"], null);
  });

  it("rejects a student with 403, so a bypassed client cannot assign", async () => {
    getUserWithRole.mockResolvedValue({
      uid: "u2",
      email: "s@student.htldornbirn.at",
      role: "student",
    });

    const response = await PATCH(patchRequest({ recordIds: ["r1"], eventId: "event1" }));

    expect(response.status).toBe(403);
    expect(assignStudents).not.toHaveBeenCalled();
  });

  it("rejects a caller who is not signed in with 401", async () => {
    getUserWithRole.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ recordIds: ["r1"], eventId: null }));

    expect(response.status).toBe(401);
    expect(assignStudents).not.toHaveBeenCalled();
  });

  it("rejects a call that names nobody, which would be a write with nothing to write", async () => {
    const response = await PATCH(patchRequest({ recordIds: [], eventId: "event1" }));

    expect(response.status).toBe(400);
    expect(assignStudents).not.toHaveBeenCalled();
  });

  it("rejects a missing event field rather than guessing at unassignment", async () => {
    const response = await PATCH(patchRequest({ recordIds: ["r1"] }));

    expect(response.status).toBe(400);
    expect(assignStudents).not.toHaveBeenCalled();
  });

  it("rejects a field the request has no business sending", async () => {
    const response = await PATCH(
      patchRequest({ recordIds: ["r1"], eventId: null, isIncomplete: false }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("maps a refused assignment onto its status, with the reason the service gave", async () => {
    assignStudents.mockRejectedValue(
      new ServiceError("CONFLICT", "Wer nicht teilnimmt, kann keinem Event zugeteilt werden."),
    );

    const response = await PATCH(patchRequest({ recordIds: ["r1"], eventId: "event1" }));

    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toBe(
      "Wer nicht teilnimmt, kann keinem Event zugeteilt werden.",
    );
  });

  it("sanitises an unexpected failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    assignStudents.mockRejectedValue(new Error("Firestore is on fire at /internal/path"));

    const response = await PATCH(patchRequest({ recordIds: ["r1"], eventId: null }));

    expect(response.status).toBe(500);
    expect((await response.json()).error.message).toBe("Das hat leider nicht geklappt.");
  });
});
