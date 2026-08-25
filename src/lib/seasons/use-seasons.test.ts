import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type SnapshotHandler = (snapshot: { docs: { id: string; data: () => unknown }[] }) => void;
type ErrorHandler = (error: Error) => void;

const onSnapshot = vi.fn();

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(() => "seasons-collection"),
  query: vi.fn((...args: unknown[]) => args),
  orderBy: vi.fn(() => "order-by-name"),
  onSnapshot,
}));

vi.mock("@/lib/firebase/client", () => ({ db: {} }));

const { useSeasons } = await import("@/lib/seasons/use-seasons");

function docOf(id: string, data: unknown) {
  return { id, data: () => data };
}

const validSeason = { name: "Wintersportwoche 2026", isActive: true, isArchived: false };

function emit(docs: { id: string; data: () => unknown }[]) {
  const handler = onSnapshot.mock.calls[0][1] as SnapshotHandler;
  handler({ docs });
}

function fail(error: Error) {
  const handler = onSnapshot.mock.calls[0][2] as ErrorHandler;
  handler(error);
}

describe("useSeasons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onSnapshot.mockReturnValue(() => {});
  });

  it("starts in the loading state", () => {
    const { result } = renderHook(() => useSeasons());

    expect(result.current.loading).toBe(true);
    expect(result.current.seasons).toEqual([]);
  });

  it("returns the seasons from the snapshot", async () => {
    const { result } = renderHook(() => useSeasons());

    emit([docOf("s1", validSeason)]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.seasons).toEqual([{ id: "s1", ...validSeason }]);
  });

  it("drops a malformed document instead of failing the whole list", async () => {
    const { result } = renderHook(() => useSeasons());

    emit([docOf("s1", validSeason), docOf("broken", { name: "", isActive: "yes" })]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.seasons).toHaveLength(1);
    expect(result.current.seasons[0].id).toBe("s1");
  });

  it("surfaces a read failure rather than showing an empty list", async () => {
    const { result } = renderHook(() => useSeasons());

    fail(new Error("Missing or insufficient permissions."));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain("permissions");
  });

  it("unsubscribes on unmount", () => {
    const unsubscribe = vi.fn();
    onSnapshot.mockReturnValue(unsubscribe);

    renderHook(() => useSeasons()).unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
