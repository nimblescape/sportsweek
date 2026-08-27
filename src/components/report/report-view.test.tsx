/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_FILTER, toggleTag } from "@/lib/filters/student-filter";
import type { RosterStudent } from "@/lib/students/roster";
import { rosterStudent } from "@/test/roster-student";

const useSeasons = vi.fn();
const useRoster = vi.fn();
const useEvents = vi.fn();
const useMasterData = vi.fn();
const usePrograms = vi.fn();
const useSavedReports = vi.fn();
const apiRequest = vi.fn();
const downloadReportPdf = vi.fn();
const downloadReportWorkbook = vi.fn();

vi.mock("@/lib/seasons/use-seasons", () => ({ useSeasons: () => useSeasons() }));
vi.mock("@/lib/students/use-roster", () => ({ useRoster: (id: string | null) => useRoster(id) }));
vi.mock("@/lib/events/use-events", () => ({ useEvents: (id: string) => useEvents(id) }));
vi.mock("@/lib/master-data/use-master-data", () => ({
  useMasterData: (key: string) => useMasterData(key),
  usePrograms: () => usePrograms(),
}));
vi.mock("@/lib/report/use-saved-reports", () => ({ useSavedReports: () => useSavedReports() }));
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
vi.mock("@/lib/api/busy", () => ({ useBusyWhile: () => {}, useHold: () => () => () => {} }));
vi.mock("@/lib/report/report-download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/report/report-download")>()),
  downloadReportPdf: (report: unknown) => downloadReportPdf(report),
  downloadReportWorkbook: (report: unknown) => downloadReportWorkbook(report),
}));

const { ReportView } = await import("./report-view");

function student(
  firstName: string,
  lastName: string,
  overrides: Partial<Omit<RosterStudent, "record">> = {},
): RosterStudent {
  return rosterStudent({
    id: `record-${lastName}`,
    userId: `${lastName.toLowerCase()}@student.htldornbirn.at`,
    email: `${lastName.toLowerCase()}@student.htldornbirn.at`,
    firstName,
    lastName,
    ...overrides,
  });
}

const ANNA = student("Anna", "Muster");
const BENE = student("Bene", "Berger", { isAttending: false, class: "5BHIF" });

const season = {
  id: "s1",
  name: "2026",
  isActive: true,
  isArchived: false,
  hasStudentData: true,
  position: 0,
};

const listOf = (...names: string[]) => ({
  items: names.map((name, position) => ({ id: name, name, position })),
  loading: false,
  error: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  useSeasons.mockReturnValue({ seasons: [season], loading: false, error: null });
  useRoster.mockReturnValue({ students: [BENE, ANNA], loading: false, error: null });
  useEvents.mockReturnValue({
    events: [{ id: "event1", seasonId: "s1", name: "Woche 1", position: 0 }],
    loading: false,
    error: null,
  });
  useMasterData.mockImplementation((key: string) =>
    key === "classes" ? listOf("5AHIF", "5BHIF") : listOf("Profi"),
  );
  usePrograms.mockReturnValue({
    programs: [{ id: "p1", name: "Ski", position: 0, requiredEquipment: [] }],
    loading: false,
    error: null,
  });
  useSavedReports.mockReturnValue({ reports: [], loading: false, error: null });
  apiRequest.mockResolvedValue(null);
  downloadReportPdf.mockResolvedValue(undefined);
  downloadReportWorkbook.mockResolvedValue(undefined);
});

const rows = () => within(screen.getByRole("list", { name: "Schüler:innen" })).getAllByRole("listitem"); // prettier-ignore
const rowOf = (lastName: string) =>
  rows().find((row) => row.textContent?.includes(lastName)) as HTMLElement;

