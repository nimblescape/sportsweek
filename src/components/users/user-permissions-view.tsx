/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api/client";
import { useRowAction } from "@/lib/api/use-row-action";
import { PageHeading } from "@/components/layout/page-heading";
import { FilterNameField } from "@/components/filters/filter-name-field";
import { Card, CardContent } from "@/components/ui/card";
import { Tag, TagName } from "@/components/ui/tag";
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  toggledPermissions,
  type Permission,
} from "@/lib/auth/permissions";
import {
  EMPTY_TEACHER_FILTER,
  clearPermissionTags,
  filterTeachers,
  hasNoFilter,
  togglePermissionTag,
} from "@/lib/users/teacher-filter";
import { useTeachers, type Teacher } from "@/lib/users/use-teachers";

export const NO_PERMISSIONS_LABEL = "Keine Rechte";

export const FILTER_LABEL = "Benutzerrechte";

export const NONE_MATCHING_HINT = "Zu diesem Filter passt keine Lehrperson.";

export const OWN_GRANT_HINT =
  "Das Recht, Benutzerrechte zu vergeben, kannst du dir nicht selbst entziehen.";

const LOADING_LABEL = "Benutzerrechte werden geladen \u2026";

const NO_TEACHERS_HINT = "Es hat sich noch keine Lehrperson angemeldet.";

/** Surname first, matching the order the list is sorted in. */
const nameOf = (teacher: Teacher) => `${teacher.lastName} ${teacher.firstName}`;

/**
 * Who may do what (US-2). One row per teacher, and a tag per permission — pressed for what they
 * hold, so the row answers "what may this person do" by being looked at.
 *
 * A press sends the whole set rather than the one tag, because what a press means is the
 * dependency rule's to decide and that rule lives in one place: pressing "Berichte bearbeiten"
 * presses "Berichte ansehen" with it, and releasing the latter releases the former.
 */
export function UserPermissionsView({ signedInAs }: { signedInAs: string }) {
  const { teachers, loading, error } = useTeachers();
  const [failure, setFailure] = useState<string | null>(null);
  const { busyId, run } = useRowAction();
  const router = useRouter();
  const [filter, setFilter] = useState(EMPTY_TEACHER_FILTER);

  const shown = filterTeachers(teachers, filter);

  async function grant(teacher: Teacher, permission: Permission) {
    const permissions = toggledPermissions(teacher.permissions, permission);
    setFailure(null);

    await run(teacher.upn, async () => {
      try {
        await apiRequest(`/api/users/${encodeURIComponent(teacher.upn)}`, {
          method: "PATCH",
          body: { permissions },
        });
        // The navigation bar comes from a server layout above this page, which does not run
        // again on its own — so what you may reach would go on saying what it said before.
        if (teacher.upn === signedInAs) router.refresh();
      } catch (thrown) {
        setFailure(thrown instanceof Error ? thrown.message : "Das hat leider nicht geklappt.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeading>Benutzerrechte</PageHeading>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {failure ? (
        <p role="alert" className="text-destructive text-sm">
          {failure}
        </p>
      ) : null}

      {loading ? <p className="text-muted-foreground text-sm">{LOADING_LABEL}</p> : null}
      {!loading && teachers.length === 0 ? (
        <p className="text-muted-foreground text-sm">{NO_TEACHERS_HINT}</p>
      ) : null}

      {/* The row the report is filtered by (US-13), over the staff instead of the students. */}
      {teachers.length === 0 ? null : (
        <Card size="sm">
          <CardContent className="space-y-2">
            <FilterNameField
              label={FILTER_LABEL}
              value={filter.name}
              onChange={(name) => setFilter({ ...filter, name })}
            />

            <div
              role="group"
              aria-label={`${FILTER_LABEL}: Filter`}
              className="flex flex-wrap gap-1.5"
            >
              <Tag pressed={hasNoFilter(filter)}>
                <TagName
                  label={`${FILTER_LABEL}: Alle`}
                  text="Alle"
                  onPress={() => setFilter(clearPermissionTags(filter))}
                />
              </Tag>
              {PERMISSIONS.map((permission) => (
                <Tag key={permission} pressed={filter.permissions.includes(permission)}>
                  <TagName
                    label={`${FILTER_LABEL}: ${PERMISSION_LABELS[permission]}`}
                    text={PERMISSION_LABELS[permission]}
                    onPress={() => setFilter(togglePermissionTag(filter, permission))}
                  />
                </Tag>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && teachers.length > 0 && shown.length === 0 ? (
        <p className="text-muted-foreground text-sm">{NONE_MATCHING_HINT}</p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {shown.map((teacher) => (
          <li key={teacher.upn}>
            <Card size="sm">
              <CardContent className="flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{nameOf(teacher)}</span>
                  <span className="text-muted-foreground text-sm">{teacher.upn}</span>
                  {teacher.permissions.length === 0 ? (
                    <span className="text-muted-foreground text-sm">{NO_PERMISSIONS_LABEL}</span>
                  ) : null}
                </div>

                <div
                  role="group"
                  aria-label={`${nameOf(teacher)}: Rechte`}
                  className="flex flex-wrap gap-1.5"
                >
                  {PERMISSIONS.map((permission) => (
                    <PermissionTag
                      key={permission}
                      teacher={teacher}
                      permission={permission}
                      // Withdrawing this one from yourself is what would leave nobody able to
                      // grant it, so the tag states it instead of offering the press.
                      fixed={permission === "editUsers" && teacher.upn === signedInAs}
                      disabled={busyId === teacher.upn}
                      onPress={() => grant(teacher, permission)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PermissionTag({
  teacher,
  permission,
  fixed,
  disabled,
  onPress,
}: {
  teacher: Teacher;
  permission: Permission;
  fixed: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const label = PERMISSION_LABELS[permission];
  const held = teacher.permissions.includes(permission);

  if (fixed) {
    return (
      <Tag pressed={held}>
        <span className="px-1 text-sm" title={OWN_GRANT_HINT}>
          {label}
        </span>
        <span className="sr-only">{OWN_GRANT_HINT}</span>
      </Tag>
    );
  }

  return (
    <Tag pressed={held} disabled={disabled}>
      <TagName label={`${nameOf(teacher)}: ${label}`} text={label} onPress={onPress} />
    </Tag>
  );
}
