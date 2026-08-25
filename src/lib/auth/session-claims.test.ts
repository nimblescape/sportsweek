import { describe, expect, it } from "vitest";
import { readUnverifiedRole } from "@/lib/auth/session-claims";

function jwtWith(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256" })}.${encode(payload)}.signature-not-checked`;
}

describe("readUnverifiedRole", () => {
  it.each(["teacher", "student"])("reads the %s role from the cookie payload", (role) => {
    expect(readUnverifiedRole(jwtWith({ role }))).toBe(role);
  });

  it("decodes a payload containing non-ASCII characters", () => {
    expect(readUnverifiedRole(jwtWith({ role: "teacher", name: "Jürgen Öztürk" }))).toBe("teacher");
  });

  it("returns null when the role claim is missing", () => {
    expect(readUnverifiedRole(jwtWith({ uid: "user-1" }))).toBeNull();
  });

  it("returns null for an unsupported role", () => {
    expect(readUnverifiedRole(jwtWith({ role: "admin" }))).toBeNull();
  });

  it("returns null for a legacy roles array", () => {
    expect(readUnverifiedRole(jwtWith({ roles: ["teacher"] }))).toBeNull();
  });

  it.each([
    ["an empty string", ""],
    ["a non-JWT value", "not-a-jwt"],
    ["a truncated JWT", "header-only."],
    ["an undecodable payload", "header.@@@@.signature"],
  ])("returns null for %s", (_case, cookie) => {
    expect(readUnverifiedRole(cookie)).toBeNull();
  });
});
