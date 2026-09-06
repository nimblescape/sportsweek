/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const getDocs = vi.fn();
vi.mock("firebase/firestore", () => ({
  getDocs: (...args: unknown[]) => getDocs(...args),
  collection: (...args: unknown[]) => ({ path: args.slice(1).join("/") }),
  query: (ref: unknown) => ref,
  orderBy: () => undefined,
  limit: () => undefined,
}));

vi.mock("@/lib/firebase/client", () => ({ db: {} }));

const { useRecentLogins } = await import("@/lib/users/use-recent-logins");

const ADA = { uid: "uid-of-ada", email: "a", firstName: "A", lastName: "A", permissions: [] };
const BOB = { uid: "uid-of-bob", email: "b", firstName: "B", lastName: "B", permissions: [] };

function docsOf(values: readonly string[]) {
  return { docs: values.map((at) => ({ get: () => at })) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useRecentLogins", () => {
  it("reads the last sign-in of each teacher once, formatted for a reader", async () => {
    getDocs.mockResolvedValue(docsOf(["2026-09-06T14:30:45+02:00"]));

    const { result } = renderHook(() => useRecentLogins([ADA]));

    await waitFor(() => expect(result.current.get(ADA.uid)).toBeDefined());

    expect(result.current.get(ADA.uid)).toEqual(["So., 06.09.2026, 14:30:45"]);
  });

  it("reports a teacher with no recorded sign-in as an empty history, not absent", async () => {
    getDocs.mockResolvedValue(docsOf([]));

    const { result } = renderHook(() => useRecentLogins([ADA]));

    await waitFor(() => expect(result.current.get(ADA.uid)).toBeDefined());
    expect(result.current.get(ADA.uid)).toEqual([]);
  });

  it("leaves a teacher out of the map when the read is refused, rather than failing", async () => {
    getDocs.mockRejectedValue(new Error("permission-denied"));

    const { result } = renderHook(() => useRecentLogins([ADA]));

    await waitFor(() => expect(getDocs).toHaveBeenCalled());
    expect(result.current.get(ADA.uid)).toBeUndefined();
  });

  it("fetches each teacher only once, even across a rerender with the same list", async () => {
    getDocs.mockResolvedValue(docsOf([]));

    const { result, rerender } = renderHook(({ teachers }) => useRecentLogins(teachers), {
      initialProps: { teachers: [ADA] },
    });
    await waitFor(() => expect(result.current.get(ADA.uid)).toBeDefined());

    rerender({ teachers: [ADA] });
    await waitFor(() => expect(getDocs).toHaveBeenCalledTimes(1));
  });

  it("fetches a teacher newly added to the list without re-fetching the first", async () => {
    getDocs.mockResolvedValue(docsOf([]));

    const { result, rerender } = renderHook(({ teachers }) => useRecentLogins(teachers), {
      initialProps: { teachers: [ADA] },
    });
    await waitFor(() => expect(result.current.get(ADA.uid)).toBeDefined());

    rerender({ teachers: [ADA, BOB] });
    await waitFor(() => expect(result.current.get(BOB.uid)).toBeDefined());
    expect(getDocs).toHaveBeenCalledTimes(2);
  });
});