describe("ReportView", () => {
  it("says so while no season is active, since there is nobody to report on", () => {
    useSeasons.mockReturnValue({ seasons: [], loading: false, error: null });

    render(<ReportView />);

    expect(screen.getByText("Es ist keine Saison aktiv.")).toBeInTheDocument();
  });

  it("lists everyone registered, including the students who stay at home (US-13)", () => {
    render(<ReportView />);

    expect(rows()).toHaveLength(2);
    expect(rowOf("Berger")).toBeInTheDocument();
  });

  it("names each student on one master line, with the e-mail address in parentheses", () => {
    render(<ReportView />);

    const row = within(rowOf("Muster"));
    expect(row.getByText("Anna Muster")).toBeInTheDocument();
    expect(row.getByText("(muster@student.htldornbirn.at)")).toBeInTheDocument();
  });

  it("reduces a student to their master line while no field is activated", () => {
    render(<ReportView />);

    expect(within(rowOf("Muster")).queryAllByRole("term")).toHaveLength(0);
  });

  it("marks a registration that is still missing answers, so a teacher knows whom to chase", () => {
    const incomplete = rosterStudent(
      { id: "record-Cerny", firstName: "Clara", lastName: "Cerny" },
      { isIncomplete: true },
    );
    useRoster.mockReturnValue({ students: [incomplete, ANNA], loading: false, error: null });

    render(<ReportView />);

    expect(within(rowOf("Cerny")).getByText("Registrierung unvollständig")).toBeInTheDocument();
    expect(
      within(rowOf("Muster")).queryByText("Registrierung unvollständig"),
    ).not.toBeInTheDocument();
  });

  it("offers the attendance category the assignment dialog has no use for (US-13)", async () => {
    render(<ReportView />);

    await userEvent.click(screen.getByRole("button", { name: "Teilnahme: nimmt teil" }));

    expect(rows()).toHaveLength(1);
    expect(rowOf("Muster")).toBeInTheDocument();
  });

  it("filters by name the way the assignment dialog does", async () => {
    render(<ReportView />);

    await userEvent.type(screen.getByRole("textbox", { name: "Bericht: Name" }), "berg");

    expect(rows()).toHaveLength(1);
    expect(rowOf("Berger")).toBeInTheDocument();
  });

  it("filters by the event a student is assigned to", async () => {
    const assigned = student("Dora", "Dorn", { eventId: "event1" });
    useRoster.mockReturnValue({ students: [assigned, ANNA], loading: false, error: null });

    render(<ReportView />);
    await userEvent.click(screen.getByRole("button", { name: "Event: Woche 1" }));

    expect(rows()).toHaveLength(1);
    expect(rowOf("Dorn")).toBeInTheDocument();
  });

  it("filters by whether a registration is still missing answers", async () => {
    const chasing = rosterStudent(
      { id: "record-Cerny", firstName: "Clara", lastName: "Cerny", isIncomplete: true },
      { isIncomplete: true },
    );
    useRoster.mockReturnValue({ students: [chasing, ANNA], loading: false, error: null });

    render(<ReportView />);
    await userEvent.click(screen.getByRole("button", { name: "Registrierung unvollständig" }));

    expect(rows()).toHaveLength(1);
    expect(rowOf("Cerny")).toBeInTheDocument();
  });
});

const detailsOf = (lastName: string) =>
  within(rowOf(lastName))
    .queryAllByRole("term")
    .map((term) => term.textContent);

const activate = (label: string) =>
  userEvent.click(screen.getByRole("button", { name: `Feld: ${label}` }));

