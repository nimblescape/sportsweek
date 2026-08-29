/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthenticatedUser = vi.fn();
const createMasterDataItem = vi.fn();
const updateMasterDataItem = vi.fn();
const deleteMasterDataItem = vi.fn();
const reorderMasterDataItems = vi.fn();
const readMasterDataItems = vi.fn();
const usageReport = vi.fn();

vi.mock("@/lib/auth/guards", () => ({
  getAuthenticatedUser: () => getAuthenticatedUser(),
}));

vi.mock("@/lib/master-data/master-data-service", () => ({
  createMasterDataItem: (...args: unknown[]) => createMasterDataItem(...args),
  updateMasterDataItem: (...args: unknown[]) => updateMasterDataItem(...args),
  deleteMasterDataItem: (...args: unknown[]) => deleteMasterDataItem(...args),
  reorderMasterDataItems: (...args: unknown[]) => reorderMasterDataItems(...args),
  readMasterDataItems: (...args: unknown[]) => readMasterDataItems(...args),
}));

vi.mock("@/lib/master-data/usage-guard", () => ({
  usageReport: (...args: unknown[]) => usageReport(...args),
}));

const { DELETE, GET, PATCH, POST } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");
const { MASTER_DATA_CATEGORIES } = await import("@/lib/master-data/categories");

const STUDENT = { uid: "u2", email: "s@student.htldornbirn.at", accountType: "student" };

function request(method: string, body: unknown) {
  return new Request("https://example.com/api/master-data/classes", {
    method,
    body: JSON.stringify(body),
  });
}

function context(category: string, eventSeriesId = "s1") {
  return { params: Promise.resolve({ eventSeriesId, category }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedUser.mockResolvedValue({
    uid: "u1",
    email: "t@htldornbirn.at",
    accountType: "teacher",
    permissions: ["editMasterData"],
  });
  createMasterDataItem.mockResolvedValue({ name: "3AHIT" });
  updateMasterDataItem.mockResolvedValue({ name: "3BHIT" });
  deleteMasterDataItem.mockResolvedValue(undefined);
  reorderMasterDataItems.mockResolvedValue(undefined);
  readMasterDataItems.mockResolvedValue({ eventSeriesId: "s1", items: [{ name: "3AHIT" }] });
  usageReport.mockResolvedValue({ blockedNames: ["3AHIT"], blockedEquipment: {} });
});

describe("POST /api/master-data/[category]", () => {
  it("creates the item and answers with it", async () => {
    const response = await POST(request("POST", { name: "3AHIT" }), context("classes"));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ item: { name: "3AHIT" } });
    expect(createMasterDataItem).toHaveBeenCalledWith("s1", "classes", { name: "3AHIT" });
  });

  it("passes the equipment list through for a program", async () => {
    await POST(request("POST", { name: "Ski", requiredEquipment: ["Helm"] }), context("programs"));

    expect(createMasterDataItem).toHaveBeenCalledWith("s1", "programs", {
      name: "Ski",
      requiredEquipment: ["Helm"],
    });
  });

  it("rejects an unknown category, so a URL segment cannot name a field", async () => {
    const response = await POST(request("POST", { name: "x" }), context("users"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(createMasterDataItem).not.toHaveBeenCalled();
  });

  it("rejects an anonymous caller with 401", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    const response = await POST(request("POST", { name: "3AHIT" }), context("classes"));

    expect(response.status).toBe(401);
    expect(createMasterDataItem).not.toHaveBeenCalled();
  });

  it("rejects a student with 403, so a bypassed client cannot write", async () => {
    getAuthenticatedUser.mockResolvedValue(STUDENT);

    const response = await POST(request("POST", { name: "3AHIT" }), context("classes"));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "PERMISSION_DENIED" } });
    expect(createMasterDataItem).not.toHaveBeenCalled();
  });

  /** The lists are their own permission: planning with them is not the same as maintaining them. */
  it("rejects a teacher who may not edit master data", async () => {
    getAuthenticatedUser.mockResolvedValue({
      uid: "u3",
      email: "t2@htldornbirn.at",
      accountType: "teacher",
      permissions: ["viewReports", "editReports", "editAssignments"],
    });

    const response = await POST(request("POST", { name: "3AHIT" }), context("classes"));

    expect(response.status).toBe(403);
    expect(createMasterDataItem).not.toHaveBeenCalled();
  });

  it("returns the shared validation envelope for a blank name", async () => {
    const response = await POST(request("POST", { name: "   " }), context("classes"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toBeDefined();
    expect(createMasterDataItem).not.toHaveBeenCalled();
  });

  it("rejects an unknown field rather than dropping it quietly", async () => {
    const response = await POST(
      request("POST", { name: "3AHIT", position: 3 }),
      context("classes"),
    );

    expect(response.status).toBe(400);
    expect(createMasterDataItem).not.toHaveBeenCalled();
  });

  it("maps a duplicate name onto 409", async () => {
    createMasterDataItem.mockRejectedValue(new ServiceError("CONFLICT", "Schon vorhanden."));

    const response = await POST(request("POST", { name: "3AHIT" }), context("classes"));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "CONFLICT", message: "Schon vorhanden." },
    });
  });

  it("hides an unexpected failure behind a sanitized 500", async () => {
    createMasterDataItem.mockRejectedValue(new Error("adminDb exploded at line 42"));

    const response = await POST(request("POST", { name: "3AHIT" }), context("classes"));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("line 42");
  });
});

