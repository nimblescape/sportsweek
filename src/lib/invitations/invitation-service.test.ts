/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";
import { storedEventSeries } from "@/test/event-series";
import type { EventSeries } from "@/lib/schemas/event-series";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({ adminDb: firestore }));

const { createInvitation, invitationsOf, resolveInvitation } =
  await import("@/lib/invitations/invitation-service");
const { ServiceError } = await import("@/lib/service-error");

const SERIES = "s1";

beforeEach(() => firestore.reset());

function seedSeries(overrides: Partial<Omit<EventSeries, "id" | "nameKey">> = {}) {
  firestore.seed(
    "eventSeries",
    SERIES,
    storedEventSeries({ classOptions: ["3aWI", "3bWI"], ...overrides }),
  );
}

function invitationCount() {
  return firestore.count("invitations");
}

describe("createInvitation", () => {
  it("stores the series and class the link enrols into", async () => {
    seedSeries();

    const invitation = await createInvitation(SERIES, "3aWI");

    expect(invitation).toMatchObject({ eventSeriesId: SERIES, class: "3aWI" });
    expect(firestore.get("invitations", invitation.token)).toEqual({
      eventSeriesId: SERIES,
      class: "3aWI",
    });
  });

  /** Guessing must not be a strategy, since holding the token is the whole of what enrols. */
  it("mints a token long enough that guessing is not a strategy", async () => {
    seedSeries();

    const invitation = await createInvitation(SERIES, "3aWI");

    expect(invitation.token.length).toBeGreaterThanOrEqual(32);
    expect(invitation.token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never mints the same token twice", async () => {
    seedSeries();

    const first = await createInvitation(SERIES, "3aWI");
    const second = await createInvitation(SERIES, "3bWI");

    expect(first.token).not.toBe(second.token);
  });

  /** Handing out a link and opening the series are one intent, so they are one action (US-19). */
  it("opens the series to students", async () => {
    seedSeries({ isOpenToStudents: false });

    await createInvitation(SERIES, "3aWI");

    expect(firestore.get("eventSeries", SERIES)?.isOpenToStudents).toBe(true);
  });

  /** Regenerating stops the old link enrolling anybody new, and touches no other class (US-23). */
  it("replaces that class's previous link and leaves the others alone", async () => {
    seedSeries();
    const stale = await createInvitation(SERIES, "3aWI");
    const other = await createInvitation(SERIES, "3bWI");

    const fresh = await createInvitation(SERIES, "3aWI");

    expect(firestore.get("invitations", stale.token)).toBeUndefined();
    expect(firestore.get("invitations", other.token)).toBeDefined();
    expect(firestore.get("invitations", fresh.token)).toBeDefined();
    expect(invitationCount()).toBe(2);
  });

  it("refuses a class the series does not offer", async () => {
    seedSeries();

    await expect(createInvitation(SERIES, "9zZZ")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(invitationCount()).toBe(0);
  });

  it("refuses an event series that is not there", async () => {
    await expect(createInvitation("gone", "3aWI")).rejects.toBeInstanceOf(ServiceError);
  });

  /** An archived series is read-only, so it has nobody left to invite (US-19). */
  it("refuses to hand out a link for an archived series", async () => {
    seedSeries({ isArchived: true });

    await expect(createInvitation(SERIES, "3aWI")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(firestore.get("eventSeries", SERIES)?.isOpenToStudents).not.toBe(true);
  });
});

describe("resolveInvitation", () => {
  it("answers with what the link enrols into", async () => {
    seedSeries({ isOpenToStudents: true });
    const { token } = await createInvitation(SERIES, "3aWI");

    await expect(resolveInvitation(token)).resolves.toMatchObject({
      eventSeriesId: SERIES,
      class: "3aWI",
    });
  });

  it("answers with nothing for a token nobody minted", async () => {
    seedSeries();

    await expect(resolveInvitation("made-up")).resolves.toBeNull();
  });

  /**
   * Closing is how registration is closed (US-19), so a link stops working for that reason
   * rather than through a second mechanism of its own.
   */
  it("answers with nothing once the series is closed again", async () => {
    seedSeries();
    const { token } = await createInvitation(SERIES, "3aWI");
    firestore.seed("eventSeries", SERIES, {
      ...storedEventSeries({ classOptions: ["3aWI"] }),
      isOpenToStudents: false,
    });

    await expect(resolveInvitation(token)).resolves.toBeNull();
  });

  it("answers with nothing when the series it names has gone", async () => {
    seedSeries();
    const { token } = await createInvitation(SERIES, "3aWI");
    firestore.reset();

    await expect(resolveInvitation(token)).resolves.toBeNull();
  });
});

describe("invitationsOf", () => {
  it("answers with the links the series has, one per invited class", async () => {
    seedSeries();
    const first = await createInvitation(SERIES, "3aWI");
    const second = await createInvitation(SERIES, "3bWI");

    const found = await invitationsOf(SERIES);

    expect(found.map((one) => one.token).sort()).toEqual([first.token, second.token].sort());
  });

  it("answers with nothing for a series nobody has invited into", async () => {
    seedSeries();

    await expect(invitationsOf(SERIES)).resolves.toEqual([]);
  });

  /** Holding one link tells its holder nothing about any other, series included (US-23). */
  it("leaves another series' links out", async () => {
    seedSeries();
    firestore.seed("eventSeries", "other", storedEventSeries({ classOptions: ["3aWI"] }));
    await createInvitation("other", "3aWI");

    await expect(invitationsOf(SERIES)).resolves.toEqual([]);
  });

  /** Copying a link twice has to copy the same link; regenerating is a separate decision. */
  it("answers with the one live link after a class's link is regenerated", async () => {
    seedSeries();
    await createInvitation(SERIES, "3aWI");
    const regenerated = await createInvitation(SERIES, "3aWI");

    await expect(invitationsOf(SERIES)).resolves.toEqual([
      { token: regenerated.token, eventSeriesId: SERIES, class: "3aWI" },
    ]);
  });
});
