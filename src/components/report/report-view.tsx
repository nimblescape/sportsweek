/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import { useBusyWhile } from "@/lib/api/busy";
import { useSeasonRoster } from "@/lib/assignment/use-season-roster";
import { EMPTY_FILTER, filterStudents, type StudentFilter } from "@/lib/filters/student-filter";
import { reportFieldsOf } from "@/lib/report/report-fields";
import { POPUP_BLOCKED_HINT, printableReportHtml } from "@/lib/report/printable-report";
import { useSavedFilters } from "@/lib/report/use-saved-filters";
import { NO_ACTIVE_SEASON_HINT } from "@/lib/seasons/season-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterTagList } from "@/components/filters/filter-tag-list";
import { FieldTagList } from "./field-tag-list";
import { ReportList } from "./report-list";
import { SavedFilterPicker } from "./saved-filter-picker";

const FILTER_LABEL = "Bericht";

const filterUrl = (id: string) => `/api/report-filters/${encodeURIComponent(id)}`;

/**
 * The student report of US-13, scoped to the active season and listing everyone registered for
 * it — including the students who answered "no", which is what sets it apart from the assignment
 * dialog and is why its filter carries categories the board has no use for.
 */
export function ReportView() {
  const { season, loading, error, students, events, filterGroups } = useSeasonRoster({
    attendance: true,
    completeness: true,
    events: true,
  });
  const { filters: savedFilters } = useSavedFilters();
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [activeFields, setActiveFields] = useState<string[]>([]);
  const [printError, setPrintError] = useState<string | null>(null);

  // Answered by the one spinner in the header, so this view places none of its own.
  useBusyWhile(loading);

  const shown = useMemo(() => filterStudents(students, filter), [students, filter]);
  const fields = useMemo(() => reportFieldsOf(activeFields), [activeFields]);
  // A record points at its event by id, so the detail line needs the season's events to name it.
  const context = useMemo(
    () => ({ eventNames: new Map(events.map((event) => [event.id, event.name])) }),
    [events],
  );

  // Writes go through handlers because the author is the session's, not the request's (US-13);
  // the list itself comes back from the subscription rather than from these answers.
  async function saveFilter(name: string, selection: StudentFilter) {
    await apiRequest("/api/report-filters", { method: "POST", body: { name, filter: selection } });
  }

  async function renameFilter(id: string, name: string) {
    await apiRequest(filterUrl(id), { method: "PATCH", body: { name } });
  }

  async function deleteFilter(id: string) {
    await apiRequest(filterUrl(id), { method: "DELETE" });
  }

  /**
   * The document is written into the window rather than fetched from a URL: a class full of
   * contact details has no business in an address bar, a history entry or a server log.
   */
  function print() {
    const popup = window.open("", "_blank");
    if (!popup) {
      setPrintError(POPUP_BLOCKED_HINT);
      return;
    }

    setPrintError(null);
    const heading = season === null ? "Bericht" : `Bericht – Saison ${season.name}`;
    popup.document.open();
    popup.document.write(printableReportHtml(shown, fields, { heading, context }));
    popup.document.close();
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-lg font-semibold">Bericht</h1>
        <Button type="button" variant="outline" onClick={print} disabled={season === null}>
          <Printer aria-hidden data-icon="inline-start" />
          Drucken
        </Button>
      </div>

      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {printError !== null && (
        <p role="alert" className="text-destructive text-sm">
          {printError}
        </p>
      )}

      {season === null ? (
        <p role="status" className="text-muted-foreground text-sm">
          {NO_ACTIVE_SEASON_HINT}
        </p>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-3">
              <SavedFilterPicker
                filters={savedFilters}
                current={filter}
                onApply={setFilter}
                onSave={saveFilter}
                onRename={renameFilter}
                onDelete={deleteFilter}
              />
              <FilterTagList
                label={FILTER_LABEL}
                groups={filterGroups}
                value={filter}
                onChange={setFilter}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <FieldTagList value={activeFields} onChange={setActiveFields} />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <ReportList students={shown} fields={fields} context={context} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
