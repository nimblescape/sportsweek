import "server-only";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { COLLECTIONS } from "@/lib/schemas/collections";
import { userSchema, type User } from "@/lib/schemas/user";
import { roleFromUpn } from "./upn";

export type EntraClaims = {
  uid: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  role?: unknown;
};

export type ProvisionOutcome =
  { ok: true; user: User } | { ok: false; reason: "missing-upn" | "unsupported-domain" };

function resolveName(claims: EntraClaims, fallback: string) {
  const given = claims.given_name?.trim();
  const family = claims.family_name?.trim();
  if (given && family) return { firstName: given, lastName: family };

  const parts = claims.name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length >= 2) {
    return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
  }

  return { firstName: given ?? parts[0] ?? fallback, lastName: family ?? fallback };
}

/**
 * Creates the user record on first login and keeps the role custom claim in sync (US-1, US-3).
 * Runs server-side only — the Admin SDK bypasses Security Rules, which deny client writes to `users`.
 */
export async function provisionUser(claims: EntraClaims): Promise<ProvisionOutcome> {
  const upn = claims.email?.trim().toLowerCase();
  if (!upn) return { ok: false, reason: "missing-upn" };

  const derivedRole = roleFromUpn(upn);
  if (!derivedRole) return { ok: false, reason: "unsupported-domain" };

  const localPart = upn.slice(0, upn.indexOf("@"));
  const { firstName, lastName } = resolveName(claims, localPart);
  const ref = adminDb.collection(COLLECTIONS.users).doc(upn);
  const snapshot = await ref.get();

  let role = derivedRole;
  if (snapshot.exists) {
    // The role is assigned once, at creation; a later login never recomputes it (US-3).
    const stored = userSchema.shape.role.safeParse(snapshot.data()?.role);
    if (stored.success) role = stored.data;
    await ref.update({ firstName, lastName, email: upn });
  } else {
    await ref.set({ firstName, lastName, email: upn, role });
  }

  const user = userSchema.parse({ id: upn, firstName, lastName, email: upn, role });

  if (claims.role !== role) {
    await adminAuth.setCustomUserClaims(claims.uid, { role });
  }

  return { ok: true, user };
}
