/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EventSeries } from "@/lib/schemas/event-series";
import { storedEventSeries } from "@/test/event-series";

type SnapshotHandler = (snapshot: { docs: { id: string; data: () => unknown }[] }) => void;

const onSnapshot = vi.fn();
const onAuthStateChanged = vi.fn();
const collection = vi.fn((_db: unknown, path: string) => path);
const where = vi.fn((field: string, _op: string, value: unknown) => `where:${field}=${value}`);
const useEventSeries = vi.fn();

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => collection(args[0], args[1] as string),
  onSnapshot,
  query: vi.fn((...args: unknown[]) => args),
  where: (...args: unknown[]) => where(args[0] as string, args[1] as string, args[2]),
}));

vi.mock("firebase/auth", () => ({ onAuthStateChanged }));
vi.mock("@/lib/firebase/client", () => ({ auth: {}, db: {} }));
vi.mock("@/lib/event-series/use-event-series", () => ({ useEventSeries: () => useEventSeries() }));

const { useRegistration } = await import("./use-registration");

const STUDENT = "jane.doe@student.htldornbirn.at";

function eventSeries(id: string, isActive: boolean): EventSeries {
  return { id, ...storedEventSeries({ name: `Eventreihe ${id}`, isActive }) };
}

/** The subscription waits for Firebase Auth, so tests have to announce a signed-in user first. */
function signIn() {
  act(() => (onAuthStateChanged.mock.calls.at(-1)![1] as (user: unknown) => void)({ uid: "u1" }));
}

function emit(docs: { id: string; data: () => unknown }[]) {
  act(() => (onSnapshot.mock.calls.at(-1)![1] as SnapshotHandler)({ docs }));
}

function fail(message: string) {
  act(() => (onSnapshot.mock.calls.at(-1)![2] as (error: Error) => void)(new Error(message)));
}

function storedRecord(eventSeriesId: string, className: string) {
  return {
    userId: STUDENT,
    eventSeriesId,
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
  };
}

const doc = (id: string, data: unknown) => ({ id, data: () => data });

beforeEach(() => {
  vi.clearAllMocks();
  onSnapshot.mockReturnValue(() => {});
  onAuthStateChanged.mockReturnValue(() => {});
  useEventSeries.mockReturnValue({
    eventSeries: [eventSeries("s1", true)],
    loading: false,
    error: null,
  });
});

describe("useRegistration", () => {
  it("waits for the event series before deciding there is nothing to register for", () => {
    useEventSeries.mockReturnValue({ eventSeries: [], loading: true, error: null });

    const { result } = renderHook(() => useRegistration(STUDENT));

    expect(result.current.loading).toBe(true);
    expect(result.current.eventSeries).toBeNull();
  });

  it("binds to the active event series", async () => {
    const { result } = renderHook(() => useRegistration(STUDENT));

    await waitFor(() => expect(result.current.eventSeries?.id).toBe("s1"));
  });

  it("reports no event series while none is active", async () => {
    useEventSeries.mockReturnValue({
      eventSeries: [eventSeries("s1", false)],
      loading: false,
      error: null,
    });

    const { result } = renderHook(() => useRegistration(STUDENT));
    signIn();
    emit([]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.eventSeries).toBeNull();
    expect(result.current.record).toBeNull();
  });

  /**
   * Rules deny a read of a document that does not exist — there is no `resource` to check
   * ownership against — and not having registered yet is where every student starts. Asking for
   * the student's records rather than for the one id they could derive answers "none" instead.
   */
  it("asks for the records belonging to this student", () => {
    renderHook(() => useRegistration(STUDENT));
    signIn();

    expect(collection).toHaveBeenCalledWith(expect.anything(), "registrations");
    expect(where).toHaveBeenCalledWith("userId", "==", STUDENT);
  });

  it("waits for Firebase Auth before reading, so the session is restored first", () => {
    renderHook(() => useRegistration(STUDENT));

    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("returns the record of the active event series", async () => {
    const { result } = renderHook(() => useRegistration(STUDENT));
    signIn();

    emit([doc(`s1__${STUDENT}`, storedRecord("s1", "3AHME"))]);

    await waitFor(() => expect(result.current.record?.class).toBe("3AHME"));
  });

  it("ignores what the student registered for in another event series", async () => {
    const { result } = renderHook(() => useRegistration(STUDENT));
    signIn();

    emit([doc(`s0__${STUDENT}`, storedRecord("s0", "2AHME"))]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.record).toBeNull();
  });

  it("returns no record for a student who has not registered yet", async () => {
    const { result } = renderHook(() => useRegistration(STUDENT));
    signIn();

    emit([]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.record).toBeNull();
  });

  it("hides a record that no longer matches its schema instead of showing it half-read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useRegistration(STUDENT));
    signIn();

    emit([doc(`s1__${STUDENT}`, { eventSeriesId: "s1", class: 42 })]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.record).toBeNull();
  });

  it("surfaces a failed read rather than looking like an empty registration", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useRegistration(STUDENT));
    signIn();

    fail("Missing or insufficient permissions.");

    await waitFor(() => expect(result.current.error).toContain("permissions"));
  });

  it("passes a failure to read the event series on", () => {
    useEventSeries.mockReturnValue({ eventSeries: [], loading: false, error: "Keine Verbindung" });

    const { result } = renderHook(() => useRegistration(STUDENT));

    expect(result.current.error).toBe("Keine Verbindung");
  });

  /** Two active event series is a data defect, not a state to guess at (see activeEventSeriesOf). */
  it("says so loudly when more than one event series claims to be active", () => {
    useEventSeries.mockReturnValue({
      eventSeries: [eventSeries("s1", true), eventSeries("s2", true)],
      loading: false,
      error: null,
    });

    const { result } = renderHook(() => useRegistration(STUDENT));

    expect(result.current.error).toMatch(/nur eine/i);
    expect(result.current.eventSeries).toBeNull();
  });
});
