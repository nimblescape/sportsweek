/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "@/test/fake-firestore";
import { storedEventSeries } from "@/test/event-series";
import type { EventSeries } from "@/lib/schemas/event-series";
import { asUid } from "@/lib/schemas/common";

const firestore = new FakeFirestore();

vi.mock("@/lib/firebase/admin", () => ({ adminDb: firestore }));

const { createInvitation, invitationsOf, resolveInvitation, setClassOpen, setEveryClassOpen } =
  await import("@/lib/invitations/invitation-service");
const { ServiceError } = await import("@/lib/service-error");

const SERIES = "s1";
const TEACHER = asUid("uidTeacher");
const COLLEAGUE = asUid("uidColleague");

beforeEach(() => firestore.reset());

function seedSeries(overrides: Partial<Omit<EventSeries, "id" | "nameKey">> = {}) {
  firestore.seed(
    "eventSeries",
    SERIES,
    storedEventSeries({
      classOptions: [
        { name: "3aWI", teacherUids: [], isOpenToStudents: false },
        { name: "3bWI", teacherUids: [], isOpenToStudents: false },
      ],
      ...overrides,
    }),
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

  /** Handing out a link is a separate act from opening the class it names (US-43, Q8). */
  it("leaves every class exactly as closed or open as it found it", async () => {
    seedSeries({
      classOptions: [
        { name: "3aWI", teacherUids: [], isOpenToStudents: false },
        { name: "3bWI", teacherUids: [], isOpenToStudents: true },
      ],
    });

    await createInvitation(SERIES, "3aWI");

    const stored = firestore.get("eventSeries", SERIES);
    expect(stored?.classOptions).toEqual([
      { name: "3aWI", teacherUids: [], isOpenToStudents: false },
      { name: "3bWI", teacherUids: [], isOpenToStudents: true },
    ]);
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
    expect(invitationCount()).toBe(0);
  });
});

