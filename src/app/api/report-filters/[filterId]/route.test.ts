/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FILTER, toggleTag } from "@/lib/filters/student-filter";

const getUserWithRole = vi.fn();
const renameSavedFilter = vi.fn();
const deleteSavedFilter = vi.fn();

vi.mock("@/lib/auth/guards", () => ({ getUserWithRole: () => getUserWithRole() }));
vi.mock("@/lib/report/saved-filter-service", () => ({
  renameSavedFilter: (...args: unknown[]) => renameSavedFilter(...args),
  deleteSavedFilter: (...args: unknown[]) => deleteSavedFilter(...args),
}));

const { DELETE, PATCH } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");
const { ErrorCode } = await import("@/lib/errors");

const TEACHER = "jane.doe@htldornbirn.at";
const selection = toggleTag(EMPTY_FILTER, "class", "5AHIF");
const params = Promise.resolve({ filterId: "f1" });

function patchRequest(body: unknown) {
  return new Request("https://example.com/api/report-filters/f1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserWithRole.mockResolvedValue({ uid: "u1", email: TEACHER, role: "teacher" });
  renameSavedFilter.mockResolvedValue({
    id: "f1",
    name: "5BHIF",
    filter: selection,
    createdByUserId: TEACHER,
  });
  deleteSavedFilter.mockResolvedValue(undefined);
});

describe("PATCH /api/report-filters/[filterId]", () => {
  it("renames the filter in place", async () => {
    const response = await PATCH(patchRequest({ name: "5BHIF" }), { params });

    expect(response.status).toBe(200);
    expect(renameSavedFilter).toHaveBeenCalledWith("f1", "5BHIF");
  });

  it("refuses a request that tries to rewrite the selection alongside the name", async () => {
    const response = await PATCH(patchRequest({ name: "5BHIF", filter: selection }), { params });

    expect(response.status).toBe(400);
    expect(renameSavedFilter).not.toHaveBeenCalled();
  });

  it("rejects a student with 403", async () => {
    getUserWithRole.mockResolvedValue({ uid: "u2", email: "s@x.at", role: "student" });

    expect((await PATCH(patchRequest({ name: "5BHIF" }), { params })).status).toBe(403);
    expect(renameSavedFilter).not.toHaveBeenCalled();
  });

  it("passes a service refusal on in the shared envelope", async () => {
    renameSavedFilter.mockRejectedValue(
      new ServiceError(ErrorCode.NotFound, "Diesen Filter gibt es nicht."),
    );

    const response = await PATCH(patchRequest({ name: "5BHIF" }), { params });

    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toBe("Diesen Filter gibt es nicht.");
  });
});

describe("DELETE /api/report-filters/[filterId]", () => {
  it("removes the filter", async () => {
    const response = await DELETE(new Request("https://example.com"), { params });

    expect(response.status).toBe(204);
    expect(deleteSavedFilter).toHaveBeenCalledWith("f1");
  });

  it("rejects a student with 403", async () => {
    getUserWithRole.mockResolvedValue({ uid: "u2", email: "s@x.at", role: "student" });

    expect((await DELETE(new Request("https://example.com"), { params })).status).toBe(403);
    expect(deleteSavedFilter).not.toHaveBeenCalled();
  });
});
