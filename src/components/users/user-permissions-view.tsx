/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import { useRowAction } from "@/lib/api/use-row-action";
import { Breadcrumb } from "@/components/layout/breadcrumb";
import { FilterNameField } from "@/components/filters/filter-name-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tag, TagName } from "@/components/ui/tag";
import { MasterDataReport } from "@/components/master-data/master-data-report";
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  toggledPermissions,
  type Permission,
} from "@/lib/auth/permissions";
import { useEventSeries } from "@/lib/event-series/use-event-series";
import { asUid } from "@/lib/schemas/common";
import type { EventSeries } from "@/lib/schemas/event-series";
import {
  EMPTY_TEACHER_FILTER,
  LOGIN_FILTER_LABELS,
  LOGIN_FILTER_VALUES,
  NO_PERMISSIONS_LABEL,
  clearPermissionTags,
  filterTeachers,
  hasNoFilter,
  teacherFilterSummary,
  toggleLoginFilter,
  togglePermissionTag,
  toggleWithoutPermissions,
} from "@/lib/users/teacher-filter";
import { classAssignmentsOf } from "@/lib/users/teacher-class-assignments";
import { LOGIN_HISTORY_LABEL, rightsReport } from "@/lib/users/rights-report";
import { useRecentLogins } from "@/lib/users/use-recent-logins";
import { useTeachers, type Teacher } from "@/lib/users/use-teachers";

export const RIGHTS_REPORT_LABEL = "Benutzerbericht";

export const FILTER_LABEL = "Benutzerrechte";

export const NONE_MATCHING_HINT = "Zu diesem Filter passt keine Lehrperson.";

export const OWN_GRANT_HINT =
  "Das Recht, Benutzerrechte zu vergeben, kannst du dir nicht selbst entziehen.";

export { LOGIN_HISTORY_LABEL, NO_PERMISSIONS_LABEL };

export const NO_LOGINS_HINT = "Noch nie angemeldet.";

const LOADING_LABEL = "Benutzerrechte werden geladen \u2026";

const NO_TEACHERS_HINT = "Es hat sich noch keine Lehrperson angemeldet.";

/** First name first; the list is still sorted surname-first, independent of the display order. */
const nameOf = (teacher: Teacher) => `${teacher.firstName} ${teacher.lastName}`;

/**
 * Who may do what (US-2). One row per teacher, and a tag per permission — pressed for what they
 * hold, so the row answers "what may this person do" by being looked at.
 *
 * A press sends the whole set rather than the one tag, because what a press means is the
 * dependency rule's to decide and that rule lives in one place: pressing "Berichte bearbeiten"
 * presses "Berichte ansehen" with it, and releasing the latter releases the former.
 */
