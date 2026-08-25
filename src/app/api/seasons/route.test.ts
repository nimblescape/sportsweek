import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserWithRole = vi.fn();
const createSeason = vi.fn();

vi.mock("@/lib/auth/guards", () => ({
  getUserWithRole: () => getUserWithRole(),
}));

vi.mock("@/lib/seasons/season-service", () => ({
  createSeason: (...args: unknown[]) => createSeason(...args),
}));

const { POST } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");

function postRequest(body: unknown) {
  return new Request("https://example.com/api/seasons", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getUserWithRole.mockReset();
  createSeason.mockReset();
  getUserWithRole.mockResolvedValue({ uid: "u1", email: "t@htldornbirn.at", role: "teacher" });
  createSeason.mockResolvedValue({
    id: "s1",
    name: "Winter 2026",
    isActive: false,
    isArchived: false,
  });
});

describe("POST /api/seasons", () => {
  it("creates the season and returns it", async () => {
    const response = await POST(postRequest({ name: "Winter 2026" }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      season: { id: "s1", name: "Winter 2026", isActive: false, isArchived: false },
    });
    expect(createSeason).toHaveBeenCalledWith({ name: "Winter 2026" });
  });

  it("rejects an anonymous caller with 401", async () => {
    getUserWithRole.mockResolvedValue(null);

    const response = await POST(postRequest({ name: "Winter 2026" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "AUTHENTICATION_REQUIRED" },
    });
    expect(createSeason).not.toHaveBeenCalled();
  });

  it("rejects a student with 403, so a bypassed client cannot write", async () => {
    getUserWithRole.mockResolvedValue({
      uid: "u2",
      email: "s@student.htldornbirn.at",
      role: "student",
    });

    const response = await POST(postRequest({ name: "Winter 2026" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "PERMISSION_DENIED" } });
    expect(createSeason).not.toHaveBeenCalled();
  });

  it("returns the shared validation envelope for a blank name", async () => {
    const response = await POST(postRequest({ name: "   " }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toBeDefined();
    expect(createSeason).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed body", async () => {
    const response = await POST(
      new Request("https://example.com/api/seasons", { method: "POST", body: "not json" }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("maps a service conflict onto its status without leaking internals", async () => {
    createSeason.mockRejectedValue(new ServiceError("CONFLICT", "Schon vorhanden."));

    const response = await POST(postRequest({ name: "Winter 2026" }));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "CONFLICT", message: "Schon vorhanden." },
    });
  });

  it("hides an unexpected failure behind a sanitized 500", async () => {
    createSeason.mockRejectedValue(new Error("adminDb exploded at line 42"));

    const response = await POST(postRequest({ name: "Winter 2026" }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("line 42");
  });
});
