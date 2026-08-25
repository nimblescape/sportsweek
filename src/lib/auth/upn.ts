import type { UserRole } from "@/lib/schemas/user";

const TEACHER_DOMAIN = "htldornbirn.at";
const STUDENT_DOMAIN = "student.htldornbirn.at";

/**
 * Derives the role from an Entra ID UPN (US-3).
 * The domain must match exactly, so lookalikes such as `evil-htldornbirn.at`,
 * `mail.htldornbirn.at` or `htldornbirn.at.evil.com` are rejected.
 */
export function roleFromUpn(upn: string): UserRole | null {
  const parts = upn.trim().toLowerCase().split("@");
  if (parts.length !== 2) return null;

  const [localPart, domain] = parts;
  if (!localPart || !domain) return null;

  if (domain === TEACHER_DOMAIN) return "teacher";
  if (domain === STUDENT_DOMAIN) return "student";
  return null;
}
