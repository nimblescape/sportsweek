/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiRequest = vi.fn();

vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

const { useInvitations } = await import("./use-invitations");

const SERIES = "s1";

beforeEach(() => {
  vi.clearAllMocks();
  apiRequest.mockResolvedValue({ invitations: [] });
});

async function loaded(eventSeriesId = SERIES) {
  const rendered = renderHook(
    ({ open }: { open: boolean | undefined }) => useInvitations(eventSeriesId, open),
    { initialProps: { open: true as boolean | undefined } },
  );
  await waitFor(() => expect(rendered.result.current.loading).toBe(false));
  return rendered;
}

describe("useInvitations", () => {
  it("asks the handler for the links the series already has", async () => {
    apiRequest.mockResolvedValue({
      invitations: [{ token: "tok", eventSeriesId: SERIES, class: "3aWI" }],
    });

    const { result } = await loaded();

    expect(apiRequest).toHaveBeenCalledWith(`/api/event-series/${SERIES}/invitations`, {
      method: "GET",
    });
    expect(result.current.tokenFor("3aWI")).toBe("tok");
  });

  it("has no token for a class nobody has invited", async () => {
    const { result } = await loaded();

    expect(result.current.tokenFor("3aWI")).toBeNull();
  });

  /**
   * Closing the series withdraws its links (US-23), so the copy held here would outlive them —
   * and go on handing out a token the server has already forgotten.
   */
  it("reads the links again when the series is closed", async () => {
    apiRequest.mockResolvedValue({
      invitations: [{ token: "tok", eventSeriesId: SERIES, class: "3aWI" }],
    });
    const { result, rerender } = await loaded();
    apiRequest.mockResolvedValue({ invitations: [] });

    rerender({ open: false });

    await waitFor(() => expect(result.current.tokenFor("3aWI")).toBeNull());
  });

  /** Nothing is worth asking for until the series has arrived and said whether it is open. */
  it("asks for nothing while the series is still loading", () => {
    renderHook(() => useInvitations(SERIES, undefined));

    expect(apiRequest).not.toHaveBeenCalled();
  });

  /** Copying a link twice has to copy the same link (US-29), so an existing one is not replaced. */
  it("hands back the link a class already has rather than minting another", async () => {
    apiRequest.mockResolvedValue({
      invitations: [{ token: "tok", eventSeriesId: SERIES, class: "3aWI" }],
    });
    const { result } = await loaded();
    apiRequest.mockClear();

    await act(async () => {
      await expect(result.current.linkFor("3aWI")).resolves.toBe("tok");
    });

    expect(apiRequest).not.toHaveBeenCalled();
  });

  /** A class with no link yet gets one on the first press, which opens the series (US-19). */
  it("mints a link for a class that has none, and remembers it", async () => {
    const { result } = await loaded();
    apiRequest.mockResolvedValue({
      invitation: { token: "fresh", eventSeriesId: SERIES, class: "3aWI" },
    });

    await act(async () => {
      await expect(result.current.linkFor("3aWI")).resolves.toBe("fresh");
    });

    expect(apiRequest).toHaveBeenLastCalledWith(`/api/event-series/${SERIES}/invitations`, {
      method: "POST",
      body: { class: "3aWI" },
    });
    expect(result.current.tokenFor("3aWI")).toBe("fresh");
  });

  /** Regenerating stops the old token producing registrations and evicts nobody (US-23). */
  it("always mints on regenerate, even where a link exists", async () => {
    apiRequest.mockResolvedValue({
      invitations: [{ token: "old", eventSeriesId: SERIES, class: "3aWI" }],
    });
    const { result } = await loaded();
    apiRequest.mockResolvedValue({
      invitation: { token: "new", eventSeriesId: SERIES, class: "3aWI" },
    });

    await act(async () => {
      await expect(result.current.regenerate("3aWI")).resolves.toBe("new");
    });

    expect(result.current.tokenFor("3aWI")).toBe("new");
  });

  it("leaves another class's link alone when one is regenerated", async () => {
    apiRequest.mockResolvedValue({
      invitations: [
        { token: "a", eventSeriesId: SERIES, class: "3aWI" },
        { token: "b", eventSeriesId: SERIES, class: "3bWI" },
      ],
    });
    const { result } = await loaded();
    apiRequest.mockResolvedValue({
      invitation: { token: "fresh", eventSeriesId: SERIES, class: "3aWI" },
    });

    await act(async () => {
      await result.current.regenerate("3aWI");
    });

    expect(result.current.tokenFor("3bWI")).toBe("b");
  });

  it("reports a refused read rather than looking like a series with no links", async () => {
    const { ApiRequestError } = await import("@/lib/api/client");
    apiRequest.mockRejectedValue(new ApiRequestError("Nicht erlaubt."));

    const { result } = await loaded();

    expect(result.current.error).toBe("Nicht erlaubt.");
  });
});
