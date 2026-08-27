/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
"use client";

import { useMemo, useState } from "react";
import { FileDown, FileSpreadsheet, Printer } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import { useBusyWhile } from "@/lib/api/busy";
import { useSeasonRoster } from "@/lib/assignment/use-season-roster";
import { EMPTY_FILTER, filterStudents } from "@/lib/filters/student-filter";
import { reportFieldsOf } from "@/lib/report/report-fields";
import { POPUP_BLOCKED_HINT, printableReportHtml } from "@/lib/report/printable-report";
import {
  downloadReportPdf,
  downloadReportWorkbook,
  EXPORT_FAILED_HINT,
  type ReportExport,
} from "@/lib/report/report-download";
import { matchingSavedReport } from "@/lib/report/saved-reports";
import { useSavedReports } from "@/lib/report/use-saved-reports";
import { NO_ACTIVE_SEASON_HINT } from "@/lib/seasons/season-state";
import type { ReportSelection } from "@/lib/schemas/saved-report";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FilterTagList } from "@/components/filters/filter-tag-list";
import { FieldTagList } from "./field-tag-list";
import { ReportList } from "./report-list";
import { SavedReportTagList } from "./saved-report-tag-list";

const FILTER_LABEL = "Bericht";

const reportUrl = (id: string) => `/api/saved-reports/${encodeURIComponent(id)}`;

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
  const { reports: savedReports } = useSavedReports();
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const [activeFields, setActiveFields] = useState<string[]>([]);
  const [outputError, setOutputError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Answered by the one spinner in the header, so this view places none of its own.
  useBusyWhile(loading || exporting);

  const shown = useMemo(() => filterStudents(students, filter), [students, filter]);
  const fields = useMemo(() => reportFieldsOf(activeFields), [activeFields]);
  // What a saved report holds, and so what one is compared against and what a save keeps.
  const selection = useMemo<ReportSelection>(
    () => ({ filter, fields: activeFields }),
    [filter, activeFields],
  );
  // A record points at its event by id, so the detail line needs the season's events to name it.
  const context = useMemo(
    () => ({ eventNames: new Map(events.map((event) => [event.id, event.name])) }),
    [events],
  );

  function openReport(saved: ReportSelection) {
    setFilter(saved.filter);
    setActiveFields([...saved.fields]);
  }

  // Writes go through handlers because the author is the session's, not the request's (US-13);
  // the list itself comes back from the subscription rather than from these answers.
  async function saveReport(name: string, saved: ReportSelection) {
    await apiRequest("/api/saved-reports", { method: "POST", body: { name, ...saved } });
  }

  async function renameReport(id: string, name: string) {
    await apiRequest(reportUrl(id), { method: "PATCH", body: { name } });
  }

  async function deleteReport(id: string) {
    await apiRequest(reportUrl(id), { method: "DELETE" });
  }

  /**
   * The document is written into the window rather than fetched from a URL: a class full of
   * contact details has no business in an address bar, a history entry or a server log.
   */
  function print() {
    const popup = window.open("", "_blank");
    if (!popup) {
      setOutputError(POPUP_BLOCKED_HINT);
      return;
    }

    setOutputError(null);
    const heading = season === null ? "Bericht" : `Bericht – Saison ${season.name}`;
    popup.document.open();
    popup.document.write(printableReportHtml(shown, fields, { heading, context }));
    popup.document.close();
  }

  /**
   * The saved report the page currently is, asked of the same module the tag row asks, so the
   * file a teacher receives is named after the tag the row shows as pressed.
   */
  const savedReportName = matchingSavedReport(savedReports, selection)?.name ?? null;

  async function exportReport(download: (report: ReportExport) => Promise<void>) {
    setExporting(true);
    setOutputError(null);
    try {
      await download({
        students: shown,
        fields,
        context,
        provenance: { reportName: savedReportName, exportedAt: new Date() },
      });
    } catch {
      setOutputError(EXPORT_FAILED_HINT);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-lg font-semibold">Bericht</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={print} disabled={season === null}>
            <Printer aria-hidden data-icon="inline-start" />
            Drucken
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => exportReport(downloadReportPdf)}
            disabled={season === null || exporting}
          >
            <FileDown aria-hidden data-icon="inline-start" />
            PDF exportieren
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => exportReport(downloadReportWorkbook)}
            disabled={season === null || exporting}
          >
            <FileSpreadsheet aria-hidden data-icon="inline-start" />
            Excel exportieren
          </Button>
        </div>
      </div>

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

      {season === null ? (
        <p role="status" className="text-muted-foreground text-sm">
          {NO_ACTIVE_SEASON_HINT}
        </p>
      ) : (
        <>
          <Card>
            <CardContent>
              <SavedReportTagList
                reports={savedReports}
                current={selection}
                onOpen={openReport}
                onSave={saveReport}
                onRename={renameReport}
                onDelete={deleteReport}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent>
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