describe("the fields tag list", () => {
  it("adds exactly one indented detail line per student for the field it activates", async () => {
    render(<ReportView />);

    await activate("Klasse");

    expect(detailsOf("Muster")).toEqual(["Klasse:"]);
    expect(detailsOf("Berger")).toEqual(["Klasse:"]);
    expect(within(rowOf("Berger")).getByRole("definition")).toHaveTextContent("5BHIF");
  });

  it("takes the detail line away again when the field is deactivated", async () => {
    render(<ReportView />);

    await activate("Klasse");
    await activate("Klasse");

    expect(detailsOf("Muster")).toEqual([]);
  });

  it("gives a grouped tag one detail line per field in the group (US-13)", async () => {
    render(<ReportView />);

    await activate("Kontaktdaten");

    expect(detailsOf("Muster")).toEqual([
      "Telefonnummer:",
      "Notfallkontakt:",
      "Beziehung:",
      "Telefonnummer des Notfallkontakts:",
    ]);
  });

  it("adds no e-mail line, since the master line already carries the address", async () => {
    render(<ReportView />);

    await activate("Kontaktdaten");

    expect(detailsOf("Muster")).not.toContain("E-Mail");
  });

  it("says a field is unanswered rather than leaving the line blank", async () => {
    const nameless = rosterStudent(
      { id: "record-Cerny", firstName: "Clara", lastName: "Cerny" },
      { healthNotes: null },
    );
    useRoster.mockReturnValue({ students: [nameless], loading: false, error: null });

    render(<ReportView />);
    await activate("Gesundheit");

    expect(within(rowOf("Cerny")).getAllByRole("definition")[0]).toHaveTextContent("keine Angabe");
  });

  it("leaves the students shown alone, as the filter leaves the detail lines alone", async () => {
    render(<ReportView />);

    await activate("Klasse");
    expect(rows()).toHaveLength(2);

    await userEvent.click(screen.getByRole("button", { name: "Teilnahme: nimmt teil" }));
    expect(rows()).toHaveLength(1);
    expect(detailsOf("Muster")).toEqual(["Klasse:"]);
  });

  it("names the event a student is assigned to, which the record holds only by id", async () => {
    const assigned = student("Dora", "Dorn", { eventId: "event1" });
    useRoster.mockReturnValue({ students: [assigned], loading: false, error: null });

    render(<ReportView />);
    await activate("Event");

    expect(within(rowOf("Dorn")).getByRole("definition")).toHaveTextContent("Woche 1");
  });

  it("states whether a registration is still missing answers", async () => {
    render(<ReportView />);
    await activate("Registrierung");

    expect(within(rowOf("Muster")).getByRole("definition")).toHaveTextContent("Vollständig");
  });
});