describe("PATCH /api/master-data/[category] — reordering", () => {
  it("passes the new order to the service", async () => {
    const response = await PATCH(
      request("PATCH", { order: ["4BHIT", "3AHIT"] }),
      context("classes"),
    );

    expect(response.status).toBe(204);
    expect(reorderMasterDataItems).toHaveBeenCalledWith("s1", "classes", ["4BHIT", "3AHIT"]);
  });

  it("rejects a student with 403, so a bypassed client cannot reorder", async () => {
    getAuthenticatedUser.mockResolvedValue(STUDENT);

    const response = await PATCH(request("PATCH", { order: ["3AHIT"] }), context("classes"));

    expect(response.status).toBe(403);
    expect(reorderMasterDataItems).not.toHaveBeenCalled();
  });

  it("rejects an unknown category", async () => {
    const response = await PATCH(request("PATCH", { order: ["3AHIT"] }), context("users"));

    expect(response.status).toBe(400);
    expect(reorderMasterDataItems).not.toHaveBeenCalled();
  });

  /** An order plus an edit is neither of the two intents, so it is refused rather than guessed. */
  it("rejects an order carrying an edit alongside it", async () => {
    const response = await PATCH(
      request("PATCH", { order: ["3AHIT"], name: "sneaky" }),
      context("classes"),
    );

    expect(response.status).toBe(400);
    expect(reorderMasterDataItems).not.toHaveBeenCalled();
    expect(updateMasterDataItem).not.toHaveBeenCalled();
  });

  it("reports an order naming an item that is gone as 404", async () => {
    reorderMasterDataItems.mockRejectedValue(new ServiceError("NOT_FOUND", "Gibt es nicht."));

    const response = await PATCH(request("PATCH", { order: ["Weg"] }), context("classes"));

    expect(response.status).toBe(404);
  });

  it("reports an order that is not a permutation as 409", async () => {
    reorderMasterDataItems.mockRejectedValue(new ServiceError("CONFLICT", "Passt nicht."));

    const response = await PATCH(request("PATCH", { order: ["3AHIT"] }), context("classes"));

    expect(response.status).toBe(409);
  });
});

