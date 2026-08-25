import "server-only";
import type { Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";

/**
 * Reduces a name to the form used for comparison: trimmed and case-folded, so "Montafon",
 * " montafon " and "MONTAFON" all count as the same name (US-4, US-5 to US-10).
 *
 * Deliberately not accent-folding — "Grün" and "Grun" are different words in German, and
 * treating them as one would reject legitimate names.
 */
export function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase("de-AT");
}

type Params = {
  collection: string;
  name: string;
  /** Restricts the check to one parent, e.g. events within their season. */
  scope?: { field: string; value: string };
  /** The record being renamed, so keeping its own name is not a clash. */
  exceptId?: string;
};

/**
 * Firestore has no unique constraint, so uniqueness is enforced by reading the siblings
 * inside the caller's transaction. The Admin SDK takes read locks, which is what stops two
 * concurrent creates from both finding the name free.
 *
 * The comparison happens in memory because Firestore cannot query case-insensitively; these
 * lists are teacher-maintained and small, so reading them is cheap.
 */
export async function assertNameIsFree(
  transaction: Transaction,
  { collection, name, scope, exceptId }: Params,
): Promise<void> {
  const siblings = scope
    ? adminDb.collection(collection).where(scope.field, "==", scope.value)
    : adminDb.collection(collection);

  const snapshot = await transaction.get(siblings);
  const wanted = normalizeName(name);

  const clash = snapshot.docs.some((doc) => {
    if (doc.id === exceptId) return false;
    const existing = doc.data().name;
    return typeof existing === "string" && normalizeName(existing) === wanted;
  });

  if (clash) {
    throw new ServiceError(
      ErrorCode.Conflict,
      scope
        ? `Den Namen „${name.trim()}" gibt es in dieser Saison bereits.`
        : `Den Namen „${name.trim()}" gibt es bereits.`,
    );
  }
}
