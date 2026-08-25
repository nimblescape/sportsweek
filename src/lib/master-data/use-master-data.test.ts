/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SnapshotHandler = (snapshot: { docs: { id: string; data: () => unknown }[] }) => void;

const onSnapshot = vi.fn();
const onAuthStateChanged = vi.fn();
const collection = vi.fn((_db: unknown, path: string) => path);
const where = vi.fn((field: string, _op: string, value: unknown) => `where:${field}=${value}`);

vi.mock("firebase/firestore", () => ({
  collection: (...args: unknown[]) => collection(args[0], args[1] as string),
  query: vi.fn((...args: unknown[]) => args),
  orderBy: vi.fn((field: string) => `order-by:${field}`),
  where: (...args: unknown[]) => where(args[0] as string, args[1] as string, args[2]),
  onSnapshot,
}));

vi.mock("firebase/auth", () => ({ onAuthStateChanged }));
vi.mock("@/lib/firebase/client", () => ({ auth: {}, db: {} }));

const { useBlockedItemIds, useMasterData } = await import("@/lib/master-data/use-master-data");

function docOf(id: string, data: unknown) {
  return { id, data: () => data };
}

/** The subscription waits for Firebase Auth, so tests have to announce a signed-in user first. */
function signIn() {
  act(() =>
    (onAuthStateChanged.mock.calls.at(-1)![1] as (user: unknown) => void)({ uid: "uid-1" }),
  );
}

function emit(docs: { id: string; data: () => unknown }[]) {
  act(() => (onSnapshot.mock.calls.at(-1)![1] as SnapshotHandler)({ docs }));
}

beforeEach(() => {
  vi.clearAllMocks();
  onSnapshot.mockReturnValue(() => {});
  onAuthStateChanged.mockReturnValue(() => {});
});

describe("useMasterData", () => {
  it("starts in the loading state", () => {
    const { result } = renderHook(() => useMasterData("classes"));

    expect(result.current.loading).toBe(true);
    expect(result.current.items).toEqual([]);
  });

  it("reads the collection its category names", () => {
    renderHook(() => useMasterData("skill-levels"));
    signIn();

    expect(collection).toHaveBeenCalledWith(expect.anything(), "skillLevels");
  });

  it("returns the items from the snapshot", async () => {
    const { result } = renderHook(() => useMasterData("classes"));
    signIn();

    emit([docOf("c1", { name: "3AHIT" })]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([{ id: "c1", name: "3AHIT" }]);
  });

  it("drops a malformed document instead of failing the whole list", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useMasterData("classes"));
    signIn();

    emit([docOf("c1", { name: "   " }), docOf("c2", { name: "4BHIT" })]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([{ id: "c2", name: "4BHIT" }]);
  });

  it("scopes a nested list to its parent", () => {
    renderHook(() => useMasterData("required-equipment", "ski"));
    signIn();

    expect(where).toHaveBeenCalledWith("programId", "==", "ski");
  });

  it("does not filter a flat list by a parent", () => {
    renderHook(() => useMasterData("classes"));
    signIn();

    expect(where).not.toHaveBeenCalled();
  });
});

describe("useBlockedItemIds", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(implementation: (...args: unknown[]) => unknown) {
    const fetchMock = vi.fn(implementation);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("asks the handler for the category it was given", async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ blockedIds: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    renderHook(() => useBlockedItemIds("food-options"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/master-data/food-options"));
  });

  it("returns the blocked ids", async () => {
    stubFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ blockedIds: ["c1", "c2"] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const { result } = renderHook(() => useBlockedItemIds("classes"));

    await waitFor(() => expect(result.current).toEqual(new Set(["c1", "c2"])));
  });

  it("blocks nothing when the handler refuses, since the server re-checks every write", async () => {
    stubFetch(() => Promise.resolve(new Response(null, { status: 403 })));

    const { result } = renderHook(() => useBlockedItemIds("classes"));

    await waitFor(() => expect(result.current).toEqual(new Set()));
  });

  it("survives a failed request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(() => Promise.reject(new Error("offline")));

    const { result } = renderHook(() => useBlockedItemIds("classes"));

    await waitFor(() => expect(result.current).toEqual(new Set()));
  });
});
