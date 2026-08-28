/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const onSnapshot = vi.fn();
const onAuthStateChanged = vi.fn();
const collection = vi.fn((_db: unknown, path: string) => path);

vi.mock("firebase/firestore", () => ({
  collection: (...args: [unknown, string]) => collection(...args),
  query: vi.fn((...args: unknown[]) => args),
  onSnapshot,
}));

vi.mock("firebase/auth", () => ({ onAuthStateChanged }));
vi.mock("@/lib/firebase/client", () => ({ auth: {}, db: {} }));

const { useSavedReports } = await import("./use-saved-reports");

/** The hook waits for Firebase Auth, so a test has to announce a signed-in user first. */
function signIn() {
  act(() =>
    (onAuthStateChanged.mock.calls.at(-1)![1] as (user: unknown) => void)({ uid: "uid-1" }),
  );
}

describe("useSavedReports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onSnapshot.mockReturnValue(() => {});
    onAuthStateChanged.mockReturnValue(() => {});
  });

  /** A report filters on one series' lists, so another series' row is no part of this one. */
  it("reads the row of the series it was given, and no other", () => {
    renderHook(() => useSavedReports("s1"));
    signIn();

    expect(collection).toHaveBeenCalledWith({}, "eventSeries/s1/savedReports");
  });

  it("subscribes again when the selection moves to another series", () => {
    const { rerender } = renderHook(({ id }) => useSavedReports(id), {
      initialProps: { id: "s1" },
    });
    signIn();

    rerender({ id: "s2" });
    signIn();

    expect(collection).toHaveBeenCalledWith({}, "eventSeries/s2/savedReports");
  });
});
