import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/session";

function makeRequest(pathname: string, { withSession = false } = {}) {
  const headers = new Headers();
  if (withSession) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=abc123`);
  }
  return new NextRequest(new URL(pathname, "https://example.com"), { headers });
}

describe("proxy", () => {
  it("passes through requests outside the protected prefix", () => {
    const response = proxy(makeRequest("/sign-in"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects to sign-in when no session cookie is present", () => {
    const response = proxy(makeRequest("/app/dashboard"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("next")).toBe("/app/dashboard");
  });

  it("passes through protected requests when a session cookie is present", () => {
    const response = proxy(makeRequest("/app/dashboard", { withSession: true }));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
