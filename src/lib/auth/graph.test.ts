import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchEntraName } from "@/lib/auth/graph";

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
    respondWith(200, { givenName: "Hannes", surname: "Stauss" });

    expect(await fetchEntraName("token")).toEqual({ firstName: "Hannes", lastName: "Stauss" });
  });

  it("asks Graph only for the two fields it needs", async () => {
    const fetchMock = respondWith(200, { givenName: "Hannes", surname: "Stauss" });

    await fetchEntraName("token");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("graph.microsoft.com");
    expect(url).toContain("givenName");
    expect(url).toContain("surname");
  });

  it("authenticates with the caller's bearer token", async () => {
    const fetchMock = respondWith(200, { givenName: "Hannes", surname: "Stauss" });

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
    ["only a given name", { givenName: "Hannes" }],
    ["only a surname", { surname: "Stauss" }],
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
