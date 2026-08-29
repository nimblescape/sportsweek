/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchEntraName, fetchEntraPhoto, MAX_PHOTO_BYTES } from "@/lib/auth/graph";

function respondWith(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchEntraName", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the given name and surname Entra holds", async () => {
    respondWith(200, { givenName: "Erika", surname: "Mustermann" });

    expect(await fetchEntraName("token")).toEqual({ firstName: "Erika", lastName: "Mustermann" });
  });

  it("asks Graph only for the two fields it needs", async () => {
    const fetchMock = respondWith(200, { givenName: "Erika", surname: "Mustermann" });

    await fetchEntraName("token");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("graph.microsoft.com");
    expect(url).toContain("givenName");
    expect(url).toContain("surname");
  });

  it("authenticates with the caller's bearer token", async () => {
    const fetchMock = respondWith(200, { givenName: "Erika", surname: "Mustermann" });

    await fetchEntraName("access-token-123");

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer access-token-123");
  });

  it.each([
    ["a rejected token", 401],
    ["a missing User.Read consent", 403],
    ["a server error", 500],
  ])("returns null for %s", async (_case, status) => {
    respondWith(status, {});

    expect(await fetchEntraName("token")).toBeNull();
  });

  it.each([
    ["only a given name", { givenName: "Erika" }, { firstName: "Erika" }],
    ["only a surname", { surname: "Mustermann" }, { lastName: "Mustermann" }],
  ])("returns what Graph holds when it holds %s", async (_case, body, expected) => {
    respondWith(200, body);

    expect(await fetchEntraName("token")).toEqual(expected);
  });

  it.each([
    ["blank values", { givenName: "  ", surname: "  " }],
    ["nothing at all", {}],
  ])("returns null when Graph provides %s", async (_case, body) => {
    respondWith(200, body);

    expect(await fetchEntraName("token")).toBeNull();
  });

  it("returns null instead of throwing when the request fails outright", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    expect(await fetchEntraName("token")).toBeNull();
  });
});

function respondWithPhoto(status: number, type: string, bytes: Uint8Array) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? type : null) },
    arrayBuffer: async () => bytes.buffer,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const JPEG = new Uint8Array([255, 216, 255, 224]);

describe("fetchEntraPhoto", () => {
  beforeEach(() => vi.clearAllMocks());

  /** Stored rather than linked, so what comes back has to be the bytes and not an address. */
  it("returns the photo as a data URL, Graph serving it to a token and not to a browser", async () => {
    respondWithPhoto(200, "image/jpeg", JPEG);

    expect(await fetchEntraPhoto("token")).toBe("data:image/jpeg;base64,/9j/4A==");
  });

  it("asks for a size, not the original, which is as large as the tenant ever uploaded", async () => {
    const fetchMock = respondWithPhoto(200, "image/jpeg", JPEG);

    await fetchEntraPhoto("token");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("graph.microsoft.com");
    expect(url).toMatch(/photos\/\d+x\d+\/\$value$/);
    expect(init.headers.Authorization).toBe("Bearer token");
  });

  /** Most tenants store no photo at all, so this is the ordinary answer rather than a fault. */
  it("returns null when the account has no photo", async () => {
    respondWithPhoto(404, "application/json", new Uint8Array());

    expect(await fetchEntraPhoto("token")).toBeNull();
  });

  it.each([401, 403, 500])("returns null for %d", async (status) => {
    respondWithPhoto(status, "application/json", new Uint8Array());

    expect(await fetchEntraPhoto("token")).toBeNull();
  });

  /** The type is written into a URL the browser will parse, so only known image types go in. */
  it.each(["text/html", "image/svg+xml", "application/octet-stream", ""])(
    "refuses a %s body rather than putting it in a data URL",
    async (type) => {
      respondWithPhoto(200, type, JPEG);

      expect(await fetchEntraPhoto("token")).toBeNull();
    },
  );

  it("takes the type without the parameters a header may carry", async () => {
    respondWithPhoto(200, "image/png; charset=binary", JPEG);

    expect(await fetchEntraPhoto("token")).toBe("data:image/png;base64,/9j/4A==");
  });

  /** It is stored in a document, and a document has a ceiling the whole write is refused at. */
  it("refuses a photo too large for the record it is kept in", async () => {
    respondWithPhoto(200, "image/jpeg", new Uint8Array(MAX_PHOTO_BYTES + 1));

    expect(await fetchEntraPhoto("token")).toBeNull();
  });

  it("refuses an empty body, which is not a photo", async () => {
    respondWithPhoto(200, "image/jpeg", new Uint8Array());

    expect(await fetchEntraPhoto("token")).toBeNull();
  });

  it("returns null instead of throwing when the request fails outright", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    expect(await fetchEntraPhoto("token")).toBeNull();
  });
});
