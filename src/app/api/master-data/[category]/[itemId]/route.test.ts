/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserWithRole = vi.fn();
const updateMasterDataItem = vi.fn();
const deleteMasterDataItem = vi.fn();

vi.mock("@/lib/auth/guards", () => ({
  getUserWithRole: () => getUserWithRole(),
}));

vi.mock("@/lib/master-data/master-data-service", () => ({
  updateMasterDataItem: (...args: unknown[]) => updateMasterDataItem(...args),
  deleteMasterDataItem: (...args: unknown[]) => deleteMasterDataItem(...args),
}));

const { PATCH, DELETE } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");
const { IN_USE_HINT } = await import("@/lib/master-data/categories");

function patchRequest(body: unknown) {
  return new Request("https://example.com/api/master-data/classes/c1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function context(category: string, itemId = "c1") {
  return { params: Promise.resolve({ category, itemId }) };
}

beforeEach(() => {
  getUserWithRole.mockReset();
  updateMasterDataItem.mockReset();
  deleteMasterDataItem.mockReset();
  getUserWithRole.mockResolvedValue({ uid: "u1", email: "t@htldornbirn.at", role: "teacher" });
  updateMasterDataItem.mockResolvedValue({ id: "c1", name: "3BHIT", parentId: null });
  deleteMasterDataItem.mockResolvedValue(undefined);
});

describe("PATCH /api/master-data/[category]/[itemId]", () => {
  it("renames the item and returns it", async () => {
    const response = await PATCH(patchRequest({ name: "3BHIT" }), context("classes"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ item: { id: "c1", name: "3BHIT", parentId: null } });
    expect(updateMasterDataItem).toHaveBeenCalledWith("classes", "c1", { name: "3BHIT" });
  });

  it("rejects an unknown category", async () => {
    const response = await PATCH(patchRequest({ name: "3BHIT" }), context("users"));

    expect(response.status).toBe(400);
    expect(updateMasterDataItem).not.toHaveBeenCalled();
  });

  it("rejects a student with 403, so a bypassed client cannot edit a blocked item", async () => {
    getUserWithRole.mockResolvedValue({
      uid: "u2",
      email: "s@student.htldornbirn.at",
      role: "student",
    });

    const response = await PATCH(patchRequest({ name: "3BHIT" }), context("classes"));

    expect(response.status).toBe(403);
    expect(updateMasterDataItem).not.toHaveBeenCalled();
  });

  it("returns the shared validation envelope for a blank name", async () => {
    const response = await PATCH(patchRequest({ name: "  " }), context("classes"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toBeDefined();
  });

  it("rejects an unknown field rather than ignoring it", async () => {
    const response = await PATCH(
      patchRequest({ name: "3BHIT", parentId: "elsewhere" }),
      context("classes"),
    );

    expect(response.status).toBe(400);
    expect(updateMasterDataItem).not.toHaveBeenCalled();
  });

  it("passes the in-use rejection on with its hint intact", async () => {
    updateMasterDataItem.mockRejectedValue(new ServiceError("CONFLICT", IN_USE_HINT));

    const response = await PATCH(patchRequest({ name: "3BHIT" }), context("classes"));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "CONFLICT", message: IN_USE_HINT },
    });
  });
});

describe("DELETE /api/master-data/[category]/[itemId]", () => {
  it("deletes the item", async () => {
    const response = await DELETE(new Request("https://example.com"), context("classes"));

    expect(response.status).toBe(204);
    expect(deleteMasterDataItem).toHaveBeenCalledWith("classes", "c1");
  });

  it("rejects an unknown category", async () => {
    const response = await DELETE(new Request("https://example.com"), context("users"));

    expect(response.status).toBe(400);
    expect(deleteMasterDataItem).not.toHaveBeenCalled();
  });

  it("rejects a student with 403", async () => {
    getUserWithRole.mockResolvedValue({
      uid: "u2",
      email: "s@student.htldornbirn.at",
      role: "student",
    });

    const response = await DELETE(new Request("https://example.com"), context("classes"));

    expect(response.status).toBe(403);
    expect(deleteMasterDataItem).not.toHaveBeenCalled();
  });

  it("reports a missing item as 404", async () => {
    deleteMasterDataItem.mockRejectedValue(new ServiceError("NOT_FOUND", "Gibt es nicht."));

    const response = await DELETE(new Request("https://example.com"), context("classes"));

    expect(response.status).toBe(404);
  });

  it("passes the in-use rejection on with its hint intact", async () => {
    deleteMasterDataItem.mockRejectedValue(new ServiceError("CONFLICT", IN_USE_HINT));

    const response = await DELETE(new Request("https://example.com"), context("classes"));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "CONFLICT", message: IN_USE_HINT } });
  });
});
