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

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, path: string) => path,
  onSnapshot,
  query: (...args: unknown[]) => args,
  where: (field: string, _operator: string, value: unknown) => `where:${field}=${value}`,
}));

vi.mock("firebase/auth", () => ({ onAuthStateChanged }));
vi.mock("@/lib/firebase/client", () => ({ auth: {}, db: {} }));

const { useRoster } = await import("./use-roster");

const ANNA = "anna@student.htldornbirn.at";

function subscription(collectionPath: string) {
  const call = onSnapshot.mock.calls.find(
    ([builtQuery]) => (builtQuery as string[])[0] === collectionPath,
  );
  if (!call) throw new Error(`Nothing subscribed to ${collectionPath}`);
  return call;
}

const emit = (collectionPath: string, docs: Doc[]) =>
  act(() => (subscription(collectionPath)[1] as (snapshot: { docs: Doc[] }) => void)({ docs }));

const doc = (id: string, data: unknown): Doc => ({ id, data: () => data });

const storedRecord = (overrides: Record<string, unknown> = {}) => ({
  userId: ANNA,
  seasonId: "s1",
  eventId: null,
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

const storedUser = { firstName: "Anna", lastName: "Muster", email: ANNA, role: "student" };

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
  it("reads the registrations of the season it was given", () => {
    renderHook(() => useRoster("s1"));
    signIn();

    expect(subscription("studentMasterData")[0]).toEqual([
      "studentMasterData",
      "where:seasonId=s1",
    ]);
  });

  it("reads the users it needs the names from, and only the students among them", () => {
    renderHook(() => useRoster("s1"));
    signIn();

    expect(subscription("users")[0]).toEqual(["users", "where:role=student"]);
  });

  it("joins a registration to its name once both have arrived", async () => {
    const { result } = renderHook(() => useRoster("s1"));
    signIn();

    emit("studentMasterData", [doc(`s1__${ANNA}`, storedRecord())]);
    emit("users", [doc(ANNA, storedUser)]);

    await waitFor(() =>
      expect(result.current.students).toEqual([
        expect.objectContaining({ id: `s1__${ANNA}`, firstName: "Anna", lastName: "Muster" }),
      ]),
    );
    expect(result.current.loading).toBe(false);
  });

  it("keeps loading until the names are there, so no row appears without one", () => {
    const { result } = renderHook(() => useRoster("s1"));
    signIn();

    emit("studentMasterData", [doc(`s1__${ANNA}`, storedRecord())]);

    expect(result.current.loading).toBe(true);
    expect(result.current.students).toEqual([]);
  });

  it("reads no registrations while no season is active, and says so by not loading", () => {
    const { result } = renderHook(() => useRoster(null));
    signIn();

    expect(onSnapshot.mock.calls.some(([q]) => (q as string[])[0] === "studentMasterData")).toBe(
      false,
    );
    expect(result.current.loading).toBe(false);
    expect(result.current.students).toEqual([]);
  });

  it("leaves out a record that does not match its schema rather than losing the rest", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useRoster("s1"));
    signIn();

    emit("studentMasterData", [
      doc("broken", { userId: ANNA, seasonId: "s1" }),
      doc(`s1__${ANNA}`, storedRecord()),
    ]);
    emit("users", [doc(ANNA, storedUser)]);

    expect(result.current.students).toHaveLength(1);
  });
});