describe("resolveInvitation", () => {
  it("answers with what the link enrols into", async () => {
    seedSeries({
      classOptions: [
        { name: "3aWI", teacherUids: [], isOpenToStudents: true },
        { name: "3bWI", teacherUids: [], isOpenToStudents: false },
      ],
    });
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
   * Closing is how registration is closed for that one class (US-43), so a link stops working
   * for that reason rather than through a second mechanism of its own.
   */
  it("answers with nothing once its own class is closed again", async () => {
    seedSeries({ classOptions: [{ name: "3aWI", teacherUids: [], isOpenToStudents: true }] });
    const { token } = await createInvitation(SERIES, "3aWI");
    firestore.seed(
      "eventSeries",
      SERIES,
      storedEventSeries({
        classOptions: [{ name: "3aWI", teacherUids: [], isOpenToStudents: false }],
      }),
    );

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
    firestore.seed(
      "eventSeries",
      "other",
      storedEventSeries({
        classOptions: [{ name: "3aWI", teacherUids: [], isOpenToStudents: false }],
      }),
    );
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

/**
 * The card's one toggle (US-43) — the only thing that moves a class's window. Opening mints a
 * link where the class has none yet; closing evicts nobody, and touches no other class.
 */
describe("setClassOpen", () => {
  it("opens a class that has never had a link, minting one", async () => {
    seedSeries();

    const option = await setClassOpen(SERIES, "3aWI", true);

    expect(option).toMatchObject({ name: "3aWI", isOpenToStudents: true });
    expect(invitationCount()).toBe(1);
    const [invitation] = Object.values(firestore.docs("invitations"));
    expect(invitation).toMatchObject({ eventSeriesId: SERIES, class: "3aWI" });
  });

  it("reuses the link a class already holds rather than minting another", async () => {
    seedSeries();
    const { token } = await createInvitation(SERIES, "3aWI");

    await setClassOpen(SERIES, "3aWI", true);

    expect(invitationCount()).toBe(1);
    expect(firestore.get("invitations", token)).toBeDefined();
  });

  it("closes a class without touching its link", async () => {
    seedSeries({ classOptions: [{ name: "3aWI", teacherUids: [], isOpenToStudents: true }] });
    const { token } = await createInvitation(SERIES, "3aWI");

    const option = await setClassOpen(SERIES, "3aWI", false);

    expect(option).toMatchObject({ name: "3aWI", isOpenToStudents: false });
    expect(firestore.get("invitations", token)).toBeDefined();
  });

  it("touches no other class", async () => {
    seedSeries();

    await setClassOpen(SERIES, "3aWI", true);

    const stored = firestore.get("eventSeries", SERIES);
    expect(stored?.classOptions).toContainEqual({
      name: "3bWI",
      teacherUids: [],
      isOpenToStudents: false,
    });
  });

  it("refuses a class the series does not offer", async () => {
    seedSeries();

    await expect(setClassOpen(SERIES, "9zZZ", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses an event series that is not there", async () => {
    await expect(setClassOpen("gone", "3aWI", true)).rejects.toBeInstanceOf(ServiceError);
  });

  it("refuses an archived series, which cannot even be selected", async () => {
    seedSeries({ isArchived: true });

    await expect(setClassOpen(SERIES, "3aWI", true)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  /** Only the classes the page offers its reader can be opened, closed or re-linked (US-39, US-43). */
  it("refuses a teacher's own class outside their scope, rather than narrowing the request", async () => {
    seedSeries({
      classOptions: [
        { name: "3aWI", teacherUids: [TEACHER], isOpenToStudents: false },
        { name: "3bWI", teacherUids: [COLLEAGUE], isOpenToStudents: false },
      ],
    });

    await expect(setClassOpen(SERIES, "3bWI", true, TEACHER)).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });

  it("lets a teacher act on their own class", async () => {
    seedSeries({
      classOptions: [{ name: "3aWI", teacherUids: [TEACHER], isOpenToStudents: false }],
    });

    await expect(setClassOpen(SERIES, "3aWI", true, TEACHER)).resolves.toMatchObject({
      isOpenToStudents: true,
    });
  });

  /** A teacher assigned to none of the series' classes is unscoped, exactly as everywhere else. */
  it("lets a teacher who looks after none of the series' classes act on any of them", async () => {
    seedSeries({
      classOptions: [{ name: "3aWI", teacherUids: [COLLEAGUE], isOpenToStudents: false }],
    });

    await expect(setClassOpen(SERIES, "3aWI", true, TEACHER)).resolves.toMatchObject({
      isOpenToStudents: true,
    });
  });
});

describe("createInvitation — scoped to the caller's own classes", () => {
  it("refuses a class outside the caller's scope", async () => {
    seedSeries({
      classOptions: [
        { name: "3aWI", teacherUids: [TEACHER], isOpenToStudents: false },
        { name: "3bWI", teacherUids: [COLLEAGUE], isOpenToStudents: false },
      ],
    });

    await expect(createInvitation(SERIES, "3bWI", TEACHER)).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
    expect(invitationCount()).toBe(0);
  });

  it("lets a teacher hand out a link for their own class", async () => {
    seedSeries({
      classOptions: [{ name: "3aWI", teacherUids: [TEACHER], isOpenToStudents: false }],
    });

    await expect(createInvitation(SERIES, "3aWI", TEACHER)).resolves.toMatchObject({
      class: "3aWI",
    });
  });
});

/**
 * The header door's stand-in for US-44 (Slice 8): every class of the series, at once. The next
 * slice narrows this to the teacher's own classes; this call takes none, and offers none.
 */
describe("setEveryClassOpen", () => {
  it("opens every class, minting a link for each that has none", async () => {
    seedSeries();

    await setEveryClassOpen(SERIES, true);

    const stored = firestore.get("eventSeries", SERIES);
    expect(stored?.classOptions).toEqual([
      { name: "3aWI", teacherUids: [], isOpenToStudents: true },
      { name: "3bWI", teacherUids: [], isOpenToStudents: true },
    ]);
    expect(invitationCount()).toBe(2);
  });

  it("reuses a link a class already holds", async () => {
    seedSeries();
    const { token } = await createInvitation(SERIES, "3aWI");

    await setEveryClassOpen(SERIES, true);

    expect(invitationCount()).toBe(2);
    expect(firestore.get("invitations", token)).toBeDefined();
  });

  it("closes every class without touching any link", async () => {
    seedSeries({
      classOptions: [
        { name: "3aWI", teacherUids: [], isOpenToStudents: true },
        { name: "3bWI", teacherUids: [], isOpenToStudents: true },
      ],
    });
    const { token } = await createInvitation(SERIES, "3aWI");

    await setEveryClassOpen(SERIES, false);

    const stored = firestore.get("eventSeries", SERIES) as EventSeries | undefined;
    expect(stored?.classOptions.every((option) => !option.isOpenToStudents)).toBe(true);
    expect(firestore.get("invitations", token)).toBeDefined();
  });

  it("refuses an archived series", async () => {
    seedSeries({ isArchived: true });

    await expect(setEveryClassOpen(SERIES, true)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses an event series that is not there", async () => {
    await expect(setEveryClassOpen("gone", true)).rejects.toBeInstanceOf(ServiceError);
  });
});
