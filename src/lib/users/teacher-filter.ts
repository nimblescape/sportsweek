/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import type { Permission } from "@/lib/auth/permissions";
import { PERMISSION_LABELS } from "@/lib/auth/permissions";
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
  /** Has this teacher signed in at all — its own row, since it asks a different question. */
  logins: LoginFilterValue | null;
};

/**
 * The two answers a sign-in history gives, in the order the row shows them (US-48): whether
 * somebody has ever signed in, or never has. `null` on {@link TeacherFilter.logins} means
 * neither tag is pressed.
 */
export const LOGIN_FILTER_VALUES = { some: "some", none: "none" } as const;

export type LoginFilterValue = (typeof LOGIN_FILTER_VALUES)[keyof typeof LOGIN_FILTER_VALUES];

export const LOGIN_FILTER_LABELS: Record<LoginFilterValue, string> = {
  some: "Angemeldet",
  none: "Noch nie angemeldet",
};

/** Shared with the row's own tag (US-48, Q5): one sentence, not two spellings of it. */
export const NO_PERMISSIONS_LABEL = "Keine Rechte";

export const EMPTY_TEACHER_FILTER: TeacherFilter = {
  name: "",
  permissions: [],
  withoutPermissions: false,
  logins: null,
};

/** Whether the tag row is showing everybody, which is what its "Alle" tag reports. */
export function hasNoFilter(filter: TeacherFilter): boolean {
  return filter.permissions.length === 0 && !filter.withoutPermissions && filter.logins === null;
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

/** The two tags answer one question, so pressing either one releases the other (US-48). */
export function toggleLoginFilter(filter: TeacherFilter, value: LoginFilterValue): TeacherFilter {
  return { ...filter, logins: filter.logins === value ? null : value };
}

export function clearPermissionTags(filter: TeacherFilter): TeacherFilter {
  return { ...filter, permissions: [], withoutPermissions: false, logins: null };
}

/** The address is searched as well as the name: a colleague is as often looked up by it. */
function matchesName(teacher: Teacher, name: string): boolean {
  const wanted = name.trim().toLocaleLowerCase("de-AT");
  if (wanted === "") return true;

  return [teacher.firstName, teacher.lastName, teacher.email].some((field) =>
    field.toLocaleLowerCase("de-AT").includes(wanted),
  );
}

/** The tags are one row, so they are alternatives: whoever answers to any pressed one is kept. */
function matchesTags(teacher: Teacher, filter: TeacherFilter): boolean {
  if (filter.permissions.length === 0 && !filter.withoutPermissions) return true;
  if (filter.withoutPermissions && teacher.permissions.length === 0) return true;

  return filter.permissions.some((permission) => teacher.permissions.includes(permission));
}

/**
 * A teacher whose sign-in history has not settled, or was refused, matches neither tag: an
 * unread fact is not "never", and asserting it would be a claim this filter cannot back up.
 */
function matchesLogins(
  teacher: Teacher,
  filter: TeacherFilter,
  logins: ReadonlyMap<string, readonly string[]>,
): boolean {
  if (filter.logins === null) return true;

  const history = logins.get(teacher.uid);
  if (history === undefined) return false;

  return filter.logins === LOGIN_FILTER_VALUES.some ? history.length > 0 : history.length === 0;
}

export function filterTeachers(
  teachers: readonly Teacher[],
  filter: TeacherFilter,
  logins: ReadonlyMap<string, readonly string[]> = new Map(),
): readonly Teacher[] {
  return teachers.filter(
    (teacher) =>
      matchesName(teacher, filter.name) &&
      matchesTags(teacher, filter) &&
      matchesLogins(teacher, filter, logins),
  );
}

/**
 * What the filter leaves, in words: the name searched for, then the tags pressed, in the words
 * the tags themselves use (Q5) — not re-worded for the report, so a tag and its account here
 * never drift apart. Null where it restricts nothing, which is a report of everybody and has
 * nothing to say about itself.
 */
export function teacherFilterSummary(filter: TeacherFilter): string | null {
  const name = filter.name.trim();
  const permissionLabels = filter.permissions.map((permission) => PERMISSION_LABELS[permission]);

  const parts = [
    ...(name === "" ? [] : [`Name: ${name}`]),
    ...(permissionLabels.length === 0 ? [] : [permissionLabels.join(", ")]),
    ...(filter.withoutPermissions ? [NO_PERMISSIONS_LABEL] : []),
    ...(filter.logins === null ? [] : [LOGIN_FILTER_LABELS[filter.logins]]),
  ];

  return parts.length === 0 ? null : parts.join(" \u00b7 ");
}
