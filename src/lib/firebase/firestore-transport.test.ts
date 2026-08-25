/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it, vi } from "vitest";

const initializeFirestore = vi.fn(() => "firestore-instance");
const getFirestore = vi.fn(() => "existing-firestore-instance");

vi.mock("firebase/app", () => ({
  initializeApp: vi.fn(() => "app"),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => "app"),
}));

vi.mock("firebase/auth", () => ({
  getAuth: vi.fn(() => "auth"),
  OAuthProvider: class {
    addScope() {}
    setCustomParameters() {}
  },
}));

vi.mock("firebase/firestore", () => ({ initializeFirestore, getFirestore }));

const { createFirestore } = await import("./firestore-transport");

describe("createFirestore", () => {
  it("forces long polling, so a proxy cannot silently kill the Listen stream", () => {
    createFirestore("app" as never);

    expect(initializeFirestore).toHaveBeenCalledWith(
      "app",
      expect.objectContaining({ experimentalForceLongPolling: true }),
    );
  });

  it("returns the configured instance", () => {
    expect(createFirestore("app" as never)).toBe("firestore-instance");
  });

  it("reuses the existing instance when Firestore is already initialized", () => {
    initializeFirestore.mockImplementationOnce(() => {
      throw new Error("Firestore has already been started");
    });

    expect(createFirestore("app" as never)).toBe("existing-firestore-instance");
    expect(getFirestore).toHaveBeenCalledWith("app");
  });
});
