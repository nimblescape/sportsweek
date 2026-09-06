/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthenticatedUser = vi.fn();
const updateEventSeries = vi.fn();
const deleteEventSeries = vi.fn();

vi.mock("@/lib/auth/guards", () => ({
  getAuthenticatedUser: () => getAuthenticatedUser(),
}));

vi.mock("@/lib/event-series/event-series-service", () => ({
  updateEventSeries: (...args: unknown[]) => updateEventSeries(...args),
  deleteEventSeries: (...args: unknown[]) => deleteEventSeries(...args),
}));

const { PATCH, DELETE } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");

const context = { params: Promise.resolve({ eventSeriesId: "s1" }) };

function patchRequest(body: unknown) {
  return new Request("https://example.com/api/event-series/s1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function deleteRequest() {
  return new Request("https://example.com/api/event-series/s1", { method: "DELETE" });
}

beforeEach(() => {
  getAuthenticatedUser.mockReset();
  updateEventSeries.mockReset();
  deleteEventSeries.mockReset();
  getAuthenticatedUser.mockResolvedValue({
    uid: "u1",
    email: "t@htldornbirn.at",
    accountType: "teacher",
    permissions: ["editMasterData"],
  });
  updateEventSeries.mockResolvedValue({
    id: "s1",
    name: "Winter",
    isArchived: false,
  });
  deleteEventSeries.mockResolvedValue(undefined);
});

describe("PATCH /api/event-series/[eventSeriesId]", () => {
  it("renames the event series", async () => {
    const response = await PATCH(patchRequest({ name: "Neuer Name" }), context);

    expect(response.status).toBe(200);
    expect(updateEventSeries).toHaveBeenCalledWith("s1", { name: "Neuer Name" });
  });

  it("rejects a caller who may only edit registrations", async () => {
    getAuthenticatedUser.mockResolvedValue({
      uid: "u2",
      email: "t2@htldornbirn.at",
      accountType: "teacher",
      permissions: ["editRegistrations"],
    });

    const response = await PATCH(patchRequest({ name: "Neuer Name" }), context);

    expect(response.status).toBe(403);
    expect(updateEventSeries).not.toHaveBeenCalled();
  });

  /**
   * Whether somebody may act on this at all is checked once the caller is known, before the body
   * is inspected further — a stranger is answered 401 rather than shown what a valid body names.
   */
  it("refuses a caller with no session before reading their body", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    const response = await PATCH(patchRequest({ nonsense: true }), context);

    expect(response.status).toBe(401);
    expect(updateEventSeries).not.toHaveBeenCalled();
  });

  it("archives the event series", async () => {
    await PATCH(patchRequest({ isArchived: true }), context);

    expect(updateEventSeries).toHaveBeenCalledWith("s1", { isArchived: true });
  });

  it("passes on only the fields that were sent", async () => {
    await PATCH(patchRequest({ isArchived: false }), context);

    expect(updateEventSeries).toHaveBeenCalledWith("s1", { isArchived: false });
  });

  it("rejects an empty patch", async () => {
    const response = await PATCH(patchRequest({}), context);

    expect(response.status).toBe(400);
    expect(updateEventSeries).not.toHaveBeenCalled();
  });

  it("rejects an unknown field instead of silently dropping it", async () => {
    const response = await PATCH(
      patchRequest({ accountType: "teacher", permissions: ["editMasterData"] }),
      context,
    );

    expect(response.status).toBe(400);
    expect(updateEventSeries).not.toHaveBeenCalled();
  });

  it("rejects a student with 403", async () => {
    getAuthenticatedUser.mockResolvedValue({ uid: "u2", email: "s@x", accountType: "student" });

    const response = await PATCH(patchRequest({ name: "X" }), context);

    expect(response.status).toBe(403);
    expect(updateEventSeries).not.toHaveBeenCalled();
  });

  /** The series and its lists are master data; planning inside one is a different permission. */
  it("rejects a teacher who may not edit master data", async () => {
    getAuthenticatedUser.mockResolvedValue({
      uid: "u3",
      email: "t2@htldornbirn.at",
      accountType: "teacher",
      permissions: ["viewReports", "editReports", "editAssignments"],
    });

    const response = await PATCH(patchRequest({ name: "X" }), context);

    expect(response.status).toBe(403);
    expect(updateEventSeries).not.toHaveBeenCalled();
  });

  it("maps a missing event series onto 404", async () => {
    updateEventSeries.mockRejectedValue(new ServiceError("NOT_FOUND", "Gibt es nicht."));

    const response = await PATCH(patchRequest({ name: "X" }), context);

    expect(response.status).toBe(404);
  });

  it("maps archiving a series with no registrations onto 409", async () => {
    updateEventSeries.mockRejectedValue(new ServiceError("CONFLICT", "Keine Registrierungen."));

    const response = await PATCH(patchRequest({ isArchived: true }), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "CONFLICT", message: "Keine Registrierungen." },
    });
  });
});

describe("DELETE /api/event-series/[eventSeriesId]", () => {
  it("deletes the event series", async () => {
    const response = await DELETE(deleteRequest(), context);

    expect(response.status).toBe(204);
    expect(deleteEventSeries).toHaveBeenCalledWith("s1");
  });

  it("rejects a student with 403", async () => {
    getAuthenticatedUser.mockResolvedValue({ uid: "u2", email: "s@x", accountType: "student" });

    const response = await DELETE(deleteRequest(), context);

    expect(response.status).toBe(403);
    expect(deleteEventSeries).not.toHaveBeenCalled();
  });

  it("rejects deleting an event series with registrations that is not archived, even when the client is bypassed", async () => {
    deleteEventSeries.mockRejectedValue(
      new ServiceError(
        "CONFLICT",
        "Eine Eventreihe mit Registrierungen kann nur gelöscht werden, wenn sie archiviert ist.",
      ),
    );

    const response = await DELETE(deleteRequest(), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "CONFLICT",
        message:
          "Eine Eventreihe mit Registrierungen kann nur gelöscht werden, wenn sie archiviert ist.",
      },
    });
  });
});
