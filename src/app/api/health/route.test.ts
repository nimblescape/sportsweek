import { describe, expect, it, vi, beforeEach } from "vitest";

const getSessionUser = vi.fn();

vi.mock("@/lib/session", () => ({ getSessionUser }));

const { GET } = await import("@/app/api/health/route");

describe("GET /api/health", () => {
  beforeEach(() => {
    getSessionUser.mockReset();
  });

  it("returns 401 when there is no session", async () => {
    getSessionUser.mockResolvedValue(null);

    const response = await GET(new Request("https://example.com/api/health"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "AUTHENTICATION_REQUIRED", message: "Sign-in required" },
    });
  });

  it("returns 400 for an invalid query parameter", async () => {
    getSessionUser.mockResolvedValue({ uid: "user-1", email: null, role: "student" });

    const response = await GET(new Request("https://example.com/api/health?verbose=maybe"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 200 with the user's uid when signed in", async () => {
    getSessionUser.mockResolvedValue({ uid: "user-1", email: null, role: "student" });

    const response = await GET(new Request("https://example.com/api/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", uid: "user-1" });
  });
});