export function UserPermissionsView({ signedInUid }: { signedInUid: string }) {
  const { teachers, loading, error } = useTeachers();
  const { eventSeries } = useEventSeries();
  const logins = useRecentLogins(teachers);
  const [failure, setFailure] = useState<string | null>(null);
  const { busyId, run } = useRowAction();
  const router = useRouter();
  const [filter, setFilter] = useState(EMPTY_TEACHER_FILTER);
  const [showingReport, setShowingReport] = useState(false);

  const shown = filterTeachers(teachers, filter, logins);
  const provenance = teacherFilterSummary(filter);

  async function grant(teacher: Teacher, permission: Permission) {
    const permissions = toggledPermissions(teacher.permissions, permission);
    setFailure(null);

    await run(teacher.uid, async () => {
      try {
        await apiRequest("/api/users", {
          method: "PATCH",
          body: { uid: teacher.uid, permissions },
        });
        // The navigation bar comes from a server layout above this page, which does not run
        // again on its own — so what you may reach would go on saying what it said before.
        if (teacher.uid === signedInUid) router.refresh();
      } catch (thrown) {
        setFailure(thrown instanceof Error ? thrown.message : "Das hat leider nicht geklappt.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Nothing sits above the rights page, so its path is the one step it is (US-33). */}
      <Breadcrumb
        trail={[{ label: "Benutzerrechte", href: "/app/users" }]}
        actions={
          teachers.length === 0 ? undefined : (
            <Button
              variant={showingReport ? "default" : "outline"}
              aria-pressed={showingReport}
              onClick={() => setShowingReport(!showingReport)}
            >
              <FileText aria-hidden data-icon="inline-start" />
              {RIGHTS_REPORT_LABEL}
            </Button>
          )
        }
      />

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

      {showingReport ? (
        <>
          {/* What is shown is what the filter row above left standing (Q5) — silent when
              nothing narrows it, since a report of everybody has nothing to say about itself. */}
          {provenance === null ? null : (
            <p className="text-muted-foreground text-sm">{provenance}</p>
          )}
          <MasterDataReport sections={rightsReport(shown, eventSeries, logins)} />
        </>
      ) : (
        <>
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
                  {/* Last, because it is not one of them: it asks who is waiting for access. */}
                  <Tag pressed={filter.withoutPermissions}>
                    <TagName
                      label={`${FILTER_LABEL}: ${NO_PERMISSIONS_LABEL}`}
                      text={NO_PERMISSIONS_LABEL}
                      onPress={() => setFilter(toggleWithoutPermissions(filter))}
                    />
                  </Tag>
                </div>

                {/* Its own row (US-48): a different question from what a teacher may do. */}
                <div
                  role="group"
                  aria-label={`${FILTER_LABEL}: ${LOGIN_HISTORY_LABEL}`}
                  className="flex flex-wrap gap-1.5"
                >
                  {Object.values(LOGIN_FILTER_VALUES).map((value) => (
                    <Tag key={value} pressed={filter.logins === value}>
                      <TagName
                        label={`${FILTER_LABEL}: ${LOGIN_FILTER_LABELS[value]}`}
                        text={LOGIN_FILTER_LABELS[value]}
                        onPress={() => setFilter(toggleLoginFilter(filter, value))}
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
              <li key={teacher.uid}>
                <Card size="sm">
                  <CardContent className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{nameOf(teacher)}</span>
                      <span className="text-muted-foreground text-sm">{teacher.email}</span>
                      {teacher.permissions.length === 0 ? (
                        <span className="text-muted-foreground text-sm">
                          {NO_PERMISSIONS_LABEL}
                        </span>
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
                          fixed={permission === "editUsers" && teacher.uid === signedInUid}
                          disabled={busyId === teacher.uid}
                          onPress={() => grant(teacher, permission)}
                        />
                      ))}
                    </div>

                    <ClassAssignments teacher={teacher} eventSeries={eventSeries} />
                    <RecentLogins history={logins.get(teacher.uid)} />
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
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

/**
 * Which classes this teacher looks after, read-only (US-41): assignments are edited on the class
 * itself, so this line offers nothing to press, only names what is already true.
 */
function ClassAssignments({
  teacher,
  eventSeries,
}: {
  teacher: Teacher;
  eventSeries: readonly EventSeries[];
}) {
  const assignments = classAssignmentsOf(eventSeries, asUid(teacher.uid));
  if (assignments.length === 0) return null;

  return (
    <p className="text-muted-foreground text-sm">
      {assignments
        .map((assignment) => `${assignment.eventSeriesName}: ${assignment.className}`)
        .join(", ")}
    </p>
  );
}

/**
 * When somebody was last here (US-47): a line beside the permissions rather than a report of
 * its own, so an account nobody has ever used reads differently from one used daily.
 *
 * `undefined` means the read has not settled yet or was refused -- this renders nothing then,
 * so the rest of the card is what it always was. An empty array is a fact, not an absence, and
 * says so.
 */
function RecentLogins({ history }: { history: readonly string[] | undefined }) {
  if (history === undefined) return null;

  return (
    <p className="text-muted-foreground text-sm">
      {LOGIN_HISTORY_LABEL}: {history.length === 0 ? NO_LOGINS_HINT : history.join(", ")}
    </p>
  );
}