describe("PATCH /api/master-data/[category] — editing one item", () => {
  it("names the item in the body, since a name may hold a slash a path cannot", async () => {
    const response = await PATCH(
      request("PATCH", { item: "3AHIT", name: "3BHIT" }),
      context("classes"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ item: { name: "3BHIT" } });
    expect(updateMasterDataItem).toHaveBeenCalledWith("s1", "classes", "3AHIT", {
      name: "3BHIT",
    });
  });

  it("rewrites a program's equipment without touching its name", async () => {
    await PATCH(
      request("PATCH", { item: "Ski", requiredEquipment: ["Helm"] }),
      context("programs"),
    );

    expect(updateMasterDataItem).toHaveBeenCalledWith("s1", "programs", "Ski", {
      requiredEquipment: ["Helm"],
    });
  });

  it("rejects an edit that changes nothing", async () => {
    const response = await PATCH(request("PATCH", { item: "3AHIT" }), context("classes"));

    expect(response.status).toBe(400);
    expect(updateMasterDataItem).not.toHaveBeenCalled();
  });

  it("rejects an edit naming no item at all", async () => {
    const response = await PATCH(request("PATCH", { name: "3BHIT" }), context("classes"));

    expect(response.status).toBe(400);
    expect(updateMasterDataItem).not.toHaveBeenCalled();
  });

  it("reports an item that is no longer on the list as 404", async () => {
    updateMasterDataItem.mockRejectedValue(new ServiceError("NOT_FOUND", "Gibt es nicht."));

    const response = await PATCH(
      request("PATCH", { item: "Weg", name: "Neu" }),
      context("classes"),
    );

    expect(response.status).toBe(404);
  });

  it("reports a name the list already carries as 409", async () => {
    updateMasterDataItem.mockRejectedValue(new ServiceError("CONFLICT", "Schon vorhanden."));

    const response = await PATCH(
      request("PATCH", { item: "3AHIT", name: "4BHIT" }),
      context("classes"),
    );

    expect(response.status).toBe(409);
  });

  it("rejects a student with 403", async () => {
    getAuthenticatedUser.mockResolvedValue(STUDENT);

    const response = await PATCH(
      request("PATCH", { item: "3AHIT", name: "3BHIT" }),
      context("classes"),
    );

    expect(response.status).toBe(403);
    expect(updateMasterDataItem).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/master-data/[category]", () => {
  it("deletes the item the body names", async () => {
    const response = await DELETE(request("DELETE", { item: "3AHIT" }), context("classes"));

    expect(response.status).toBe(204);
    expect(deleteMasterDataItem).toHaveBeenCalledWith("s1", "classes", "3AHIT");
  });

  it("rejects a request naming no item", async () => {
    const response = await DELETE(request("DELETE", {}), context("classes"));

    expect(response.status).toBe(400);
    expect(deleteMasterDataItem).not.toHaveBeenCalled();
  });

  it("reports an item that is no longer on the list as 404", async () => {
    deleteMasterDataItem.mockRejectedValue(new ServiceError("NOT_FOUND", "Gibt es nicht."));

    const response = await DELETE(request("DELETE", { item: "Weg" }), context("classes"));

    expect(response.status).toBe(404);
  });

  it("reports an item a registration still holds as 409", async () => {
    deleteMasterDataItem.mockRejectedValue(new ServiceError("CONFLICT", "Noch in Verwendung."));

    const response = await DELETE(request("DELETE", { item: "3AHIT" }), context("classes"));

    expect(response.status).toBe(409);
  });

  it("rejects a student with 403", async () => {
    getAuthenticatedUser.mockResolvedValue(STUDENT);

    const response = await DELETE(request("DELETE", { item: "3AHIT" }), context("classes"));

    expect(response.status).toBe(403);
    expect(deleteMasterDataItem).not.toHaveBeenCalled();
  });

  it("rejects an unknown category", async () => {
    const response = await DELETE(request("DELETE", { item: "3AHIT" }), context("users"));

    expect(response.status).toBe(400);
    expect(deleteMasterDataItem).not.toHaveBeenCalled();
  });
});

describe("GET /api/master-data/[category]", () => {
  it("reports what may not be edited and what holds an item back from deletion", async () => {
    const response = await GET(new Request("https://example.com"), context("classes"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ blockedNames: ["3AHIT"], blockedEquipment: {} });
  });

  /** The answer is about the items of the active event series, so it asks the same list. */
  it("asks the guard about the items the event series actually holds", async () => {
    await GET(new Request("https://example.com"), context("classes"));

    expect(usageReport).toHaveBeenCalledWith("s1", MASTER_DATA_CATEGORIES.classes, [
      { name: "3AHIT" },
    ]);
  });

  it("rejects a student, since the answer is derived from data they cannot read", async () => {
    getAuthenticatedUser.mockResolvedValue(STUDENT);

    const response = await GET(new Request("https://example.com"), context("classes"));

    expect(response.status).toBe(403);
    expect(usageReport).not.toHaveBeenCalled();
  });

  it("rejects an unknown category", async () => {
    const response = await GET(new Request("https://example.com"), context("users"));

    expect(response.status).toBe(400);
    expect(usageReport).not.toHaveBeenCalled();
  });

  it("reports having no active event series as 409 rather than an empty answer", async () => {
    readMasterDataItems.mockRejectedValue(new ServiceError("CONFLICT", "Keine Eventreihe aktiv."));

    const response = await GET(new Request("https://example.com"), context("classes"));

    expect(response.status).toBe(409);
    expect(usageReport).not.toHaveBeenCalled();
  });
});
