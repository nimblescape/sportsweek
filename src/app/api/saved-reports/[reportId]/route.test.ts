/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FILTER, toggleTag } from "@/lib/filters/student-filter";

const getUserWithRole = vi.fn();
const renameSavedReport = vi.fn();
const updateSavedReportSelection = vi.fn();
const deleteSavedReport = vi.fn();

vi.mock("@/lib/auth/guards", () => ({ getUserWithRole: () => getUserWithRole() }));
vi.mock("@/lib/report/saved-report-service", () => ({
  renameSavedReport: (...args: unknown[]) => renameSavedReport(...args),
  updateSavedReportSelection: (...args: unknown[]) => updateSavedReportSelection(...args),
  deleteSavedReport: (...args: unknown[]) => deleteSavedReport(...args),
}));

const { DELETE, PATCH } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");
const { ErrorCode } = await import("@/lib/errors");

const TEACHER = "jane.doe@htldornbirn.at";
const selection = toggleTag(EMPTY_FILTER, "class", "5AHIF");
const params = Promise.resolve({ reportId: "r1" });
const report = {
  id: "r1",
  name: "5BHIF",
  filter: selection,
  fields: ["class"],
  createdByUserId: TEACHER,
};

function patchRequest(body: unknown) {
  return new Request("https://example.com/api/saved-reports/r1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserWithRole.mockResolvedValue({ uid: "u1", email: TEACHER, role: "teacher" });
  renameSavedReport.mockResolvedValue(report);
  updateSavedReportSelection.mockResolvedValue(report);
  deleteSavedReport.mockResolvedValue(undefined);
});

describe("PATCH /api/saved-reports/[reportId]", () => {
  it("renames the saved report in place", async () => {
    const response = await PATCH(patchRequest({ name: "5BHIF" }), { params });

    expect(response.status).toBe(200);
    expect(renameSavedReport).toHaveBeenCalledWith("r1", "5BHIF");
  });

  it("refuses a request that tries to rewrite what it holds alongside the name", async () => {
    const response = await PATCH(patchRequest({ name: "5BHIF", filter: selection }), { params });

    expect(response.status).toBe(400);
    expect(renameSavedReport).not.toHaveBeenCalled();
    expect(updateSavedReportSelection).not.toHaveBeenCalled();
  });

  it("replaces what the report holds when the body is the two selections", async () => {
    const edit = { filter: selection, fields: ["class"] };

    const response = await PATCH(patchRequest(edit), { params });

    expect(response.status).toBe(200);
    expect(updateSavedReportSelection).toHaveBeenCalledWith("r1", edit);
    expect(renameSavedReport).not.toHaveBeenCalled();
  });

  it("refuses an edit that is neither, rather than storing half a report", async () => {
    const response = await PATCH(patchRequest({ fields: ["class"] }), { params });

    expect(response.status).toBe(400);
    expect(updateSavedReportSelection).not.toHaveBeenCalled();
  });

  it("rejects a student with 403", async () => {
    getUserWithRole.mockResolvedValue({ uid: "u2", email: "s@x.at", role: "student" });

    expect((await PATCH(patchRequest({ name: "5BHIF" }), { params })).status).toBe(403);
    expect(renameSavedReport).not.toHaveBeenCalled();
  });

  it("passes a service refusal on in the shared envelope", async () => {
    renameSavedReport.mockRejectedValue(
      new ServiceError(ErrorCode.NotFound, "Diesen Bericht gibt es nicht."),
    );

    const response = await PATCH(patchRequest({ name: "5BHIF" }), { params });

    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toBe("Diesen Bericht gibt es nicht.");
  });
});

describe("DELETE /api/saved-reports/[reportId]", () => {
  it("removes the saved report", async () => {
    const response = await DELETE(new Request("https://example.com"), { params });

    expect(response.status).toBe(204);
    expect(deleteSavedReport).toHaveBeenCalledWith("r1");
  });

  it("rejects a student with 403", async () => {
    getUserWithRole.mockResolvedValue({ uid: "u2", email: "s@x.at", role: "student" });

    expect((await DELETE(new Request("https://example.com"), { params })).status).toBe(403);
    expect(deleteSavedReport).not.toHaveBeenCalled();
  });
});
