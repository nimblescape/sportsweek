/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthenticatedUser = vi.fn();
const createInvitation = vi.fn();
const invitationsOf = vi.fn();

vi.mock("@/lib/auth/guards", () => ({ getAuthenticatedUser: () => getAuthenticatedUser() }));
vi.mock("@/lib/invitations/invitation-service", () => ({
  createInvitation: (...args: unknown[]) => createInvitation(...args),
  invitationsOf: (...args: unknown[]) => invitationsOf(...args),
}));

const { GET, POST } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");

const TEACHER = {
  uid: "u1",
  email: "t@htldornbirn.at",
  accountType: "teacher",
  permissions: ["editAssignments"],
};
const STUDENT = { uid: "u2", email: "s@student.htldornbirn.at", accountType: "student" };

function request(body: unknown) {
  return new Request("https://example.com/api/event-series/s1/invitations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ eventSeriesId: "s1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedUser.mockResolvedValue(TEACHER);
  createInvitation.mockResolvedValue({ token: "tok", eventSeriesId: "s1", class: "3aWI" });
  invitationsOf.mockResolvedValue([]);
});

describe("POST /api/event-series/[eventSeriesId]/invitations", () => {
  it("hands the teacher a link for the class they named", async () => {
    const response = await POST(request({ class: "3aWI" }), context);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      invitation: { token: "tok", eventSeriesId: "s1", class: "3aWI" },
    });
    expect(createInvitation).toHaveBeenCalledWith("s1", "3aWI");
  });

  /** A student holding a link must not be able to mint one, least of all for another class. */
  it("refuses a student", async () => {
    getAuthenticatedUser.mockResolvedValue(STUDENT);

    const response = await POST(request({ class: "3aWI" }), context);

    expect(response.status).toBe(403);
    expect(createInvitation).not.toHaveBeenCalled();
  });

  /** Inviting a class is planning who takes part, which is not the same as reporting on them. */
  it("refuses a teacher who may not edit assignments", async () => {
    getAuthenticatedUser.mockResolvedValue({
      ...TEACHER,
      permissions: ["viewReports", "editReports", "editMasterData"],
    });

    const response = await POST(request({ class: "3aWI" }), context);

    expect(response.status).toBe(403);
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it("refuses a caller with no session", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    const response = await POST(request({ class: "3aWI" }), context);

    expect(response.status).toBe(401);
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it("refuses a body that names no class", async () => {
    const response = await POST(request({}), context);

    expect(response.status).toBe(400);
    expect(createInvitation).not.toHaveBeenCalled();
  });

  /** Server-owned fields are refused rather than ignored, so a caller hears about the attempt. */
  it("refuses a body that names anything else", async () => {
    const response = await POST(request({ class: "3aWI", token: "chosen-by-me" }), context);

    expect(response.status).toBe(400);
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it("passes a refusal from the service on with its own wording", async () => {
    createInvitation.mockRejectedValue(new ServiceError("CONFLICT", "Archiviert geht nicht."));

    const response = await POST(request({ class: "3aWI" }), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: "Archiviert geht nicht." },
    });
  });
});

describe("GET /api/event-series/[eventSeriesId]/invitations", () => {
  it("hands the teacher the links the series already has", async () => {
    invitationsOf.mockResolvedValue([{ token: "tok", eventSeriesId: "s1", class: "3aWI" }]);

    const response = await GET(request({}), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      invitations: [{ token: "tok", eventSeriesId: "s1", class: "3aWI" }],
    });
    expect(invitationsOf).toHaveBeenCalledWith("s1");
  });

  /** A token is what enrols somebody, so reading one is enrolling (US-23). */
  it("refuses a student", async () => {
    getAuthenticatedUser.mockResolvedValue(STUDENT);

    const response = await GET(request({}), context);

    expect(response.status).toBe(403);
    expect(invitationsOf).not.toHaveBeenCalled();
  });

  it("refuses a caller with no session", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    const response = await GET(request({}), context);

    expect(response.status).toBe(401);
    expect(invitationsOf).not.toHaveBeenCalled();
  });

  it("sanitises an unexpected failure into a 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    invitationsOf.mockRejectedValue(new Error("Firestore is down"));

    const response = await GET(request({}), context);

    expect(response.status).toBe(500);
    await expect(response.text()).resolves.not.toContain("Firestore is down");
  });
});
