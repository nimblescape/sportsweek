/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRowAction } from "@/lib/api/use-row-action";

/** A promise plus the handles to settle it, so a test can hold a write open. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useRowAction", () => {
  it("starts with no row busy", () => {
    const { result } = renderHook(() => useRowAction());

    expect(result.current.busyId).toBeNull();
  });

  it("names the row while its write is in flight", async () => {
    const write = deferred<void>();
    const { result } = renderHook(() => useRowAction());

    act(() => void result.current.run("s1", () => write.promise));

    await waitFor(() => expect(result.current.busyId).toBe("s1"));
  });

  it("releases the row once the write is answered", async () => {
    const write = deferred<void>();
    const { result } = renderHook(() => useRowAction());

    act(() => void result.current.run("s1", () => write.promise));
    await waitFor(() => expect(result.current.busyId).toBe("s1"));

    await act(async () => {
      write.resolve();
      await write.promise;
    });

    expect(result.current.busyId).toBeNull();
  });

  it("releases the row when the write failed, so the list stays usable", async () => {
    const { result } = renderHook(() => useRowAction());

    await act(async () => {
      await expect(
        result.current.run("s1", () => Promise.reject(new Error("offline"))),
      ).rejects.toThrow("offline");
    });

    expect(result.current.busyId).toBeNull();
  });

  it("hands the result back to the caller", async () => {
    const { result } = renderHook(() => useRowAction());

    await act(async () => {
      await expect(result.current.run("s1", () => Promise.resolve("done"))).resolves.toBe("done");
    });
  });

  describe("pending", () => {
    it("is false while nothing is being written", () => {
      const { result } = renderHook(() => useRowAction());

      expect(result.current.pending).toBe(false);
    });

    it("holds the list for a write that belongs to no row, such as adding one", async () => {
      const write = deferred<void>();
      const { result } = renderHook(() => useRowAction());

      act(() => void result.current.run(null, () => write.promise));

      await waitFor(() => expect(result.current.pending).toBe(true));
      expect(result.current.busyId).toBeNull();
    });

    it("holds it for a row's write as well", async () => {
      const write = deferred<void>();
      const { result } = renderHook(() => useRowAction());

      act(() => void result.current.run("s1", () => write.promise));

      await waitFor(() => expect(result.current.pending).toBe(true));
    });

    it("releases it once the write is answered", async () => {
      const write = deferred<void>();
      const { result } = renderHook(() => useRowAction());

      act(() => void result.current.run(null, () => write.promise));
      await waitFor(() => expect(result.current.pending).toBe(true));

      await act(async () => {
        write.resolve();
        await write.promise;
      });

      expect(result.current.pending).toBe(false);
    });

    it("releases it when the write failed, so the list stays usable", async () => {
      const { result } = renderHook(() => useRowAction());

      await act(async () => {
        await expect(
          result.current.run(null, () => Promise.reject(new Error("offline"))),
        ).rejects.toThrow("offline");
      });

      expect(result.current.pending).toBe(false);
    });
  });
});
