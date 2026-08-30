/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useMemo, useState } from "react";
import { FileDown, FileSpreadsheet } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import { useBusyWhile } from "@/lib/api/busy";
import { buildInfo } from "@/lib/build-info";
import { useEventSeriesRoster } from "@/lib/assignment/use-event-series-roster";
import { EMPTY_FILTER, filterStudents, filterSummary, scopeFilterToGroups } from "@/lib/filters/student-filter"; // prettier-ignore
import { fieldTagsFor, offeredFieldTags, reportFieldsOf } from "@/lib/report/report-fields";
import {
  downloadReportPdf,
  downloadReportWorkbook,
  EXPORT_FAILED_HINT,
  type ReportExport,
} from "@/lib/report/report-download";
import { matchingSavedReport } from "@/lib/report/saved-reports";
import { useSavedReports } from "@/lib/report/use-saved-reports";
import { NO_EVENT_SERIES_HINT } from "@/lib/event-series/event-series-state";
import type { ReportSelection, SavedReport, SavedReportEdit } from "@/lib/schemas/saved-report";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeading } from "@/components/layout/page-heading";
import { FilterTagList } from "@/components/filters/filter-tag-list";
import { FieldTagList } from "./field-tag-list";
import { ReportList } from "./report-list";
import { SavedReportTagList } from "./saved-report-tag-list";

const FILTER_LABEL = "Bericht";

/** Two tag rows sit under each other and decide different things, so each says which it is. */
function CardHeading({ children }: { children: string }) {
  return (
    <h2 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
      {children}
    </h2>
  );
}

/**
 * The student report of US-13, scoped to the active event series and listing everyone registered for
 * it — including the students who answered "no", which is what sets it apart from the assignment
 * dialog and is why its filter carries categories the board has no use for.
 */
export function ReportView({
  eventSeriesId,
  mayEdit = false,
}: {
  eventSeriesId: string;
  mayEdit?: boolean;
}) {
  const { eventSeries, missing, error, students, filterGroups } = useEventSeriesRoster(
    eventSeriesId,
    {
      attendance: true,
      completeness: true,
      equipmentRental: true,
      health: true,
      answerLists: true,
      events: true,
    },
  );
  const { reports: savedReports } = useSavedReports(eventSeriesId, eventSeries);
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [activeFields, setActiveFields] = useState<string[]>([]);
  const [outputError, setOutputError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Answered by the one spinner in the header, so this view places none of its own. The read is
  // not reported: a teacher moving between the pages of a series has started nothing to wait for.
  useBusyWhile(exporting);

  const shown = useMemo(() => filterStudents(students, filter), [students, filter]);
  const fields = useMemo(() => reportFieldsOf(activeFields), [activeFields]);
  // What a saved report holds, and so what one is compared against and what a save keeps.
  const selection = useMemo<ReportSelection>(
    () => ({ filter, fields: activeFields }),
    [filter, activeFields],
  );

  const offeredTags = useMemo(
    () => (eventSeries === null ? [] : fieldTagsFor(eventSeries)),
    [eventSeries],
  );

  function openReport(saved: ReportSelection) {
    // What the lists no longer offer is dropped rather than silently restricting the report to
    // nobody: a class renamed since the report was saved is a tag nothing can show or unpress,
    // and a list emptied since is a field that would print "keine Angabe" for everybody (US-21).
    setFilter(scopeFilterToGroups(saved.filter, filterGroups));
    setActiveFields(offeredFieldTags(saved.fields, offeredTags));
  }

  // Writes go through handlers because the author is the session's, not the request's (US-13);
  // the list itself comes back from the subscription rather than from these answers.
  const row = `/api/event-series/${encodeURIComponent(eventSeriesId)}/saved-reports`;
  const reportUrl = (id: string) => `${row}/${encodeURIComponent(id)}`;

  async function saveReport(name: string, saved: ReportSelection) {
    const answer = await apiRequest<{ report: SavedReport }>(row, {
      method: "POST",
      body: { name, ...saved },
    });
    return answer?.report.id ?? null;
  }

  // One PATCH for both controls: renaming a tag stores the report it holds, not its name alone.
  async function editReport(id: string, edit: SavedReportEdit) {
    await apiRequest(reportUrl(id), { method: "PATCH", body: edit });
  }

  async function deleteReport(id: string) {
    await apiRequest(reportUrl(id), { method: "DELETE" });
  }

  async function reorderReports(order: string[]) {
    await apiRequest(row, { method: "PATCH", body: { order } });
  }

  /**
   * The saved report the page currently is, asked of the same module the tag row asks, so the
   * file a teacher receives is named after a report it really holds rather than one it resembles.
   */
  const savedReportName = matchingSavedReport(savedReports, selection)?.name ?? null;

  // What the copy says it holds where no saved report names it, and beside that name where one does.
  const filterDescription = useMemo(
    () => filterSummary(filter, filterGroups),
    [filter, filterGroups],
  );

  async function exportReport(download: (report: ReportExport) => Promise<void>) {
    setExporting(true);
    setOutputError(null);
    try {
      await download({
        students: shown,
        fields,
        provenance: {
          reportName: savedReportName,
          filterSummary: filterDescription,
          exportedAt: new Date(),
          build: buildInfo(),
        },
      });
    } catch {
      setOutputError(EXPORT_FAILED_HINT);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <PageHeading
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => exportReport(downloadReportPdf)}
              disabled={eventSeries === null || exporting}
            >
              <FileDown aria-hidden data-icon="inline-start" />
              PDF
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => exportReport(downloadReportWorkbook)}
              disabled={eventSeries === null || exporting}
            >
              <FileSpreadsheet aria-hidden data-icon="inline-start" />
              Excel
            </Button>
          </div>
        }
      >
        Bericht
      </PageHeading>

      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {outputError !== null && (
        <p role="alert" className="text-destructive text-sm">
          {outputError}
        </p>
      )}

      {eventSeries === null ? (
        missing ? (
          <p role="status" className="text-muted-foreground text-sm">
            {NO_EVENT_SERIES_HINT}
          </p>
        ) : null
      ) : (
        <>
          <Card>
            <CardContent>
              <SavedReportTagList
                reports={savedReports}
                current={selection}
                mayEdit={mayEdit}
                onOpen={openReport}
                onSave={saveReport}
                onUpdate={editReport}
                onRename={editReport}
                onDelete={deleteReport}
                onReorder={reorderReports}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <CardHeading>Filter</CardHeading>
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
              <CardHeading>Datenfelder</CardHeading>
              <FieldTagList tags={offeredTags} value={activeFields} onChange={setActiveFields} />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <ReportList students={shown} fields={fields} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
