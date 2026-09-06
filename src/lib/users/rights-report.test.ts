/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import type { Teacher } from "./use-teachers";
import type { EventSeries } from "@/lib/schemas/event-series";
import { PERMISSION_LABELS } from "@/lib/auth/permissions";
import { NO_PERMISSIONS_LABEL } from "@/lib/users/teacher-filter";
import {
  RIGHTS_LABEL,
  CLASSES_LABEL,
  LOGIN_HISTORY_LABEL,
  NO_CLASSES_HINT,
  NO_LOGINS_HINT,
  rightsReport,
} from "./rights-report";

const ADA: Teacher = {
  uid: "uid-of-ada",
  email: "ada@htldornbirn.at",
  firstName: "Ada",
  lastName: "Auer",
  permissions: ["editUsers", "editMasterData"],
};

const BOB: Teacher = {
  uid: "uid-of-bob",
  email: "bob@htldornbirn.at",
  firstName: "Bob",
  lastName: "Berger",
  permissions: [],
};

const WINTER: EventSeries = {
  name: "Wintersportwoche 2026",
  classOptions: [{ name: "2aWI", teacherUids: [ADA.uid] }],
} as unknown as EventSeries;

describe("rightsReport", () => {
  it("names each teacher first name first, with the address as the first bullet", () => {
    const [section] = rightsReport([ADA], [], new Map());

    expect(section.title).toBe("Ada Auer");
    expect(section.entries).toEqual([ADA.email]);
  });

  it("lists the permissions a teacher holds, in a child section of their own", () => {
    const [section] = rightsReport([ADA], [], new Map());

    const rights = section.sections.find((child) => child.title === RIGHTS_LABEL);
    // In the row's own order, not the order they were granted in — the same order every time.
    expect(rights?.entries).toEqual([
      PERMISSION_LABELS.editMasterData,
      PERMISSION_LABELS.editUsers,
    ]);
  });

  it("says so where a teacher holds no permission at all", () => {
    const [section] = rightsReport([BOB], [], new Map());

    const rights = section.sections.find((child) => child.title === RIGHTS_LABEL);
    expect(rights?.entries).toEqual([NO_PERMISSIONS_LABEL]);
  });

  it("names the classes a teacher looks after, in their own child section", () => {
    const [section] = rightsReport([ADA], [WINTER], new Map());

    const classes = section.sections.find((child) => child.title === CLASSES_LABEL);
    expect(classes?.entries).toEqual(["Wintersportwoche 2026: 2aWI"]);
  });

  it("says so where a teacher looks after no class", () => {
    const [section] = rightsReport([BOB], [WINTER], new Map());

    const classes = section.sections.find((child) => child.title === CLASSES_LABEL);
    expect(classes?.entries).toEqual([NO_CLASSES_HINT]);
  });

  it("names the last sign-in in its own child section", () => {
    const logins = new Map([[ADA.uid, ["Fr., 06.09.2026, 14:30:45"]]]);

    const [section] = rightsReport([ADA], [], logins);

    const history = section.sections.find((child) => child.title === LOGIN_HISTORY_LABEL);
    expect(history?.entries).toEqual(["Fr., 06.09.2026, 14:30:45"]);
  });

  it("stays silent for a teacher whose logins have not been read at all", () => {
    const [section] = rightsReport([BOB], [], new Map());

    const history = section.sections.find((child) => child.title === LOGIN_HISTORY_LABEL);
    expect(history?.entries).toEqual([]);
  });

  it("says so where a teacher has read history but has never signed in", () => {
    const logins = new Map([[BOB.uid, []]]);

    const [section] = rightsReport([BOB], [], logins);

    const history = section.sections.find((child) => child.title === LOGIN_HISTORY_LABEL);
    expect(history?.entries).toEqual([NO_LOGINS_HINT]);
  });

  it("carries one section per teacher, in the order the list is already sorted in", () => {
    const sections = rightsReport([ADA, BOB], [], new Map());

    expect(sections.map((section) => section.title)).toEqual(["Ada Auer", "Bob Berger"]);
  });
});
