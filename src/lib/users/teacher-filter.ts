/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { Permission } from "@/lib/auth/permissions";
import type { Teacher } from "./use-teachers";

/**
 * What the rights page is showing: a name to search for, and the permissions to narrow by
 * (US-30). Shaped like the report's filter and read the same way — the tags are one row, so
 * they are alternatives rather than conditions to be met at once.
 */
export type TeacherFilter = {
  name: string;
  permissions: readonly Permission[];
  /** Who is waiting for access — a tag in the same row, so it reads as one more alternative. */
  withoutPermissions: boolean;
};

export const EMPTY_TEACHER_FILTER: TeacherFilter = {
  name: "",
  permissions: [],
  withoutPermissions: false,
};

/** Whether the tag row is showing everybody, which is what its "Alle" tag reports. */
export function hasNoFilter(filter: TeacherFilter): boolean {
  return filter.permissions.length === 0 && !filter.withoutPermissions;
}

export function togglePermissionTag(filter: TeacherFilter, permission: Permission): TeacherFilter {
  const pressed = filter.permissions.includes(permission);

  return {
    ...filter,
    permissions: pressed
      ? filter.permissions.filter((one) => one !== permission)
      : [...filter.permissions, permission],
  };
}

export function toggleWithoutPermissions(filter: TeacherFilter): TeacherFilter {
  return { ...filter, withoutPermissions: !filter.withoutPermissions };
}

export function clearPermissionTags(filter: TeacherFilter): TeacherFilter {
  return { ...filter, permissions: [], withoutPermissions: false };
}

/** The address is searched as well as the name: a colleague is as often looked up by it. */
function matchesName(teacher: Teacher, name: string): boolean {
  const wanted = name.trim().toLocaleLowerCase("de-AT");
  if (wanted === "") return true;

  return [teacher.firstName, teacher.lastName, teacher.upn].some((field) =>
    field.toLocaleLowerCase("de-AT").includes(wanted),
  );
}

/** The tags are one row, so they are alternatives: whoever answers to any pressed one is kept. */
function matchesTags(teacher: Teacher, filter: TeacherFilter): boolean {
  if (hasNoFilter(filter)) return true;
  if (filter.withoutPermissions && teacher.permissions.length === 0) return true;

  return filter.permissions.some((permission) => teacher.permissions.includes(permission));
}

export function filterTeachers(
  teachers: readonly Teacher[],
  filter: TeacherFilter,
): readonly Teacher[] {
  return teachers.filter(
    (teacher) => matchesName(teacher, filter.name) && matchesTags(teacher, filter),
  );
}
