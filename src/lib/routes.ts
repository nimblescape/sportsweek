import type { UserRole } from "@/lib/schemas/user";

export const ROUTES = {
  signIn: "/sign-in",
  appRoot: "/app",
  report: "/app/report",
  assignment: "/app/assignment",
  masterData: "/app/master-data",
  studentMasterData: "/app/my-master-data",
} as const;

export const TEACHER_ONLY_PREFIXES = [ROUTES.report, ROUTES.assignment, ROUTES.masterData] as const;

// A teacher has no master data record of their own, so this page is student-only (US-15).
export const STUDENT_ONLY_PREFIXES = [ROUTES.studentMasterData] as const;

export function homeFor(role: UserRole): string {
  return role === "teacher" ? ROUTES.report : ROUTES.studentMasterData;
}

export function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
