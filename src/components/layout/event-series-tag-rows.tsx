/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DoorClosed, DoorOpen, LogIn, LogOut } from "lucide-react";
import { Tag, TagAction, TagName } from "@/components/ui/tag";
import { ApiRequestError, apiRequest } from "@/lib/api/client";
import { useBusyWhile } from "@/lib/api/busy";
import { useEventSeries } from "@/lib/event-series/use-event-series";
import {
  rememberEventSeries,
  rescopedPath,
  selectedEventSeriesIdFrom,
} from "@/lib/event-series/event-series-selection";
import { EVENT_SERIES_STATE_LABELS } from "@/lib/event-series/event-series-state";
import type { EventSeries } from "@/lib/schemas/event-series";

export const EVENT_SERIES_ROW_LABEL = "Eventreihen";

/** Said on the icon a tag carries while its series is taking registrations (US-19, US-20). */
export const OPEN_TO_STUDENTS_LABEL = EVENT_SERIES_STATE_LABELS.open;
export const CLOSED_TO_STUDENTS_LABEL = EVENT_SERIES_STATE_LABELS.closed;

/** What a tag is, in one icon: a series with its door open or shut. */
function StateIcon({ eventSeries }: { eventSeries: EventSeries }) {
  return eventSeries.isOpenToStudents ? (
    <DoorOpen aria-label={OPEN_TO_STUDENTS_LABEL} className="size-4 shrink-0" />
  ) : (
    <DoorClosed aria-label={CLOSED_TO_STUDENTS_LABEL} className="size-4 shrink-0" />
  );
}

type RowProps = {
  label: string;
  eventSeries: EventSeries[];
  selectedId: string | null;
  onSelect: (eventSeries: EventSeries) => void;
  onSetOpen: (eventSeries: EventSeries, isOpenToStudents: boolean) => void;
  pending: boolean;
};

export const openActionLabel = (name: string) => `${name} für Schüler:innen öffnen`;
export const closeActionLabel = (name: string) => `${name} für Schüler:innen schließen`;

function TagRow({ label, eventSeries, selectedId, onSelect, onSetOpen, pending }: RowProps) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      {eventSeries.map((one) => {
        const pressed = one.id === selectedId;
        return (
          <Tag key={one.id} pressed={pressed} disabled={pending}>
            <StateIcon eventSeries={one} />
            <TagName label={one.name} onPress={() => onSelect(one)} />
            {/* Only on the tag that is selected, so a press cannot land on another series. */}
            {pressed ? (
              <TagAction
                label={(one.isOpenToStudents ? closeActionLabel : openActionLabel)(one.name)}
                onClick={() => onSetOpen(one, !one.isOpenToStudents)}
              >
                {one.isOpenToStudents ? <LogOut aria-hidden /> : <LogIn aria-hidden />}
              </TagAction>
            ) : null}
          </Tag>
        );
      })}
    </div>
  );
}

/**
 * Which event series a teacher is working in (US-20), and whether it is taking registrations
 * (US-19, US-29). One row, one tag pressed, because exactly one thing is scoped. Archived series
 * are absent, which is what makes archiving the thing that takes a series off every screen.
 *
 * Opening and closing lives on the tag rather than on a page, because the tag names the series
 * it concerns and is on screen wherever the teacher happens to be. There is no second control
 * for it anywhere: two controls for one decision would be two answers to it.
 *
 * It wraps rather than scrolling sideways, so a school with many can still see them all.
 */
export function EventSeriesTagRows() {
  const { eventSeries } = useEventSeries();
  const pathname = usePathname();
  const router = useRouter();
  const selectedId = selectedEventSeriesIdFrom(pathname);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useBusyWhile(saving);

  const live = eventSeries.filter((one) => !one.isArchived);

  function select(one: EventSeries) {
    rememberEventSeries(one.id);
    router.push(rescopedPath(pathname, one.id));
  }

  async function setOpenToStudents(one: EventSeries, isOpenToStudents: boolean) {
    setActionError(null);
    setSaving(true);
    try {
      await apiRequest(`/api/event-series/${one.id}`, {
        method: "PATCH",
        body: { isOpenToStudents },
      });
    } catch (caught) {
      setActionError(
        caught instanceof ApiRequestError ? caught.message : "Das hat leider nicht geklappt.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (live.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <TagRow
        label={EVENT_SERIES_ROW_LABEL}
        eventSeries={live}
        selectedId={selectedId}
        onSelect={select}
        onSetOpen={setOpenToStudents}
        pending={saving}
      />

      {/* The press happened here, so the refusal is answered here (US-19). */}
      {actionError === null ? null : (
        <p role="alert" className="text-destructive text-sm">
          {actionError}
        </p>
      )}
    </div>
  );
}
