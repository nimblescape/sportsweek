/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SnapshotHandler = (snapshot: { docs: { id: string; data: () => unknown }[] }) => void;
type ErrorHandler = (error: Error) => void;

const onSnapshot = vi.fn();
const onAuthStateChanged = vi.fn();

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => "seasons-collection"),
  query: vi.fn((...args: unknown[]) => args),
  orderBy: vi.fn(() => "order-by-name"),
  onSnapshot,
}));

vi.mock("firebase/auth", () => ({ onAuthStateChanged }));
vi.mock("@/lib/firebase/client", () => ({ auth: {}, db: {} }));

const { useSeasons } = await import("@/lib/seasons/use-seasons");

function docOf(id: string, data: unknown) {
  return { id, data: () => data };
}

const validSeason = {
  name: "Wintersportwoche 2026",
  isActive: true,
  isArchived: false,
  hasStudentData: false,
  position: 0,
};

/** The hook waits for Firebase Auth, so tests have to announce a signed-in user first. */
function signIn() {
  act(() =>
    (onAuthStateChanged.mock.calls.at(-1)![1] as (user: unknown) => void)({ uid: "uid-1" }),
  );
}

function emit(docs: { id: string; data: () => unknown }[]) {
  act(() => (onSnapshot.mock.calls.at(-1)![1] as SnapshotHandler)({ docs }));
}

function fail(error: Error) {
  act(() => (onSnapshot.mock.calls.at(-1)![2] as ErrorHandler)(error));
}

describe("useSeasons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onSnapshot.mockReturnValue(() => {});
    onAuthStateChanged.mockReturnValue(() => {});
  });

  it("starts in the loading state", () => {
    const { result } = renderHook(() => useSeasons());

    expect(result.current.loading).toBe(true);
    expect(result.current.seasons).toEqual([]);
  });

  it("returns the seasons from the snapshot", async () => {
    const { result } = renderHook(() => useSeasons());
    signIn();

    emit([docOf("s1", validSeason)]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.seasons).toEqual([{ id: "s1", ...validSeason }]);
  });

  it("drops a malformed document instead of failing the whole list", async () => {
    const { result } = renderHook(() => useSeasons());
    signIn();

    emit([docOf("s1", validSeason), docOf("broken", { name: "", isActive: "yes" })]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.seasons).toHaveLength(1);
    expect(result.current.seasons[0].id).toBe("s1");
  });

  it("surfaces a read failure rather than showing an empty list", async () => {
    const { result } = renderHook(() => useSeasons());
    signIn();

    fail(new Error("Missing or insufficient permissions."));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain("permissions");
  });

  it("clears the error once a later snapshot arrives", async () => {
    const { result } = renderHook(() => useSeasons());
    signIn();
    fail(new Error("Missing or insufficient permissions."));

    emit([docOf("s1", validSeason)]);

    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.seasons).toHaveLength(1);
  });

  it("reflects a season that appears after the first snapshot", async () => {
    const { result } = renderHook(() => useSeasons());
    signIn();
    emit([]);
    await waitFor(() => expect(result.current.loading).toBe(false));

    emit([docOf("s1", validSeason)]);

    await waitFor(() => expect(result.current.seasons).toHaveLength(1));
  });

  it("reflects a season that disappears", async () => {
    const { result } = renderHook(() => useSeasons());
    signIn();
    emit([docOf("s1", validSeason)]);
    await waitFor(() => expect(result.current.seasons).toHaveLength(1));

    emit([]);

    await waitFor(() => expect(result.current.seasons).toEqual([]));
  });

  it("does not query before the auth state is known", () => {
    renderHook(() => useSeasons());

    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("unsubscribes on unmount", () => {
    const unsubscribe = vi.fn();
    onSnapshot.mockReturnValue(unsubscribe);

    const view = renderHook(() => useSeasons());
    signIn();
    view.unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
