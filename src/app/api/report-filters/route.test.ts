/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FILTER, toggleTag } from "@/lib/filters/student-filter";

const getUserWithRole = vi.fn();
const createSavedFilter = vi.fn();

vi.mock("@/lib/auth/guards", () => ({ getUserWithRole: () => getUserWithRole() }));
vi.mock("@/lib/report/saved-filter-service", () => ({
  createSavedFilter: (...args: unknown[]) => createSavedFilter(...args),
}));

const { POST } = await import("./route");

const TEACHER = "jane.doe@htldornbirn.at";
const selection = toggleTag(EMPTY_FILTER, "class", "5AHIF");

function postRequest(body: unknown) {
  return new Request("https://example.com/api/report-filters", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUserWithRole.mockResolvedValue({ uid: "u1", email: TEACHER, role: "teacher" });
  createSavedFilter.mockResolvedValue({
    id: "f1",
    name: "5AHIF",
    filter: selection,
    createdByUserId: TEACHER,
  });
});

describe("POST /api/report-filters", () => {
  it("saves the selection under its name", async () => {
    const response = await POST(postRequest({ name: "5AHIF", filter: selection }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      filter: { id: "f1", name: "5AHIF", filter: selection, createdByUserId: TEACHER },
    });
  });

  it("attributes it to the session rather than to anything the request says", async () => {
    await POST(
      postRequest({ name: "5AHIF", filter: selection, createdByUserId: "someone@else.at" }),
    );

    expect(createSavedFilter).not.toHaveBeenCalled();
  });

  it("takes the author from the session", async () => {
    await POST(postRequest({ name: "5AHIF", filter: selection }));

    expect(createSavedFilter).toHaveBeenCalledWith({ name: "5AHIF", filter: selection }, TEACHER);
  });

  it("rejects a student with 403, since the report is a teacher's (US-13)", async () => {
    getUserWithRole.mockResolvedValue({ uid: "u2", email: "s@x.at", role: "student" });

    const response = await POST(postRequest({ name: "5AHIF", filter: selection }));

    expect(response.status).toBe(403);
    expect(createSavedFilter).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated caller with 401", async () => {
    getUserWithRole.mockResolvedValue(null);

    expect((await POST(postRequest({ name: "5AHIF", filter: selection }))).status).toBe(401);
  });

  it("rejects a blank name with the shared envelope", async () => {
    const response = await POST(postRequest({ name: "  ", filter: selection }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(createSavedFilter).not.toHaveBeenCalled();
  });

  it("rejects a selection that is missing a category", async () => {
    const tags = Object.fromEntries(
      Object.entries(selection.tags).filter(([category]) => category !== "attendance"),
    );

    const response = await POST(postRequest({ name: "5AHIF", filter: { ...selection, tags } }));

    expect(response.status).toBe(400);
    expect(createSavedFilter).not.toHaveBeenCalled();
  });
});
