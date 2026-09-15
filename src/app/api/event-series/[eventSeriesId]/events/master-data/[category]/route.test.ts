/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthenticatedUser = vi.fn();
const createMasterDataItem = vi.fn();
const updateMasterDataItem = vi.fn();
const deleteMasterDataItem = vi.fn();
const reorderMasterDataItems = vi.fn();
const readMasterDataItems = vi.fn();
const usageReport = vi.fn();

vi.mock("@/lib/auth/guards", () => ({
  getAuthenticatedUser: () => getAuthenticatedUser(),
}));

vi.mock("@/lib/master-data/master-data-service", () => ({
  createMasterDataItem: (...args: unknown[]) => createMasterDataItem(...args),
  updateMasterDataItem: (...args: unknown[]) => updateMasterDataItem(...args),
  deleteMasterDataItem: (...args: unknown[]) => deleteMasterDataItem(...args),
  reorderMasterDataItems: (...args: unknown[]) => reorderMasterDataItems(...args),
  readMasterDataItems: (...args: unknown[]) => readMasterDataItems(...args),
}));

vi.mock("@/lib/master-data/usage-guard", () => ({
  usageReport: (...args: unknown[]) => usageReport(...args),
}));

const { DELETE, GET, PATCH, POST } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");

const STUDENT = { uid: "u2", email: "s@student.htldornbirn.at", accountType: "student" };
const WOCHE_1 = { kind: "event", name: "Woche 1" };

function request(method: string, body: unknown, event: string | null = "Woche 1") {
  const search = event === null ? "" : `?event=${encodeURIComponent(event)}`;
  return new Request(`https://example.com/api/master-data/programs${search}`, {
    method,
    body: JSON.stringify(body),
  });
}

function context(category: string, eventSeriesId = "s1") {
  return { params: Promise.resolve({ eventSeriesId, category }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedUser.mockResolvedValue({
    uid: "u1",
    email: "t@htldornbirn.at",
    accountType: "teacher",
    permissions: ["editMasterData"],
  });
  createMasterDataItem.mockResolvedValue({ name: "Ski" });
  updateMasterDataItem.mockResolvedValue({ name: "Snowboard" });
  deleteMasterDataItem.mockResolvedValue(undefined);
  reorderMasterDataItems.mockResolvedValue(undefined);
  readMasterDataItems.mockResolvedValue({ eventSeriesId: "s1", items: [{ name: "Ski" }] });
  usageReport.mockResolvedValue({ blockedNames: [], blockedEquipment: {} });
});

/**
 * Which category an event may actually override is the service's own rule (US-33): the route
 * only resolves the scope, so these tests are about the `?event=` parameter it adds, not about
 * validation the shared handlers and the service already cover for the series' own route.
 */
describe("the event-scoped master-data route", () => {
  it("reads the event from the query string and passes it on as the scope", async () => {
    await POST(request("POST", { name: "Ski" }), context("programs"));

    expect(createMasterDataItem).toHaveBeenCalledWith("s1", "programs", { name: "Ski" }, WOCHE_1);
  });

  it("scopes a reorder to the event named in the query", async () => {
    await PATCH(request("PATCH", { order: ["Ski"] }), context("programs"));

    expect(reorderMasterDataItems).toHaveBeenCalledWith("s1", "programs", ["Ski"], WOCHE_1);
  });

  it("scopes an edit to the event named in the query", async () => {
    await PATCH(request("PATCH", { item: "Ski", name: "Snowboard" }), context("programs"));

    expect(updateMasterDataItem).toHaveBeenCalledWith(
      "s1",
      "programs",
      "Ski",
      { name: "Snowboard" },
      WOCHE_1,
    );
  });

  it("scopes a delete to the event named in the query", async () => {
    await DELETE(request("DELETE", { item: "Ski" }), context("programs"));

    expect(deleteMasterDataItem).toHaveBeenCalledWith("s1", "programs", "Ski", WOCHE_1);
  });

  it("scopes the usage report to the event named in the query", async () => {
    await GET(request("GET", undefined), context("programs"));

    expect(readMasterDataItems).toHaveBeenCalledWith("s1", "programs", WOCHE_1);
  });

  it("encodes an event name a query could not otherwise carry", async () => {
    await POST(request("POST", { name: "Ski" }, "Woche 1/2"), context("programs"));

    expect(createMasterDataItem).toHaveBeenCalledWith(
      "s1",
      "programs",
      { name: "Ski" },
      { kind: "event", name: "Woche 1/2" },
    );
  });

  it("rejects a request naming no event at all", async () => {
    const response = await POST(request("POST", { name: "Ski" }, null), context("programs"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(createMasterDataItem).not.toHaveBeenCalled();
  });

  it("rejects a blank event name", async () => {
    const response = await POST(request("POST", { name: "Ski" }, "   "), context("programs"));

    expect(response.status).toBe(400);
    expect(createMasterDataItem).not.toHaveBeenCalled();
  });

  /** The service refuses a category an event may not override; the route repeats none of it. */
  it("passes through the service's refusal of a category an event may not override", async () => {
    createMasterDataItem.mockRejectedValue(
      new ServiceError("VALIDATION_ERROR", "Diese Kategorie kennt kein Event."),
    );

    const response = await POST(request("POST", { name: "x" }), context("classes"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "VALIDATION_ERROR", message: "Diese Kategorie kennt kein Event." },
    });
  });

  it("rejects an anonymous caller with 401 before reading the query at all", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    const response = await POST(request("POST", { name: "Ski" }), context("programs"));

    expect(response.status).toBe(401);
    expect(createMasterDataItem).not.toHaveBeenCalled();
  });

  it("rejects a student with 403", async () => {
    getAuthenticatedUser.mockResolvedValue(STUDENT);

    const response = await POST(request("POST", { name: "Ski" }), context("programs"));

    expect(response.status).toBe(403);
    expect(createMasterDataItem).not.toHaveBeenCalled();
  });
});
