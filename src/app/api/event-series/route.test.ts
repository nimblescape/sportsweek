/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthenticatedUser = vi.fn();
const createEventSeries = vi.fn();
const reorderEventSeries = vi.fn();

vi.mock("@/lib/auth/guards", () => ({
  getAuthenticatedUser: () => getAuthenticatedUser(),
}));

vi.mock("@/lib/event-series/event-series-service", () => ({
  createEventSeries: (...args: unknown[]) => createEventSeries(...args),
  reorderEventSeries: (...args: unknown[]) => reorderEventSeries(...args),
}));

const { PATCH, POST } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");

function postRequest(body: unknown) {
  return new Request("https://example.com/api/event-series", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getAuthenticatedUser.mockReset();
  createEventSeries.mockReset();
  reorderEventSeries.mockReset();
  getAuthenticatedUser.mockResolvedValue({
    uid: "u1",
    email: "t@htldornbirn.at",
    accountType: "teacher",
    permissions: ["editMasterData"],
  });
  createEventSeries.mockResolvedValue({
    id: "s1",
    name: "Winter 2026",
    isArchived: false,
  });
});

describe("POST /api/event-series", () => {
  it("creates the event series and returns it", async () => {
    const response = await POST(postRequest({ name: "Winter 2026" }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      eventSeries: { id: "s1", name: "Winter 2026", isArchived: false },
    });
    expect(createEventSeries).toHaveBeenCalledWith({
      name: "Winter 2026",
      sourceId: null,
    });
  });

  it("carries the source through as it was asked for (US-22)", async () => {
    await POST(postRequest({ name: "Winter 2027", sourceId: "s9" }));

    expect(createEventSeries).toHaveBeenCalledWith({
      name: "Winter 2027",
      sourceId: "s9",
    });
  });

  it("refuses a field creation does not ask for, rather than dropping it", async () => {
    const response = await POST(postRequest({ name: "Winter 2026", isArchived: true }));

    expect(response.status).toBe(400);
    expect(createEventSeries).not.toHaveBeenCalled();
  });

  it("rejects an anonymous caller with 401", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    const response = await POST(postRequest({ name: "Winter 2026" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });
    expect(createEventSeries).not.toHaveBeenCalled();
  });

  it("rejects a student with 403, so a bypassed client cannot write", async () => {
    getAuthenticatedUser.mockResolvedValue({
      uid: "u2",
      email: "s@student.htldornbirn.at",
      accountType: "student",
    });

    const response = await POST(postRequest({ name: "Winter 2026" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "PERMISSION_DENIED" } });
    expect(createEventSeries).not.toHaveBeenCalled();
  });

  /** An event series is master data; planning inside one is a different permission. */
  it("rejects a teacher who may not edit master data", async () => {
    getAuthenticatedUser.mockResolvedValue({
      uid: "u3",
      email: "t2@htldornbirn.at",
      accountType: "teacher",
      permissions: ["viewReports", "editReports", "editAssignments"],
    });

    const response = await POST(postRequest({ name: "Winter 2026" }));

    expect(response.status).toBe(403);
    expect(createEventSeries).not.toHaveBeenCalled();
  });

  it("returns the shared validation envelope for a blank name", async () => {
    const response = await POST(postRequest({ name: "   " }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toBeDefined();
    expect(createEventSeries).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed body", async () => {
    const response = await POST(
      new Request("https://example.com/api/event-series", { method: "POST", body: "not json" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("maps a service conflict onto its status without leaking internals", async () => {
    createEventSeries.mockRejectedValue(new ServiceError("CONFLICT", "Schon vorhanden."));

    const response = await POST(postRequest({ name: "Winter 2026" }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "CONFLICT", message: "Schon vorhanden." },
    });
  });

  it("hides an unexpected failure behind a sanitized 500", async () => {
    createEventSeries.mockRejectedValue(new Error("adminDb exploded at line 42"));

    const response = await POST(postRequest({ name: "Winter 2026" }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("line 42");
  });
});

describe("PATCH /api/event-series", () => {
  function patchRequest(body: unknown) {
    return new Request("https://example.com/api/event-series", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  it("passes the new order to the service", async () => {
    const response = await PATCH(patchRequest({ order: ["s2", "s1"] }));

    expect(response.status).toBe(204);
    expect(reorderEventSeries).toHaveBeenCalledWith(["s2", "s1"]);
  });

  it("rejects a student with 403, so a bypassed client cannot reorder", async () => {
    getAuthenticatedUser.mockResolvedValue({
      uid: "u2",
      email: "s@student.htldornbirn.at",
      accountType: "student",
    });

    const response = await PATCH(patchRequest({ order: ["s1"] }));

    expect(response.status).toBe(403);
    expect(reorderEventSeries).not.toHaveBeenCalled();
  });

  it("rejects an unknown field rather than ignoring it", async () => {
    const response = await PATCH(patchRequest({ order: ["s1"], name: "sneaky" }));

    expect(response.status).toBe(400);
    expect(reorderEventSeries).not.toHaveBeenCalled();
  });
});
