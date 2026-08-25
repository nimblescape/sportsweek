/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserWithRole = vi.fn();
const createMasterDataItem = vi.fn();
const blockedItemIds = vi.fn();

vi.mock("@/lib/auth/guards", () => ({
  getUserWithRole: () => getUserWithRole(),
}));

vi.mock("@/lib/master-data/master-data-service", () => ({
  createMasterDataItem: (...args: unknown[]) => createMasterDataItem(...args),
}));

vi.mock("@/lib/master-data/usage-guard", () => ({
  blockedItemIds: (...args: unknown[]) => blockedItemIds(...args),
}));

const { GET, POST } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");

function request(body: unknown) {
  return new Request("https://example.com/api/master-data/classes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function context(category: string) {
  return { params: Promise.resolve({ category }) };
}

beforeEach(() => {
  getUserWithRole.mockReset();
  createMasterDataItem.mockReset();
  blockedItemIds.mockReset();
  getUserWithRole.mockResolvedValue({ uid: "u1", email: "t@htldornbirn.at", role: "teacher" });
  createMasterDataItem.mockResolvedValue({ id: "c1", name: "3AHIT", parentId: null });
  blockedItemIds.mockResolvedValue(["c1"]);
});

describe("POST /api/master-data/[category]", () => {
  it("creates the item and returns it", async () => {
    const response = await POST(request({ name: "3AHIT" }), context("classes"));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ item: { id: "c1", name: "3AHIT", parentId: null } });
    expect(createMasterDataItem).toHaveBeenCalledWith("classes", { name: "3AHIT" });
  });

  it("passes the parent through for a nested list", async () => {
    await POST(request({ name: "Helm", parentId: "ski" }), context("required-equipment"));

    expect(createMasterDataItem).toHaveBeenCalledWith("required-equipment", {
      name: "Helm",
      parentId: "ski",
    });
  });

  it("rejects an unknown category, so a URL segment cannot name a collection", async () => {
    const response = await POST(request({ name: "x" }), context("users"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(createMasterDataItem).not.toHaveBeenCalled();
  });

  it("rejects an anonymous caller with 401", async () => {
    getUserWithRole.mockResolvedValue(null);

    const response = await POST(request({ name: "3AHIT" }), context("classes"));

    expect(response.status).toBe(401);
    expect(createMasterDataItem).not.toHaveBeenCalled();
  });

  it("rejects a student with 403, so a bypassed client cannot write", async () => {
    getUserWithRole.mockResolvedValue({
      uid: "u2",
      email: "s@student.htldornbirn.at",
      role: "student",
    });

    const response = await POST(request({ name: "3AHIT" }), context("classes"));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "PERMISSION_DENIED" } });
    expect(createMasterDataItem).not.toHaveBeenCalled();
  });

  it("returns the shared validation envelope for a blank name", async () => {
    const response = await POST(request({ name: "   " }), context("classes"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toBeDefined();
    expect(createMasterDataItem).not.toHaveBeenCalled();
  });

  it("maps a duplicate name onto 409", async () => {
    createMasterDataItem.mockRejectedValue(new ServiceError("CONFLICT", "Schon vorhanden."));

    const response = await POST(request({ name: "3AHIT" }), context("classes"));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "CONFLICT", message: "Schon vorhanden." },
    });
  });

  it("hides an unexpected failure behind a sanitized 500", async () => {
    createMasterDataItem.mockRejectedValue(new Error("adminDb exploded at line 42"));

    const response = await POST(request({ name: "3AHIT" }), context("classes"));

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("line 42");
  });
});

describe("GET /api/master-data/[category]", () => {
  it("reports the items blocked by the in-use guard", async () => {
    const response = await GET(new Request("https://example.com"), context("classes"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ blockedIds: ["c1"] });
  });

  it("rejects a student, since the answer is derived from data they cannot read", async () => {
    getUserWithRole.mockResolvedValue({
      uid: "u2",
      email: "s@student.htldornbirn.at",
      role: "student",
    });

    const response = await GET(new Request("https://example.com"), context("classes"));

    expect(response.status).toBe(403);
    expect(blockedItemIds).not.toHaveBeenCalled();
  });

  it("rejects an unknown category", async () => {
    const response = await GET(new Request("https://example.com"), context("users"));

    expect(response.status).toBe(400);
    expect(blockedItemIds).not.toHaveBeenCalled();
  });
});
