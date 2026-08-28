/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserWithRole = vi.fn();
const createInvitation = vi.fn();

vi.mock("@/lib/auth/guards", () => ({ getUserWithRole: () => getUserWithRole() }));
vi.mock("@/lib/invitations/invitation-service", () => ({
  createInvitation: (...args: unknown[]) => createInvitation(...args),
}));

const { POST } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");

const TEACHER = { uid: "u1", email: "t@htldornbirn.at", role: "teacher" };
const STUDENT = { uid: "u2", email: "s@student.htldornbirn.at", role: "student" };

function request(body: unknown) {
  return new Request("https://example.com/api/event-series/s1/invitations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ eventSeriesId: "s1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  getUserWithRole.mockResolvedValue(TEACHER);
  createInvitation.mockResolvedValue({ token: "tok", eventSeriesId: "s1", class: "3aWI" });
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
    getUserWithRole.mockResolvedValue(STUDENT);

    const response = await POST(request({ class: "3aWI" }), context);

    expect(response.status).toBe(403);
    expect(createInvitation).not.toHaveBeenCalled();
  });

  it("refuses a caller with no session", async () => {
    getUserWithRole.mockResolvedValue(null);

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
    createInvitation.mockRejectedValue(new ServiceError("CONFLICT", "Eine Vorlage geht nicht."));

    const response = await POST(request({ class: "3aWI" }), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: "Eine Vorlage geht nicht." },
    });
  });
});
