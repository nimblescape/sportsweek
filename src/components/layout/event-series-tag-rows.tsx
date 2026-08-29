/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { DoorClosed, DoorOpen, LayoutTemplate, LogIn, LogOut } from "lucide-react";
import { Tag, TagAction, TagName, type TagVariant } from "@/components/ui/tag";
import { ApiRequestError, apiRequest } from "@/lib/api/client";
import { useBusyWhile } from "@/lib/api/busy";
import { useEventSeries } from "@/lib/event-series/use-event-series";
import {
  isMasterDataPath,
  rememberEventSeries,
  rescopedPath,
  selectedEventSeriesIdFrom,
} from "@/lib/event-series/event-series-selection";
import { EVENT_SERIES_STATE_LABELS } from "@/lib/event-series/event-series-state";
import type { EventSeries } from "@/lib/schemas/event-series";

export const EVENT_SERIES_ROW_LABEL = "Eventreihen";
export const TEMPLATE_ROW_LABEL = "Vorlagen";

/** Said on the icon a tag carries while its series is taking registrations (US-19, US-20). */
export const OPEN_TO_STUDENTS_LABEL = EVENT_SERIES_STATE_LABELS.open;
export const CLOSED_TO_STUDENTS_LABEL = EVENT_SERIES_STATE_LABELS.closed;
export const TEMPLATE_LABEL = EVENT_SERIES_STATE_LABELS.template;

/** What a tag is, in one icon: a template, or a series with its door open or shut. */
function StateIcon({ eventSeries }: { eventSeries: EventSeries }) {
  if (eventSeries.isTemplate) {
    return <LayoutTemplate aria-label={TEMPLATE_LABEL} className="size-4 shrink-0" />;
  }
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

/**
 * What the fill of a pressed tag says. Green is the series taking registrations, which is what a
 * teacher scans the row for; blue is simply the one being worked in; grey is a template, which is
 * neither and cannot become either.
 */
function fillFor(one: EventSeries): TagVariant {
  if (one.isTemplate) return "template";
  return one.isOpenToStudents ? "open" : "series";
}

function TagRow({ label, eventSeries, selectedId, onSelect, onSetOpen, pending }: RowProps) {
  return (
    // `contents` rather than a box of its own: two boxes cannot share a line once the first one
    // fills it, so the templates would drop below the series instead of following them. The
    // group survives in the accessibility tree, which is where it is doing its work.
    <div role="group" aria-label={label} className="contents">
      {eventSeries.map((one) => {
        const pressed = one.id === selectedId;
        return (
          <Tag key={one.id} pressed={pressed} variant={fillFor(one)} disabled={pending}>
            <StateIcon eventSeries={one} />
            <TagName label={one.name} onPress={() => onSelect(one)} />
            {/* Only on the tag that is selected, so a press cannot land on another series, and
                never on a template, which can never be opened (US-19, US-22). */}
            {pressed && !one.isTemplate ? (
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
 * (US-19, US-29). One row: the series that carry data first, the templates after them — and
 * exactly one tag is pressed across both, because exactly one thing is scoped. Archived series
 * are in neither, which is what makes archiving the thing that takes a series off every screen.
 *
 * Opening and closing lives on the tag rather than on a page, because the tag names the series
 * it concerns and is on screen wherever the teacher happens to be. There is no second control
 * for it anywhere: two controls for one decision would be two answers to it.
 *
 * It wraps rather than scrolling sideways, so a school with many of either can still see them
 * all, and each group carries its own name because colour alone does not say which is which.
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
  const series = live.filter((one) => !one.isTemplate);
  // A template holds lists and no registrations, so it has nothing an overview, an assignment or
  // a report could show. Only where the lists are maintained is it worth offering (US-22).
  const templates = isMasterDataPath(pathname) ? live.filter((one) => one.isTemplate) : [];

  function select(one: EventSeries) {
    rememberEventSeries(one.id);
    router.push(rescopedPath(pathname, one.id, one.isTemplate));
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

  const rowProps = { selectedId, onSelect: select, onSetOpen: setOpenToStudents, pending: saving };

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <TagRow label={EVENT_SERIES_ROW_LABEL} eventSeries={series} {...rowProps} />
        {/* Absent rather than empty, so a school that never makes a template never sees a space
            set aside for one. */}
        {templates.length === 0 ? null : (
          <TagRow label={TEMPLATE_ROW_LABEL} eventSeries={templates} {...rowProps} />
        )}
      </div>

      {/* The press happened here, so the refusal is answered here (US-19). */}
      {actionError === null ? null : (
        <p role="alert" className="text-destructive text-sm">
          {actionError}
        </p>
      )}
    </div>
  );
}
