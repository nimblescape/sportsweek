/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserWithRole = vi.fn();
const updateEvent = vi.fn();
const deleteEvent = vi.fn();

vi.mock("@/lib/auth/guards", () => ({
  getUserWithRole: () => getUserWithRole(),
}));

vi.mock("@/lib/events/event-service", () => ({
  updateEvent: (...args: unknown[]) => updateEvent(...args),
  deleteEvent: (...args: unknown[]) => deleteEvent(...args),
}));

const { PATCH, DELETE } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");

const context = { params: Promise.resolve({ eventId: "e1" }) };

function patchRequest(body: unknown) {
  return new Request("https://example.com/api/events/e1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getUserWithRole.mockReset();
  updateEvent.mockReset();
  deleteEvent.mockReset();
  getUserWithRole.mockResolvedValue({ uid: "u1", email: "t@htldornbirn.at", role: "teacher" });
  updateEvent.mockResolvedValue({ id: "e1", eventSeriesId: "s1", name: "Montafon Nord" });
  deleteEvent.mockResolvedValue(undefined);
});

describe("PATCH /api/events/[eventId]", () => {
  it("renames the event", async () => {
    const response = await PATCH(patchRequest({ name: "Montafon Nord" }), context);

    expect(response.status).toBe(200);
    expect(updateEvent).toHaveBeenCalledWith("e1", { name: "Montafon Nord" });
  });

  it("refuses to move the event to another event series", async () => {
    const response = await PATCH(patchRequest({ name: "X", eventSeriesId: "s2" }), context);

    expect(response.status).toBe(400);
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("rejects a blank name", async () => {
    const response = await PATCH(patchRequest({ name: " " }), context);

    expect(response.status).toBe(400);
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it("rejects a student with 403", async () => {
    getUserWithRole.mockResolvedValue({ uid: "u2", email: "s@x", role: "student" });

    const response = await PATCH(patchRequest({ name: "X" }), context);

    expect(response.status).toBe(403);
    expect(updateEvent).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/events/[eventId]", () => {
  it("deletes the event", async () => {
    const response = await DELETE(
      new Request("https://example.com/api/events/e1", { method: "DELETE" }),
      context,
    );

    expect(response.status).toBe(204);
    expect(deleteEvent).toHaveBeenCalledWith("e1");
  });

  it("rejects a student with 403", async () => {
    getUserWithRole.mockResolvedValue({ uid: "u2", email: "s@x", role: "student" });

    const response = await DELETE(
      new Request("https://example.com/api/events/e1", { method: "DELETE" }),
      context,
    );

    expect(response.status).toBe(403);
    expect(deleteEvent).not.toHaveBeenCalled();
  });

  it("maps a missing event onto 404", async () => {
    deleteEvent.mockRejectedValue(new ServiceError("NOT_FOUND", "Gibt es nicht."));

    const response = await DELETE(
      new Request("https://example.com/api/events/e1", { method: "DELETE" }),
      context,
    );

    expect(response.status).toBe(404);
  });
});
