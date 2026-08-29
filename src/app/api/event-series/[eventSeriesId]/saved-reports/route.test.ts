/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FILTER, toggleTag } from "@/lib/filters/student-filter";

const getAuthenticatedUser = vi.fn();
const createSavedReport = vi.fn();
const reorderSavedReports = vi.fn();

vi.mock("@/lib/auth/guards", () => ({ getAuthenticatedUser: () => getAuthenticatedUser() }));
vi.mock("@/lib/report/saved-report-service", () => ({
  createSavedReport: (...args: unknown[]) => createSavedReport(...args),
  reorderSavedReports: (...args: unknown[]) => reorderSavedReports(...args),
}));

const { PATCH, POST } = await import("./route");

const TEACHER = "jane.doe@htldornbirn.at";
const SERIES = "s1";
const context = { params: Promise.resolve({ eventSeriesId: SERIES }) };
const selection = toggleTag(EMPTY_FILTER, "class", "5AHIF");
const fields = ["class", "contact"];
const input = { name: "5AHIF", filter: selection, fields };

function postRequest(body: unknown) {
  return new Request(`https://example.com/api/event-series/${SERIES}/saved-reports`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function patchRequest(body: unknown) {
  return new Request(`https://example.com/api/event-series/${SERIES}/saved-reports`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedUser.mockResolvedValue({
    uid: "u1",
    email: TEACHER,
    accountType: "teacher",
    permissions: ["editReports"],
  });
  createSavedReport.mockResolvedValue({ id: "r1", ...input, createdByUserId: TEACHER });
  reorderSavedReports.mockResolvedValue(undefined);
});

describe("POST /api/event-series/[eventSeriesId]/saved-reports", () => {
  it("saves both selections under one name", async () => {
    const response = await POST(postRequest(input), context);

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      report: { id: "r1", ...input, createdByUserId: TEACHER },
    });
  });

  it("attributes it to the session rather than to anything the request says", async () => {
    await POST(postRequest({ ...input, createdByUserId: "someone@else.at" }), context);

    expect(createSavedReport).not.toHaveBeenCalled();
  });

  /** A report filters on one series' lists, so which series is the path rather than a field. */
  it("saves it into the series the address names, and takes the author from the session", async () => {
    await POST(postRequest(input), context);

    expect(createSavedReport).toHaveBeenCalledWith(SERIES, input, TEACHER);
  });

  it("rejects a student with 403, since the report is a teacher's (US-13)", async () => {
    getAuthenticatedUser.mockResolvedValue({
      uid: "u2",
      email: "s@x.at",
      accountType: "student",
    });

    const response = await POST(postRequest(input), context);

    expect(response.status).toBe(403);
    expect(createSavedReport).not.toHaveBeenCalled();
  });

  /** Saving a report is its own permission: seeing one does not grant keeping it for everybody. */
  it("rejects a teacher who may only view reports", async () => {
    getAuthenticatedUser.mockResolvedValue({
      uid: "u3",
      email: "t2@htldornbirn.at",
      accountType: "teacher",
      permissions: ["viewReports", "editAssignments", "editMasterData"],
    });

    const response = await POST(postRequest(input), context);

    expect(response.status).toBe(403);
    expect(createSavedReport).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller with 401", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    expect((await POST(postRequest(input), context)).status).toBe(401);
  });

  it("rejects a blank name with the shared envelope", async () => {
    const response = await POST(postRequest({ ...input, name: "  " }), context);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(createSavedReport).not.toHaveBeenCalled();
  });

  it("fills in a category that did not exist when the report was saved", async () => {
    const tags = Object.fromEntries(
      Object.entries(selection.tags).filter(([category]) => category !== "event"),
    );

    await POST(postRequest({ ...input, filter: { ...selection, tags } }), context);

    expect(createSavedReport).toHaveBeenCalledWith(SERIES, input, TEACHER);
  });
});

describe("PATCH /api/event-series/[eventSeriesId]/saved-reports", () => {
  it("renumbers the row in the order the tags were dropped into", async () => {
    const response = await PATCH(patchRequest({ order: ["r2", "r1"] }), context);

    expect(response.status).toBe(204);
    expect(reorderSavedReports).toHaveBeenCalledWith(SERIES, ["r2", "r1"]);
  });

  it("rejects a student with 403, so a bypassed client cannot reorder", async () => {
    getAuthenticatedUser.mockResolvedValue({
      uid: "u2",
      email: "s@x.at",
      accountType: "student",
    });

    expect((await PATCH(patchRequest({ order: ["r1"] }), context)).status).toBe(403);
    expect(reorderSavedReports).not.toHaveBeenCalled();
  });

  it("rejects a body that is not an order", async () => {
    const response = await PATCH(patchRequest({ order: ["r1"], name: "5AHIF" }), context);

    expect(response.status).toBe(400);
    expect(reorderSavedReports).not.toHaveBeenCalled();
  });
});
