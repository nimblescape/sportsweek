/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useTeacherCandidates } from "./use-teacher-candidates";

afterEach(() => vi.unstubAllGlobals());

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

const ADA = { uid: "uid-of-ada", firstName: "Ada", lastName: "Musterfrau", email: "ada@x.at" };
const BOB = { uid: "uid-of-bob", firstName: "Bob", lastName: "Andermann", email: "bob@x.at" };

describe("useTeacherCandidates", () => {
  it("asks the one route the class-teachers editor may read `users` through", async () => {
    const fetchMock = stubFetch(respond({ candidates: [] }));

    renderHook(() => useTeacherCandidates());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/users/teacher-candidates"));
  });

  it("reports itself unanswered until the route replies", () => {
    stubFetch(respond({ candidates: [] }));

    const { result } = renderHook(() => useTeacherCandidates());

    expect(result.current.loading).toBe(true);
  });

  it("sorts what it is given by surname, then first name", async () => {
    stubFetch(respond({ candidates: [ADA, BOB] }));

    const { result } = renderHook(() => useTeacherCandidates());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.candidates).toEqual([BOB, ADA]);
  });

  it("reports an error rather than pretending the staff room is empty", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(() => Promise.resolve(new Response(null, { status: 403 })));

    const { result } = renderHook(() => useTeacherCandidates());

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.candidates).toEqual([]);
  });

  it("reports an error when the request itself fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    stubFetch(() => Promise.reject(new Error("offline")));

    const { result } = renderHook(() => useTeacherCandidates());

    await waitFor(() => expect(result.current.error).not.toBeNull());
  });
});
