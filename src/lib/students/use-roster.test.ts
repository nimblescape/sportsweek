/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Doc = { id: string; data: () => unknown };

const onSnapshot = vi.fn();
const onAuthStateChanged = vi.fn();
const collection = vi.fn((_db: unknown, path: string) => path);

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => collection(args[0], args[1] as string),
  onSnapshot,
  query: (...args: unknown[]) => args,
}));

vi.mock("firebase/auth", () => ({ onAuthStateChanged }));
vi.mock("@/lib/firebase/client", () => ({ auth: {}, db: {} }));

const { useRoster } = await import("./use-roster");

const ANNA = "anna@student.htldornbirn.at";
const REGISTRATIONS = "eventSeries/s1/registrations";

const emit = (docs: Doc[]) =>
  act(() => (onSnapshot.mock.calls.at(-1)![1] as (snapshot: { docs: Doc[] }) => void)({ docs }));

const doc = (id: string, data: unknown): Doc => ({ id, data: () => data });

const storedRecord = (overrides: Record<string, unknown> = {}) => ({
  studentUid: ANNA,
  firstName: "Anna",
  lastName: "Muster",
  email: ANNA,
  event: null,
  isIncomplete: false,
  isAttendingSportsWeek: true,
  class: "5AHIF",
  program: "Ski",
  skillLevel: "Fortgeschritten",
  busPickupPoint: null,
  foodOption: null,
  foodOtherText: null,
  seasonPassOption: null,
  dateOfBirth: null,
  gender: "female",
  phoneNumber: null,
  healthNotes: null,
  hasMedication: null,
  equipmentRentalNeeded: null,
  rentedEquipment: [],
  shoeSize: null,
  heightCm: null,
  weightKg: null,
  ...overrides,
});

/** The subscription waits for Firebase Auth, so a signed-in user has to be announced first. */
function signIn() {
  for (const [, callback] of onAuthStateChanged.mock.calls) {
    act(() => (callback as (user: unknown) => void)({ uid: "u1" }));
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  onSnapshot.mockReturnValue(() => {});
  onAuthStateChanged.mockReturnValue(() => {});
});

describe("useRoster", () => {
  /** Which series a registration belongs to is its path, so the read needs no filter (US-26). */
  it("reads the registrations beneath the event series it was given", () => {
    renderHook(() => useRoster("s1"));
    signIn();

    expect(collection).toHaveBeenCalledWith(expect.anything(), REGISTRATIONS);
  });

  it("reads nothing else, because the registration carries the name itself", () => {
    renderHook(() => useRoster("s1"));
    signIn();

    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it("names a student from their own registration", async () => {
    const { result } = renderHook(() => useRoster("s1"));
    signIn();

    emit([doc(ANNA, storedRecord())]);

    await waitFor(() =>
      expect(result.current.students).toEqual([
        expect.objectContaining({ id: ANNA, firstName: "Anna", lastName: "Muster" }),
      ]),
    );
    expect(result.current.loading).toBe(false);
  });

  it("is loading until the registrations have arrived", () => {
    const { result } = renderHook(() => useRoster("s1"));
    signIn();

    expect(result.current.loading).toBe(true);
    expect(result.current.students).toEqual([]);
  });

  it("reads no registrations while no event series is active, and says so by not loading", () => {
    const { result } = renderHook(() => useRoster(null));
    signIn();

    expect(onSnapshot).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.students).toEqual([]);
  });

  it("leaves out a record that does not match its schema rather than losing the rest", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useRoster("s1"));
    signIn();

    emit([doc("broken", { studentUid: ANNA }), doc(ANNA, storedRecord())]);

    expect(result.current.students).toHaveLength(1);
  });

  it("surfaces a failed read rather than showing an empty roster", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useRoster("s1"));
    signIn();

    act(() =>
      (onSnapshot.mock.calls.at(-1)![2] as (error: Error) => void)(
        new Error("Missing or insufficient permissions."),
      ),
    );

    await waitFor(() => expect(result.current.error).toContain("permissions"));
  });
});
