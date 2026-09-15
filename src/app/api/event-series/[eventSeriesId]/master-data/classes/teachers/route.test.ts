/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorCode } from "@/lib/errors";
import { ServiceError } from "@/lib/service-error";

const getAuthenticatedUser = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ getAuthenticatedUser }));

const setClassTeachers = vi.fn();
vi.mock("@/lib/master-data/master-data-service", () => ({ setClassTeachers }));

const { PATCH } =
  await import("@/app/api/event-series/[eventSeriesId]/master-data/classes/teachers/route");

const SERIES = "s1";

const patch = (body: unknown) =>
  PATCH(
    new Request(`http://localhost/api/event-series/${SERIES}/master-data/classes/teachers`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ eventSeriesId: SERIES }) },
  );

beforeEach(() => {
  vi.clearAllMocks();
  getAuthenticatedUser.mockResolvedValue({
    uid: "uid-of-admin",
    email: "admin@htldornbirn.at",
    accountType: "teacher",
    permissions: ["editMasterData"],
  });
  setClassTeachers.mockResolvedValue({ name: "3AHIT", teacherUids: ["uid-of-ada"] });
});

describe("PATCH /api/event-series/[eventSeriesId]/master-data/classes/teachers", () => {
  it("assigns the teachers named, for the class named", async () => {
    const response = await patch({ class: "3AHIT", teacherUids: ["uid-of-ada"] });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      item: { name: "3AHIT", teacherUids: ["uid-of-ada"] },
    });
    expect(setClassTeachers).toHaveBeenCalledWith(SERIES, "3AHIT", ["uid-of-ada"]);
  });

  it("withdraws every teacher when the list sent is empty", async () => {
    await patch({ class: "3AHIT", teacherUids: [] });

    expect(setClassTeachers).toHaveBeenCalledWith(SERIES, "3AHIT", []);
  });

  it("writes teacherUids and nothing else, refusing a body naming another field", async () => {
    const response = await patch({
      class: "3AHIT",
      teacherUids: [],
      name: "3BHIT",
    });

    expect(response.status).toBe(400);
    expect(setClassTeachers).not.toHaveBeenCalled();
  });

  it("refuses a class named as nothing", async () => {
    const response = await patch({ class: "", teacherUids: [] });

    expect(response.status).toBe(400);
    expect(setClassTeachers).not.toHaveBeenCalled();
  });

  it("refuses anything that is not a uid", async () => {
    const response = await patch({ class: "3AHIT", teacherUids: [""] });

    expect(response.status).toBe(400);
    expect(setClassTeachers).not.toHaveBeenCalled();
  });

  it("refuses a teacher without editMasterData", async () => {
    getAuthenticatedUser.mockResolvedValue({
      uid: "uid-of-other",
      email: "other@htldornbirn.at",
      accountType: "teacher",
      permissions: ["editUsers"],
    });

    const response = await patch({ class: "3AHIT", teacherUids: [] });

    expect(response.status).toBe(403);
    expect(setClassTeachers).not.toHaveBeenCalled();
  });

  it("refuses a caller with no session", async () => {
    getAuthenticatedUser.mockResolvedValue(null);

    const response = await patch({ class: "3AHIT", teacherUids: [] });

    expect(response.status).toBe(401);
    expect(setClassTeachers).not.toHaveBeenCalled();
  });

  it("passes a service refusal on in the shared envelope", async () => {
    setClassTeachers.mockRejectedValue(
      new ServiceError(ErrorCode.NotFound, "Diese Klasse gibt es nicht."),
    );

    const response = await patch({ class: "Weg", teacherUids: [] });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: ErrorCode.NotFound, message: "Diese Klasse gibt es nicht." },
    });
  });
});
