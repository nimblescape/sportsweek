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
  doc: vi.fn(),
  onSnapshot,
  query: vi.fn((...args: unknown[]) => args),
  orderBy: vi.fn((field: string) => `order-by:${field}`),
  where: (...args: unknown[]) => where(args[0] as string, args[1] as string, args[2]),
}));

vi.mock("firebase/auth", () => ({ onAuthStateChanged }));
vi.mock("@/lib/firebase/client", () => ({ auth: {}, db: {} }));

const { useMasterData, useUsageReport } = await import("@/lib/master-data/use-master-data");

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

    emit([docOf("c1", { name: "3AHIT", position: 0 })]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([{ id: "c1", name: "3AHIT", position: 0 }]);
  });

  it("shows the items in the order the teacher set, not alphabetically", async () => {
    const { result } = renderHook(() => useMasterData("classes"));
    signIn();

    emit([
      docOf("a", { name: "Anton", position: 2 }),
      docOf("z", { name: "Zoe", position: 0 }),
      docOf("m", { name: "Mia", position: 1 }),
    ]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items.map((item) => item.id)).toEqual(["z", "m", "a"]);
  });

  it("keeps an item stored before ordering existed visible, at the end", async () => {
    const { result } = renderHook(() => useMasterData("classes"));
    signIn();

    emit([docOf("old", { name: "Anton" }), docOf("new", { name: "Zoe", position: 0 })]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items.map((item) => item.id)).toEqual(["new", "old"]);
  });

  it("drops a malformed document instead of failing the whole list", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useMasterData("classes"));
    signIn();

    emit([docOf("c1", { name: "   " }), docOf("c2", { name: "4BHIT", position: 0 })]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([{ id: "c2", name: "4BHIT", position: 0 }]);
  });

  it("scopes nothing by a parent, since no category has one any more", () => {
    renderHook(() => useMasterData("programs"));
    signIn();

    expect(where).not.toHaveBeenCalled();
  });
});

describe("useUsageReport", () => {
  afterEach(() => vi.unstubAllGlobals());

  const nothingBlocked = { blockedIds: new Set(), blockedEquipment: {} };

  function stubFetch(implementation: (...args: unknown[]) => unknown) {
    const fetchMock = vi.fn(implementation);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  function respond(body: unknown) {
    return () =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
  }

  it("asks the handler for the category it was given", async () => {
    const fetchMock = stubFetch(respond({ blockedIds: [], blockedEquipment: {} }));

    renderHook(() => useUsageReport("food-options"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/master-data/food-options"));
  });

  it("keeps what is in use apart from the entries an item's own list holds", async () => {
    stubFetch(respond({ blockedIds: ["p1"], blockedEquipment: { p2: ["Helm"] } }));

    const { result } = renderHook(() => useUsageReport("programs"));

    await waitFor(() =>
      expect(result.current).toEqual({
        blockedIds: new Set(["p1"]),
        blockedEquipment: { p2: ["Helm"] },
      }),
    );
  });

  it("blocks nothing when the handler refuses, since the server re-checks every write", async () => {
    stubFetch(() => Promise.resolve(new Response(null, { status: 403 })));

    const { result } = renderHook(() => useUsageReport("classes"));

    await waitFor(() => expect(result.current).toEqual(nothingBlocked));
  });

  it("survives a failed request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(() => Promise.reject(new Error("offline")));

    const { result } = renderHook(() => useUsageReport("classes"));

    await waitFor(() => expect(result.current).toEqual(nothingBlocked));
  });
});
