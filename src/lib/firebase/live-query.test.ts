/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const onSnapshot = vi.fn();
const onAuthStateChanged = vi.fn();

vi.mock("firebase/firestore", () => ({ onSnapshot }));
vi.mock("firebase/auth", () => ({ onAuthStateChanged }));
vi.mock("@/lib/firebase/client", () => ({ auth: {}, db: {} }));

const { subscribeWithRecovery, RESUBSCRIBE_DELAY_MS } = await import("./live-query");

type Doc = { id: string; data: () => unknown };

/** Hands back the callbacks Firebase was given, so a test can drive them directly. */
function authCallback() {
  return onAuthStateChanged.mock.calls.at(-1)![1] as (user: unknown) => void;
}

function snapshotCallback(call = -1) {
  return onSnapshot.mock.calls.at(call)![1] as (snapshot: { docs: Doc[] }) => void;
}

function errorCallback(call = -1) {
  return onSnapshot.mock.calls.at(call)![2] as (error: Error) => void;
}

const docOf = (id: string, data: unknown): Doc => ({ id, data: () => data });

function subscribe(overrides: Record<string, unknown> = {}) {
  const onData = vi.fn();
  const onError = vi.fn();
  const stop = subscribeWithRecovery({
    label: "Eventreihen",
    buildQuery: () => "the-query" as never,
    parse: (id: string, data: unknown) => ({ id, ...(data as object) }),
    onData,
    onError,
    ...overrides,
  });
  return { onData, onError, stop };
}

const signedIn = { uid: "uid-1" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  onSnapshot.mockReturnValue(() => {});
  onAuthStateChanged.mockReturnValue(() => {});
});

describe("subscribeWithRecovery — waiting for auth", () => {
  it("does not query before the auth state is known", () => {
    subscribe();

    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("subscribes once a user is signed in", () => {
    subscribe();

    authCallback()(signedIn);

    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it("reports an empty result for a signed-out visitor instead of hanging", () => {
    const { onData } = subscribe();

    authCallback()(null);

    expect(onData).toHaveBeenCalledWith([]);
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it("subscribes when the user signs in later, so a slow auth restore still works", () => {
    subscribe();

    authCallback()(null);
    authCallback()(signedIn);

    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it("drops the subscription when the user signs out", () => {
    const unsubscribe = vi.fn();
    onSnapshot.mockReturnValue(unsubscribe);
    subscribe();

    authCallback()(signedIn);
    authCallback()(null);

    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe("subscribeWithRecovery — delivering data", () => {
  it("passes the parsed documents on", () => {
    const { onData } = subscribe();
    authCallback()(signedIn);

    snapshotCallback()({ docs: [docOf("s1", { name: "Winter" })] });

    expect(onData).toHaveBeenCalledWith([{ id: "s1", name: "Winter" }]);
  });

  it("skips a document the schema rejects rather than failing the whole list", () => {
    const { onData } = subscribe({
      parse: (id: string) => (id === "broken" ? null : { id }),
    });
    authCallback()(signedIn);

    snapshotCallback()({ docs: [docOf("s1", {}), docOf("broken", {})] });

    expect(onData).toHaveBeenCalledWith([{ id: "s1" }]);
  });
});

describe("subscribeWithRecovery — surviving a failure", () => {
  it("reports the failure", () => {
    const { onError } = subscribe();
    authCallback()(signedIn);

    errorCallback()(new Error("Missing or insufficient permissions."));

    expect(onError).toHaveBeenCalledWith("Missing or insufficient permissions.");
  });

  it("resubscribes afterwards, since Firestore drops the listener for good", () => {
    subscribe();
    authCallback()(signedIn);

    errorCallback()(new Error("Missing or insufficient permissions."));
    vi.advanceTimersByTime(RESUBSCRIBE_DELAY_MS);

    expect(onSnapshot).toHaveBeenCalledTimes(2);
  });

  it("does not resubscribe before the delay has passed", () => {
    subscribe();
    authCallback()(signedIn);

    errorCallback()(new Error("nope"));
    vi.advanceTimersByTime(RESUBSCRIBE_DELAY_MS - 1);

    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it("clears the error once the retry succeeds", () => {
    const { onError } = subscribe();
    authCallback()(signedIn);
    errorCallback()(new Error("nope"));
    vi.advanceTimersByTime(RESUBSCRIBE_DELAY_MS);

    snapshotCallback()({ docs: [] });

    expect(onError).toHaveBeenLastCalledWith(null);
  });

  it("keeps retrying while the failure persists", () => {
    subscribe();
    authCallback()(signedIn);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      errorCallback()(new Error("still down"));
      vi.advanceTimersByTime(RESUBSCRIBE_DELAY_MS);
    }

    expect(onSnapshot).toHaveBeenCalledTimes(4);
  });
});

describe("subscribeWithRecovery — teardown", () => {
  it("stops listening to both auth and the query", () => {
    const unsubscribeSnapshot = vi.fn();
    const unsubscribeAuth = vi.fn();
    onSnapshot.mockReturnValue(unsubscribeSnapshot);
    onAuthStateChanged.mockReturnValue(unsubscribeAuth);

    const { stop } = subscribe();
    authCallback()(signedIn);
    stop();

    expect(unsubscribeSnapshot).toHaveBeenCalled();
    expect(unsubscribeAuth).toHaveBeenCalled();
  });

  it("cancels a pending retry, so nothing resubscribes after teardown", () => {
    const { stop } = subscribe();
    authCallback()(signedIn);
    errorCallback()(new Error("nope"));

    stop();
    vi.advanceTimersByTime(RESUBSCRIBE_DELAY_MS * 3);

    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it("delivers nothing after teardown, even if a snapshot is still in flight", () => {
    const { onData, stop } = subscribe();
    authCallback()(signedIn);
    const deliver = snapshotCallback();

    stop();
    deliver({ docs: [docOf("s1", { name: "Winter" })] });

    expect(onData).not.toHaveBeenCalled();
  });
});
