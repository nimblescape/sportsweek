/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest, ApiRequestError } from "./client";

/**
 * Each test installs its own fetch stub. Sharing one `vi.fn()` across the file and clearing
 * it between tests makes Vitest re-report a failing call as an unhandled error.
 */
function stubFetch(implementation: (...args: unknown[]) => unknown) {
  const fetchMock = vi.fn(implementation);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

/** Returns whatever apiRequest threw, so the assertion can be made on the error itself. */
async function captureFailure(): Promise<unknown> {
  try {
    await apiRequest("/api/event-series", { method: "POST", body: {} });
    throw new Error("apiRequest was expected to fail");
  } catch (caught) {
    return caught;
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("apiRequest", () => {
  it("returns the parsed body on success", async () => {
    stubFetch(() => Promise.resolve(jsonResponse({ eventSeries: { id: "s1" } }, 201)));

    await expect(
      apiRequest("/api/event-series", { method: "POST", body: { name: "X" } }),
    ).resolves.toEqual({ eventSeries: { id: "s1" } });
  });

  it("sends the body as JSON", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({})));

    await apiRequest("/api/event-series", { method: "POST", body: { name: "X" } });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/event-series",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "X" }),
      }),
    );
  });

  it("resolves to null for a 204, which carries no body", async () => {
    stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));

    await expect(apiRequest("/api/event-series/s1", { method: "DELETE" })).resolves.toBeNull();
  });

  it("surfaces the server's German message so it can be shown as-is", async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse({ error: { code: "CONFLICT", message: "Nur archivierte Eventreihen." } }, 409),
      ),
    );

    await expect(apiRequest("/api/event-series/s1", { method: "DELETE" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Nur archivierte Eventreihen.",
    });
  });

  it("falls back to a generic message when the error body is unreadable", async () => {
    stubFetch(() => Promise.resolve(new Response("<html>502</html>", { status: 502 })));

    const error = await captureFailure();

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as Error).message).toBe("Das hat leider nicht geklappt.");
  });

  it("reports a network failure as a request error rather than leaking the raw cause", async () => {
    stubFetch(() => {
      throw new TypeError("Failed to fetch");
    });

    const error = await captureFailure();

    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as Error).message).toBe("Keine Verbindung zum Server. Bitte versuche es erneut.");
  });
});

/** Some answers cannot be read from the client at all, so they are asked for through a handler. */
describe("apiRequest — reading", () => {
  it("reads with GET and sends no body", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ invitations: [] })));

    await expect(
      apiRequest("/api/event-series/s1/invitations", { method: "GET" }),
    ).resolves.toEqual({ invitations: [] });
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty("body");
  });

  it("surfaces a refused read the same way as a refused write", async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse({ error: { code: "PERMISSION_DENIED", message: "Nicht erlaubt." } }, 403),
      ),
    );

    await expect(
      apiRequest("/api/event-series/s1/invitations", { method: "GET" }),
    ).rejects.toMatchObject({ message: "Nicht erlaubt." });
  });
});
