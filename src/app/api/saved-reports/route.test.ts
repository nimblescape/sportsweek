/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FILTER, toggleTag } from "@/lib/filters/student-filter";

const getUserWithRole = vi.fn();
const createSavedReport = vi.fn();

vi.mock("@/lib/auth/guards", () => ({ getUserWithRole: () => getUserWithRole() }));
vi.mock("@/lib/report/saved-report-service", () => ({
  createSavedReport: (...args: unknown[]) => createSavedReport(...args),
}));

const { POST } = await import("./route");

const TEACHER = "jane.doe@htldornbirn.at";
const selection = toggleTag(EMPTY_FILTER, "class", "5AHIF");
const fields = ["class", "contact"];
const input = { name: "5AHIF", filter: selection, fields };

function postRequest(body: unknown) {
  return new Request("https://example.com/api/saved-reports", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserWithRole.mockResolvedValue({ uid: "u1", email: TEACHER, role: "teacher" });
  createSavedReport.mockResolvedValue({ id: "r1", ...input, createdByUserId: TEACHER });
});

describe("POST /api/saved-reports", () => {
  it("saves both selections under one name", async () => {
    const response = await POST(postRequest(input));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      report: { id: "r1", ...input, createdByUserId: TEACHER },
    });
  });

  it("attributes it to the session rather than to anything the request says", async () => {
    await POST(postRequest({ ...input, createdByUserId: "someone@else.at" }));

    expect(createSavedReport).not.toHaveBeenCalled();
  });

  it("takes the author from the session", async () => {
    await POST(postRequest(input));

    expect(createSavedReport).toHaveBeenCalledWith(input, TEACHER);
  });

  it("rejects a student with 403, since the report is a teacher's (US-13)", async () => {
    getUserWithRole.mockResolvedValue({ uid: "u2", email: "s@x.at", role: "student" });

    const response = await POST(postRequest(input));

    expect(response.status).toBe(403);
    expect(createSavedReport).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller with 401", async () => {
    getUserWithRole.mockResolvedValue(null);

    expect((await POST(postRequest(input))).status).toBe(401);
  });

  it("rejects a blank name with the shared envelope", async () => {
    const response = await POST(postRequest({ ...input, name: "  " }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(createSavedReport).not.toHaveBeenCalled();
  });

  it("fills in a category that did not exist when the report was saved", async () => {
    const tags = Object.fromEntries(
      Object.entries(selection.tags).filter(([category]) => category !== "event"),
    );

    await POST(postRequest({ ...input, filter: { ...selection, tags } }));

    expect(createSavedReport).toHaveBeenCalledWith(input, TEACHER);
  });
});
