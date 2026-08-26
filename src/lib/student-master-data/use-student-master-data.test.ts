/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Season } from "@/lib/schemas/season";

const onSnapshot = vi.fn();
const doc = vi.fn((_db: unknown, path: string, id: string) => `${path}/${id}`);
const useSeasons = vi.fn();

vi.mock("firebase/firestore", () => ({
  doc: (...args: unknown[]) => doc(args[0], args[1] as string, args[2] as string),
  onSnapshot,
}));

vi.mock("@/lib/firebase/client", () => ({ db: {} }));
vi.mock("@/lib/seasons/use-seasons", () => ({ useSeasons: () => useSeasons() }));

const { useStudentMasterData } = await import("./use-student-master-data");

const STUDENT = "jane.doe@student.htldornbirn.at";

function season(id: string, isActive: boolean): Season {
  return {
    id,
    name: `Saison ${id}`,
    isActive,
    isArchived: false,
    hasStudentData: false,
    position: 0,
  };
}

function emit(snapshot: { exists: () => boolean; id: string; data: () => unknown }) {
  act(() => (onSnapshot.mock.calls.at(-1)![1] as (value: unknown) => void)(snapshot));
}

function fail(message: string) {
  act(() => (onSnapshot.mock.calls.at(-1)![2] as (error: Error) => void)(new Error(message)));
}

const storedRecord = {
  userId: STUDENT,
  seasonId: "s1",
  eventId: null,
  isAttendingSportsWeek: true,
  class: "3AHME",
  program: null,
  skillLevel: null,
  busPickupPoint: null,
  foodOption: null,
  foodOtherText: null,
  seasonPassOption: null,
  dateOfBirth: null,
  gender: null,
  phoneNumber: null,
  emergencyContact: {
    firstName: null,
    lastName: null,
    relationship: null,
    relationshipOtherText: null,
    phoneNumber: null,
  },
  healthNotes: null,
  hasMedication: null,
  equipmentRentalNeeded: null,
  rentedEquipment: [],
  shoeSize: null,
  heightCm: null,
  weightKg: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  onSnapshot.mockReturnValue(() => {});
  useSeasons.mockReturnValue({ seasons: [season("s1", true)], loading: false, error: null });
});

describe("useStudentMasterData", () => {
  it("waits for the seasons before deciding there is nothing to register for", () => {
    useSeasons.mockReturnValue({ seasons: [], loading: true, error: null });

    const { result } = renderHook(() => useStudentMasterData(STUDENT));

    expect(result.current.loading).toBe(true);
    expect(result.current.season).toBeNull();
  });

  it("reports no season while none is active, without reading a record (US-11)", async () => {
    useSeasons.mockReturnValue({ seasons: [season("s1", false)], loading: false, error: null });

    const { result } = renderHook(() => useStudentMasterData(STUDENT));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.season).toBeNull();
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("binds to the active season", async () => {
    const { result } = renderHook(() => useStudentMasterData(STUDENT));

    await waitFor(() => expect(result.current.season?.id).toBe("s1"));
  });

  /** Derived rather than searched for: one record per student per season, keyed by both. */
  it("reads the one record that season and student can have", () => {
    renderHook(() => useStudentMasterData(STUDENT));

    expect(doc).toHaveBeenCalledWith(expect.anything(), "studentMasterData", `s1__${STUDENT}`);
  });

  it("returns the stored registration", async () => {
    const { result } = renderHook(() => useStudentMasterData(STUDENT));

    emit({ exists: () => true, id: `s1__${STUDENT}`, data: () => storedRecord });

    await waitFor(() => expect(result.current.record?.class).toBe("3AHME"));
  });

  it("returns no record for a student who has not registered yet", async () => {
    const { result } = renderHook(() => useStudentMasterData(STUDENT));

    emit({ exists: () => false, id: `s1__${STUDENT}`, data: () => undefined });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.record).toBeNull();
  });

  it("hides a record that no longer matches its schema instead of rendering it half-read", async () => {
    const { result } = renderHook(() => useStudentMasterData(STUDENT));
    vi.spyOn(console, "error").mockImplementation(() => {});

    emit({ exists: () => true, id: `s1__${STUDENT}`, data: () => ({ class: 42 }) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.record).toBeNull();
  });

  it("surfaces a failed read rather than looking like an empty registration", async () => {
    const { result } = renderHook(() => useStudentMasterData(STUDENT));
    vi.spyOn(console, "error").mockImplementation(() => {});

    fail("Missing or insufficient permissions.");

    await waitFor(() => expect(result.current.error).toContain("permissions"));
    expect(result.current.loading).toBe(false);
  });

  it("passes a failure to read the seasons on", () => {
    useSeasons.mockReturnValue({ seasons: [], loading: false, error: "Keine Verbindung" });

    const { result } = renderHook(() => useStudentMasterData(STUDENT));

    expect(result.current.error).toBe("Keine Verbindung");
  });

  /** Two active seasons is a data defect, not a state to guess at (see activeSeasonOf). */
  it("says so loudly when more than one season claims to be active", () => {
    useSeasons.mockReturnValue({
      seasons: [season("s1", true), season("s2", true)],
      loading: false,
      error: null,
    });

    const { result } = renderHook(() => useStudentMasterData(STUDENT));

    expect(result.current.error).toMatch(/nur eine/i);
    expect(result.current.season).toBeNull();
  });
});
