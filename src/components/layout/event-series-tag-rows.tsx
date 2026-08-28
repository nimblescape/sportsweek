/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { usePathname, useRouter } from "next/navigation";
import { DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEventSeries } from "@/lib/event-series/use-event-series";
import {
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

type RowProps = {
  label: string;
  eventSeries: EventSeries[];
  selectedId: string | null;
  /** Accent for a series, grey for a template — both already in the base palette (Q21). */
  variant: "default" | "secondary";
  onSelect: (id: string) => void;
};

function TagRow({ label, eventSeries, selectedId, variant, onSelect }: RowProps) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      {eventSeries.map((one) => {
        const pressed = one.id === selectedId;
        return (
          <Button
            key={one.id}
            type="button"
            size="sm"
            variant={pressed ? variant : "outline"}
            aria-pressed={pressed}
            onClick={() => onSelect(one.id)}
          >
            {one.isOpenToStudents ? (
              <DoorOpen aria-label={OPEN_TO_STUDENTS_LABEL} className="size-4 shrink-0" />
            ) : null}
            {one.name}
          </Button>
        );
      })}
    </div>
  );
}

/**
 * Which event series a teacher is working in (US-20). Two rows: the series that carry data above,
 * the templates below — and exactly one tag is pressed across both, because exactly one thing is
 * scoped. Archived series are in neither, which is what makes archiving the thing that takes a
 * series off every screen (US-19).
 *
 * A row wraps rather than scrolling sideways, so a school with many of either can still see them
 * all, and each carries its own name because colour alone does not say which row a tag is in.
 */
export function EventSeriesTagRows() {
  const { eventSeries } = useEventSeries();
  const pathname = usePathname();
  const router = useRouter();
  const selectedId = selectedEventSeriesIdFrom(pathname);

  const live = eventSeries.filter((one) => !one.isArchived);
  const series = live.filter((one) => !one.isTemplate);
  const templates = live.filter((one) => one.isTemplate);

  function select(id: string) {
    rememberEventSeries(id);
    router.push(rescopedPath(pathname, id));
  }

  if (live.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <TagRow
        label={EVENT_SERIES_ROW_LABEL}
        eventSeries={series}
        selectedId={selectedId}
        variant="default"
        onSelect={select}
      />
      {/* Absent rather than empty, so a school that never makes a template never sees a space
          set aside for one. */}
      {templates.length === 0 ? null : (
        <TagRow
          label={TEMPLATE_ROW_LABEL}
          eventSeries={templates}
          selectedId={selectedId}
          variant="secondary"
          onSelect={select}
        />
      )}
    </div>
  );
}
