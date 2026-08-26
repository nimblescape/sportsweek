/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserWithRole = vi.fn();
const createEvent = vi.fn();
const reorderEvents = vi.fn();

vi.mock("@/lib/auth/guards", () => ({
  getUserWithRole: () => getUserWithRole(),
}));

vi.mock("@/lib/events/event-service", () => ({
  createEvent: (...args: unknown[]) => createEvent(...args),
  reorderEvents: (...args: unknown[]) => reorderEvents(...args),
}));

const { PATCH, POST } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");

function postRequest(body: unknown) {
  return new Request("https://example.com/api/events", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getUserWithRole.mockReset();
  reorderEvents.mockReset();
  createEvent.mockReset();
  getUserWithRole.mockResolvedValue({ uid: "u1", email: "t@htldornbirn.at", role: "teacher" });
  createEvent.mockResolvedValue({ id: "e1", seasonId: "s1", name: "Montafon" });
});

describe("POST /api/events", () => {
  it("creates the event under its season", async () => {
    const response = await POST(postRequest({ seasonId: "s1", name: "Montafon" }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      event: { id: "e1", seasonId: "s1", name: "Montafon" },
    });
    expect(createEvent).toHaveBeenCalledWith({ seasonId: "s1", name: "Montafon" });
  });

  it("rejects a student with 403", async () => {
    getUserWithRole.mockResolvedValue({ uid: "u2", email: "s@x", role: "student" });

    const response = await POST(postRequest({ seasonId: "s1", name: "Montafon" }));

    expect(response.status).toBe(403);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("rejects a missing season reference", async () => {
    const response = await POST(postRequest({ name: "Montafon" }));

    expect(response.status).toBe(400);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("rejects a blank name with the shared envelope", async () => {
    const response = await POST(postRequest({ seasonId: "s1", name: "  " }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toBeDefined();
  });

  it("maps an unknown season onto 404", async () => {
    createEvent.mockRejectedValue(new ServiceError("NOT_FOUND", "Gibt es nicht."));

    const response = await POST(postRequest({ seasonId: "ghost", name: "Montafon" }));

    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/events", () => {
  function patchRequest(body: unknown) {
    return new Request("https://example.com/api/events", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  it("reorders within the season it was given", async () => {
    const response = await PATCH(patchRequest({ seasonId: "s1", order: ["e2", "e1"] }));

    expect(response.status).toBe(204);
    expect(reorderEvents).toHaveBeenCalledWith("s1", ["e2", "e1"]);
  });

  it("requires the season, so one season cannot renumber another's events", async () => {
    const response = await PATCH(patchRequest({ order: ["e1"] }));

    expect(response.status).toBe(400);
    expect(reorderEvents).not.toHaveBeenCalled();
  });

  it("rejects a student with 403, so a bypassed client cannot reorder", async () => {
    getUserWithRole.mockResolvedValue({
      uid: "u2",
      email: "s@student.htldornbirn.at",
      role: "student",
    });

    const response = await PATCH(patchRequest({ seasonId: "s1", order: ["e1"] }));

    expect(response.status).toBe(403);
    expect(reorderEvents).not.toHaveBeenCalled();
  });
});
