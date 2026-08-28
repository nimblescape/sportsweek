/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserWithRole = vi.fn();
const createEvent = vi.fn();
const updateEvent = vi.fn();
const deleteEvent = vi.fn();
const reorderEvents = vi.fn();

vi.mock("@/lib/auth/guards", () => ({
  getUserWithRole: () => getUserWithRole(),
}));

vi.mock("@/lib/events/event-service", () => ({
  createEvent: (...args: unknown[]) => createEvent(...args),
  updateEvent: (...args: unknown[]) => updateEvent(...args),
  deleteEvent: (...args: unknown[]) => deleteEvent(...args),
  reorderEvents: (...args: unknown[]) => reorderEvents(...args),
}));

const { DELETE, PATCH, POST } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");

const STUDENT = { uid: "u2", email: "s@student.htldornbirn.at", role: "student" };

function request(method: string, body: unknown) {
  return new Request("https://example.com/api/events", {
    method,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserWithRole.mockResolvedValue({ uid: "u1", email: "t@htldornbirn.at", role: "teacher" });
  createEvent.mockResolvedValue({ eventSeriesId: "s1", name: "Montafon" });
  updateEvent.mockResolvedValue({ eventSeriesId: "s1", name: "Lech" });
  deleteEvent.mockResolvedValue(undefined);
  reorderEvents.mockResolvedValue(undefined);
});

describe("POST /api/events", () => {
  it("creates the event under the event series it names", async () => {
    const response = await POST(request("POST", { eventSeriesId: "s1", name: "Montafon" }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ event: { eventSeriesId: "s1", name: "Montafon" } });
    expect(createEvent).toHaveBeenCalledWith({ eventSeriesId: "s1", name: "Montafon" });
  });

  it("rejects a student with 403", async () => {
    getUserWithRole.mockResolvedValue(STUDENT);

    const response = await POST(request("POST", { eventSeriesId: "s1", name: "Montafon" }));

    expect(response.status).toBe(403);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("rejects a missing event series reference", async () => {
    const response = await POST(request("POST", { name: "Montafon" }));

    expect(response.status).toBe(400);
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("rejects a blank name with the shared envelope", async () => {
    const response = await POST(request("POST", { eventSeriesId: "s1", name: "  " }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toBeDefined();
  });

  it("maps an unknown event series onto 404", async () => {
    createEvent.mockRejectedValue(new ServiceError("NOT_FOUND", "Gibt es nicht."));

    const response = await POST(request("POST", { eventSeriesId: "ghost", name: "Montafon" }));

    expect(response.status).toBe(404);
  });

  it("maps a duplicate name onto 409", async () => {
    createEvent.mockRejectedValue(new ServiceError("CONFLICT", "Gibt es bereits."));

    const response = await POST(request("POST", { eventSeriesId: "s1", name: "Montafon" }));

    expect(response.status).toBe(409);
  });
});

describe("PATCH /api/events", () => {
  it("reorders within the event series it was given", async () => {
    const response = await PATCH(
      request("PATCH", { eventSeriesId: "s1", order: ["Woche 2", "Woche 1"] }),
    );

    expect(response.status).toBe(204);
    expect(reorderEvents).toHaveBeenCalledWith("s1", ["Woche 2", "Woche 1"]);
  });

  it("renames the event the body names", async () => {
    const response = await PATCH(
      request("PATCH", { eventSeriesId: "s1", event: "Montafon", name: "Lech" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ event: { eventSeriesId: "s1", name: "Lech" } });
    expect(updateEvent).toHaveBeenCalledWith("s1", "Montafon", { name: "Lech" });
  });

  // The name travels in the body, since a name may hold a slash and a path segment may not.
  it("takes an event whose name would not survive a path segment", async () => {
    await PATCH(request("PATCH", { eventSeriesId: "s1", event: "Woche 1/2", name: "Woche 2/3" }));

    expect(updateEvent).toHaveBeenCalledWith("s1", "Woche 1/2", { name: "Woche 2/3" });
  });

  it("requires the event series, so one event series cannot reorder another's events", async () => {
    const response = await PATCH(request("PATCH", { order: ["Woche 1"] }));

    expect(response.status).toBe(400);
    expect(reorderEvents).not.toHaveBeenCalled();
  });

  it("refuses a body that is neither a reorder nor a rename", async () => {
    const response = await PATCH(request("PATCH", { eventSeriesId: "s1", event: "Montafon" }));

    expect(response.status).toBe(400);
    expect(updateEvent).not.toHaveBeenCalled();
    expect(reorderEvents).not.toHaveBeenCalled();
  });

  it("rejects a student with 403, so a bypassed client cannot reorder", async () => {
    getUserWithRole.mockResolvedValue(STUDENT);

    const response = await PATCH(request("PATCH", { eventSeriesId: "s1", order: ["Woche 1"] }));

    expect(response.status).toBe(403);
    expect(reorderEvents).not.toHaveBeenCalled();
  });

  it("maps a name the event series no longer holds onto 404", async () => {
    updateEvent.mockRejectedValue(new ServiceError("NOT_FOUND", "Gibt es nicht."));

    const response = await PATCH(
      request("PATCH", { eventSeriesId: "s1", event: "Montafon", name: "Lech" }),
    );

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/events", () => {
  it("deletes the event the body names", async () => {
    const response = await DELETE(request("DELETE", { eventSeriesId: "s1", event: "Montafon" }));

    expect(response.status).toBe(204);
    expect(deleteEvent).toHaveBeenCalledWith("s1", "Montafon");
  });

  it("rejects a student with 403", async () => {
    getUserWithRole.mockResolvedValue(STUDENT);

    const response = await DELETE(request("DELETE", { eventSeriesId: "s1", event: "Montafon" }));

    expect(response.status).toBe(403);
    expect(deleteEvent).not.toHaveBeenCalled();
  });

  it("requires the event series the event belongs to", async () => {
    const response = await DELETE(request("DELETE", { event: "Montafon" }));

    expect(response.status).toBe(400);
    expect(deleteEvent).not.toHaveBeenCalled();
  });

  it("maps a name the event series no longer holds onto 404", async () => {
    deleteEvent.mockRejectedValue(new ServiceError("NOT_FOUND", "Gibt es nicht."));

    const response = await DELETE(request("DELETE", { eventSeriesId: "s1", event: "Montafon" }));

    expect(response.status).toBe(404);
  });
});
