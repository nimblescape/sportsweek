/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { SESSION_COOKIE_NAME } from "@/lib/session";

function sessionCookieWith(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256" })}.${encode(payload)}.signature-not-checked`;
}

function makeRequest(pathname: string, { session }: { session?: string } = {}) {
  const headers = new Headers();
  if (session !== undefined) {
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${session}`);
  }
  return new NextRequest(new URL(pathname, "https://example.com"), { headers });
}

const asTeacher = { session: sessionCookieWith({ accountType: "teacher" }) };
const asStudent = { session: sessionCookieWith({ accountType: "student" }) };

function locationOf(response: Response) {
  return new URL(response.headers.get("location")!).pathname;
}

describe("proxy", () => {
  it("passes through requests outside the protected prefix", () => {
    const response = proxy(makeRequest("/sign-in"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirects to sign-in when no session cookie is present", () => {
    const response = proxy(makeRequest("/app/s1/report"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("next")).toBe("/app/s1/report");
  });

  it("passes the app landing route through for any signed-in role", () => {
    expect(proxy(makeRequest("/app", asTeacher)).status).toBe(200);
    expect(proxy(makeRequest("/app", asStudent)).status).toBe(200);
  });

  it.each([
    "/app/s1/report",
    "/app/s1/assignment",
    "/app/s1/registrations",
    "/app/s1/master-data/classes",
    "/app/event-series",
  ])("lets a teacher reach %s", (pathname) => {
    const response = proxy(makeRequest(pathname, asTeacher));
    expect(response.status).toBe(200);
  });

  it.each([
    "/app/s1/report",
    "/app/s1/assignment",
    "/app/s1/registrations",
    "/app/s1/master-data/classes",
    "/app/event-series",
  ])("redirects a student away from %s", (pathname) => {
    const response = proxy(makeRequest(pathname, asStudent));
    expect(response.status).toBe(307);
    expect(locationOf(response)).toBe("/app");
  });

  /**
   * The series id is a path segment now, so there is no fixed prefix left to enumerate. A page
   * nobody listed is therefore a teacher's rather than everyone's — a new one is guarded by
   * existing, not by somebody remembering to add it here.
   */
  it("keeps a student out of a teacher page nothing has heard of yet", () => {
    const response = proxy(makeRequest("/app/s1/whatever-lands-next", asStudent));
    expect(response.status).toBe(307);
    expect(locationOf(response)).toBe("/app");
  });

  it("lets a student reach their own registration", () => {
    expect(proxy(makeRequest("/app/my-registration", asStudent)).status).toBe(200);
  });

  it("redirects a teacher away from the registration page", () => {
    const response = proxy(makeRequest("/app/my-registration", asTeacher));
    expect(response.status).toBe(307);
    expect(locationOf(response)).toBe("/app");
  });

  it("passes through when the role claim cannot be read, since the page re-checks it", () => {
    const response = proxy(makeRequest("/app/s1/report", { session: "unreadable" }));
    expect(response.status).toBe(200);
  });
});
