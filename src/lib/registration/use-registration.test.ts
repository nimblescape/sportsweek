/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventSeries } from "@/lib/schemas/event-series";
import { storedEventSeries } from "@/test/event-series";

type Snapshot = { id: string; data: () => unknown };
type SnapshotHandler = (snapshot: Snapshot) => void;

const onSnapshot = vi.fn();
const onAuthStateChanged = vi.fn();
const doc = vi.fn((_db: unknown, path: string, id: string) => `${path}/${id}`);
const useEventSeries = vi.fn();

vi.mock("firebase/firestore", () => ({
  doc: (...args: unknown[]) => doc(args[0], args[1] as string, args[2] as string),
  onSnapshot,
}));

vi.mock("firebase/auth", () => ({ onAuthStateChanged }));
vi.mock("@/lib/firebase/client", () => ({ auth: {}, db: {} }));
vi.mock("@/lib/event-series/use-event-series", () => ({ useEventSeries: () => useEventSeries() }));

const { useRegistration } = await import("./use-registration");

const STUDENT = "jane.doe@student.htldornbirn.at";

function eventSeries(id: string): EventSeries {
  return { id, ...storedEventSeries({ name: `Eventreihe ${id}`, isOpenToStudents: true }) };
}

/** The subscription waits for Firebase Auth, so tests have to announce a signed-in user first. */
function signIn() {
  act(() => (onAuthStateChanged.mock.calls.at(-1)![1] as (user: unknown) => void)({ uid: "u1" }));
}

/** What Firestore hands back for a document that is not there — how every student starts. */
const MISSING: Snapshot = { id: STUDENT, data: () => undefined };

function emit(snapshot: Snapshot) {
  act(() => (onSnapshot.mock.calls.at(-1)![1] as SnapshotHandler)(snapshot));
}

function fail(message: string) {
  act(() => (onSnapshot.mock.calls.at(-1)![2] as (error: Error) => void)(new Error(message)));
}

function storedRecord(className: string): Snapshot {
  return {
    id: STUDENT,
    data: () => ({
      studentUid: STUDENT,
      firstName: "Jane",
      lastName: "Doe",
      email: STUDENT,
      event: null,
      isAttendingSportsWeek: true,
      class: className,
      program: null,
      skillLevel: null,
      busPickupPoint: null,
      foodOption: null,
      foodOtherText: null,
      seasonPassOption: null,
      dateOfBirth: null,
      gender: null,
      phoneNumber: null,
      healthNotes: null,
      hasMedication: null,
      equipmentRentalNeeded: null,
      rentedEquipment: [],
      shoeSize: null,
      heightCm: null,
      weightKg: null,
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  onSnapshot.mockReturnValue(() => {});
  onAuthStateChanged.mockReturnValue(() => {});
  useEventSeries.mockReturnValue({
    eventSeries: [eventSeries("s1")],
    loading: false,
    error: null,
  });
});

describe("useRegistration", () => {
  it("waits for the event series before deciding there is nothing to register for", () => {
    useEventSeries.mockReturnValue({ eventSeries: [], loading: true, error: null });

    const { result } = renderHook(() => useRegistration("s1", STUDENT));

    expect(result.current.loading).toBe(true);
    expect(result.current.eventSeries).toBeNull();
  });

  it("binds to the event series the path names", async () => {
    const { result } = renderHook(() => useRegistration("s1", STUDENT));

    await waitFor(() => expect(result.current.eventSeries?.id).toBe("s1"));
  });

  /** Deleted while the student had it open, or never there: the view says the same either way. */
  it("reports no event series where the path names one that is gone", async () => {
    const { result } = renderHook(() => useRegistration("gone", STUDENT));
    signIn();

    emit(MISSING);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.eventSeries).toBeNull();
  });

  /**
   * Both halves of "which one is mine?" are known before the read: the series is the path and
   * the UPN is the document's own name (US-26), which is also what the rule owns it by — so a
   * student may read one that does not exist yet.
   */
  it("reads its own document beneath the event series the path names", () => {
    renderHook(() => useRegistration("s1", STUDENT));
    signIn();

    expect(doc).toHaveBeenCalledWith(expect.anything(), "eventSeries/s1/registrations", STUDENT);
  });

  it("waits for Firebase Auth before reading, so the session is restored first", () => {
    renderHook(() => useRegistration("s1", STUDENT));

    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("returns the record of that event series", async () => {
    const { result } = renderHook(() => useRegistration("s1", STUDENT));
    signIn();

    emit(storedRecord("3AHME"));

    await waitFor(() => expect(result.current.record?.class).toBe("3AHME"));
  });

  it("returns no record for a student who has not registered yet", async () => {
    const { result } = renderHook(() => useRegistration("s1", STUDENT));
    signIn();

    emit(MISSING);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.record).toBeNull();
  });

  it("hides a record that no longer matches its schema instead of showing it half-read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useRegistration("s1", STUDENT));
    signIn();

    emit({ id: STUDENT, data: () => ({ studentUid: STUDENT, class: 42 }) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.record).toBeNull();
  });

  it("surfaces a failed read rather than looking like an empty registration", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useRegistration("s1", STUDENT));
    signIn();

    fail("Missing or insufficient permissions.");

    await waitFor(() => expect(result.current.error).toContain("permissions"));
  });

  it("passes a failure to read the event series on", () => {
    useEventSeries.mockReturnValue({ eventSeries: [], loading: false, error: "Keine Verbindung" });

    const { result } = renderHook(() => useRegistration("s1", STUDENT));

    expect(result.current.error).toBe("Keine Verbindung");
  });
});
