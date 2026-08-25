import { userRoleSchema, type UserRole } from "@/lib/schemas/user";

/**
 * Reads the role claim from a Firebase session cookie WITHOUT verifying its signature.
 *
 * Optimistic routing only — never authorization. Signature verification needs the Admin SDK,
 * which cannot run in the proxy's Edge runtime, so every protected page re-checks the role
 * against the verified session (see lib/auth/guards).
 */
export function readUnverifiedRole(sessionCookie: string): UserRole | null {
  const payload = sessionCookie.split(".")[1];
  if (!payload) return null;

  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const role = (claims as { role?: unknown } | null)?.role;

    const parsed = userRoleSchema.safeParse(role);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
