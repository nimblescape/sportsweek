/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FILTER, toggleTag } from "@/lib/filters/student-filter";

const getUserWithAccountType = vi.fn();
const updateSavedReport = vi.fn();
const deleteSavedReport = vi.fn();

vi.mock("@/lib/auth/guards", () => ({ getUserWithAccountType: () => getUserWithAccountType() }));
vi.mock("@/lib/report/saved-report-service", () => ({
  updateSavedReport: (...args: unknown[]) => updateSavedReport(...args),
  deleteSavedReport: (...args: unknown[]) => deleteSavedReport(...args),
}));

const { DELETE, PATCH } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");
const { ErrorCode } = await import("@/lib/errors");

const TEACHER = "jane.doe@htldornbirn.at";
const SERIES = "s1";
const selection = toggleTag(EMPTY_FILTER, "class", "5AHIF");
const params = Promise.resolve({ eventSeriesId: SERIES, reportId: "r1" });
const report = {
  id: "r1",
  name: "5BHIF",
  filter: selection,
  fields: ["class"],
  createdByUserId: TEACHER,
};

function patchRequest(body: unknown) {
  return new Request(`https://example.com/api/event-series/${SERIES}/saved-reports/r1`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserWithAccountType.mockResolvedValue({ uid: "u1", email: TEACHER, accountType: "teacher" });
  updateSavedReport.mockResolvedValue(report);
  deleteSavedReport.mockResolvedValue(undefined);
});

describe("PATCH /api/event-series/[eventSeriesId]/saved-reports/[reportId]", () => {
  it("stores the name and both selections as one edit, in the series the address names", async () => {
    const edit = { name: "5BHIF", filter: selection, fields: ["class"] };

    const response = await PATCH(patchRequest(edit), { params });

    expect(response.status).toBe(200);
    expect(updateSavedReport).toHaveBeenCalledWith(SERIES, "r1", edit);
  });

  it("refuses a name on its own, which would store half a report", async () => {
    const response = await PATCH(patchRequest({ name: "5BHIF" }), { params });

    expect(response.status).toBe(400);
    expect(updateSavedReport).not.toHaveBeenCalled();
  });

  it("refuses the selections without the name they belong to", async () => {
    const response = await PATCH(patchRequest({ filter: selection, fields: ["class"] }), {
      params,
    });

    expect(response.status).toBe(400);
    expect(updateSavedReport).not.toHaveBeenCalled();
  });

  it("refuses a partial edit, rather than storing half a report", async () => {
    const response = await PATCH(patchRequest({ fields: ["class"] }), { params });

    expect(response.status).toBe(400);
    expect(updateSavedReport).not.toHaveBeenCalled();
  });

  it("rejects a student with 403", async () => {
    getUserWithAccountType.mockResolvedValue({
      uid: "u2",
      email: "s@x.at",
      accountType: "student",
    });

    expect((await PATCH(patchRequest(report), { params })).status).toBe(403);
    expect(updateSavedReport).not.toHaveBeenCalled();
  });

  it("passes a service refusal on in the shared envelope", async () => {
    updateSavedReport.mockRejectedValue(
      new ServiceError(ErrorCode.NotFound, "Diesen Bericht gibt es nicht."),
    );

    const response = await PATCH(
      patchRequest({ name: "5BHIF", filter: selection, fields: ["class"] }),
      { params },
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error.message).toBe("Diesen Bericht gibt es nicht.");
  });
});

describe("DELETE /api/event-series/[eventSeriesId]/saved-reports/[reportId]", () => {
  it("removes the saved report", async () => {
    const response = await DELETE(new Request("https://example.com"), { params });

    expect(response.status).toBe(204);
    expect(deleteSavedReport).toHaveBeenCalledWith(SERIES, "r1");
  });

  it("rejects a student with 403", async () => {
    getUserWithAccountType.mockResolvedValue({
      uid: "u2",
      email: "s@x.at",
      accountType: "student",
    });

    expect((await DELETE(new Request("https://example.com"), { params })).status).toBe(403);
    expect(deleteSavedReport).not.toHaveBeenCalled();
  });
});