describe("the saved reports", () => {
  const saved = {
    id: "r1",
    name: "Nur 5BHIF",
    createdByUserId: "jane.doe@htldornbirn.at",
    filter: toggleTag(EMPTY_FILTER, "class", "5BHIF"),
    fields: ["class"],
  };

  it("puts both selections back on screen when its tag is pressed", async () => {
    useSavedReports.mockReturnValue({ reports: [saved], loading: false, error: null });

    render(<ReportView />);
    await userEvent.click(screen.getByRole("button", { name: "Gespeicherter Bericht: Nur 5BHIF" }));

    expect(rows()).toHaveLength(1);
    expect(rowOf("Berger")).toBeInTheDocument();
    expect(within(rowOf("Berger")).getByRole("term")).toHaveTextContent("Klasse:");
  });

  it("saves the report the teacher is looking at, under the name they type", async () => {
    render(<ReportView />);

    await userEvent.click(screen.getByRole("button", { name: "Klasse: 5BHIF" }));
    await activate("Klasse");
    await userEvent.click(screen.getByRole("button", { name: "Bericht speichern" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Name des Berichts" }), "Nur 5BHIF");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(apiRequest).toHaveBeenCalledWith("/api/saved-reports", {
      method: "POST",
      body: {
        name: "Nur 5BHIF",
        filter: toggleTag(EMPTY_FILTER, "class", "5BHIF"),
        fields: ["class"],
      },
    });
  });

  it("renames and deletes through the endpoints that own those writes", async () => {
    useSavedReports.mockReturnValue({ reports: [saved], loading: false, error: null });

    render(<ReportView />);
    await userEvent.click(screen.getByRole("button", { name: "Gespeicherter Bericht: Nur 5BHIF" }));

    await userEvent.click(screen.getByRole("button", { name: "Bericht Nur 5BHIF umbenennen" }));
    const field = screen.getByRole("textbox", { name: "Name des Berichts" });
    await userEvent.clear(field);
    await userEvent.type(field, "5BHIF");
    await userEvent.click(screen.getByRole("button", { name: "Umbenennen" }));

    expect(apiRequest).toHaveBeenCalledWith("/api/saved-reports/r1", {
      method: "PATCH",
      body: { name: "5BHIF" },
    });

    await userEvent.click(screen.getByRole("button", { name: "Bericht Nur 5BHIF löschen" }));
    await userEvent.click(screen.getByRole("button", { name: "Löschen von Nur 5BHIF bestätigen" }));

    expect(apiRequest).toHaveBeenCalledWith("/api/saved-reports/r1", { method: "DELETE" });
  });

  it("brings the opened report up to date with the report as it now stands", async () => {
    useSavedReports.mockReturnValue({ reports: [saved], loading: false, error: null });

    render(<ReportView />);
    await userEvent.click(screen.getByRole("button", { name: "Gespeicherter Bericht: Nur 5BHIF" }));
    await userEvent.click(screen.getByRole("button", { name: "Klasse: 5AHIF" }));

    await userEvent.click(screen.getByRole("button", { name: "Bericht Nur 5BHIF aktualisieren" }));

    expect(apiRequest).toHaveBeenCalledWith("/api/saved-reports/r1", {
      method: "PATCH",
      body: { filter: toggleTag(saved.filter, "class", "5AHIF"), fields: ["class"] },
    });
  });

  it("marks the report it has just saved, so the controls on offer are that report's", async () => {
    const fresh = { ...saved, id: "r9", name: "Neu", filter: EMPTY_FILTER, fields: [] };
    apiRequest.mockResolvedValue({ report: fresh });
    useSavedReports.mockReturnValue({ reports: [fresh], loading: false, error: null });

    render(<ReportView />);
    await userEvent.click(screen.getByRole("button", { name: "Bericht speichern" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Name des Berichts" }), "Neu");
    await userEvent.click(screen.getByRole("button", { name: "Speichern" }));

    expect(screen.getByRole("button", { name: "Gespeicherter Bericht: Neu" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});

describe("exporting", () => {
  const pressed = (mock: typeof downloadReportPdf) => mock.mock.calls[0][0];

  it("hands the PDF the students the filter leaves and the fields that are activated", async () => {
    render(<ReportView />);
    await userEvent.click(screen.getByRole("button", { name: "Teilnahme: nimmt teil" }));
    await activate("Klasse");
    await userEvent.click(screen.getByRole("button", { name: "PDF exportieren" }));

    const report = pressed(downloadReportPdf);
    expect(report.students.map((it: RosterStudent) => it.lastName)).toEqual(["Muster"]);
    expect(report.fields.map((it: { key: string }) => it.key)).toEqual(["class"]);
  });

  it("hands the workbook the same scope the PDF gets", async () => {
    render(<ReportView />);
    await activate("Klasse");
    await userEvent.click(screen.getByRole("button", { name: "Excel exportieren" }));

    const report = pressed(downloadReportWorkbook);
    expect(report.students.map((it: RosterStudent) => it.lastName)).toEqual(["Berger", "Muster"]);
    expect(report.fields.map((it: { key: string }) => it.key)).toEqual(["class"]);
  });

  it("names the export after the saved report the page is showing", async () => {
    useSavedReports.mockReturnValue({
      reports: [{ id: "r1", createdByUserId: "t", name: "Alle", filter: EMPTY_FILTER, fields: [] }],
      loading: false,
      error: null,
    });

    render(<ReportView />);
    await userEvent.click(screen.getByRole("button", { name: "PDF exportieren" }));

    expect(pressed(downloadReportPdf).provenance.reportName).toBe("Alle");
  });

  it("leaves the export unnamed while the page matches no saved report", async () => {
    render(<ReportView />);
    await userEvent.click(screen.getByRole("button", { name: "Excel exportieren" }));

    const { reportName, filterSummary, exportedAt } = pressed(downloadReportWorkbook).provenance;
    expect(reportName).toBeNull();
    expect(filterSummary).toBeNull();
    expect(exportedAt).toBeInstanceOf(Date);
  });

  it("describes the filter alongside it, so a copy says which slice of the season it holds", async () => {
    render(<ReportView />);
    await userEvent.click(screen.getByRole("button", { name: "Klasse: 5BHIF" }));
    await userEvent.click(screen.getByRole("button", { name: "PDF exportieren" }));

    expect(pressed(downloadReportPdf).provenance.filterSummary).toBe("5BHIF");
  });

  it("says so when an export could not be built, instead of failing silently", async () => {
    downloadReportPdf.mockRejectedValue(new Error("no fonts"));

    render(<ReportView />);
    await userEvent.click(screen.getByRole("button", { name: "PDF exportieren" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Der Export konnte nicht erstellt werden.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("no fonts");
  });

  it("offers no export while no season is active", () => {
    useSeasons.mockReturnValue({ seasons: [], loading: false, error: null });

    render(<ReportView />);

    expect(screen.getByRole("button", { name: "PDF exportieren" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Excel exportieren" })).toBeDisabled();
  });
});
