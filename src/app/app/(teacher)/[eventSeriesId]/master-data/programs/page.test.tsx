/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it, vi } from "vitest";

// Stubbed for their props alone: what this page decides is which view is opened and what it is
// told, and the real ones reach for the Firebase client on import.
const ProgramsView = () => null;
const ProgramEquipmentView = () => null;

vi.mock("@/components/master-data/programs-view", () => ({ ProgramsView }));
vi.mock("@/components/master-data/program-equipment-view", () => ({ ProgramEquipmentView }));

const { default: ProgramsPage } =
  await import("@/app/app/(teacher)/[eventSeriesId]/master-data/programs/page");

type Opened = { type: unknown; props: Record<string, unknown> };

function open(eventSeriesId: string, searchParams: { equipment?: string }) {
  return ProgramsPage({
    params: Promise.resolve({ eventSeriesId }),
    searchParams: Promise.resolve(searchParams),
  }) as unknown as Promise<Opened>;
}

/**
 * One page serves both lists, told apart by the equipment parameter. It is also the only place
 * the series id is in reach, so a view it forgets to hand the id to cannot build a link back to
 * this address — which is how the way out of the equipment list came to answer 404.
 */
describe("ProgramsPage", () => {
  it("opens the programs list when no program is named", async () => {
    const page = await open("s1", {});

    expect(page.type).toBe(ProgramsView);
    expect(page.props).toEqual({ eventSeriesId: "s1" });
  });

  it("opens the equipment list of the program the parameter names", async () => {
    const page = await open("s1", { equipment: "Tennis" });

    expect(page.type).toBe(ProgramEquipmentView);
    expect(page.props).toEqual({ program: "Tennis", eventSeriesId: "s1" });
  });

  /** A name is the identity (US-21), so it may hold a character a path segment cannot carry. */
  it("passes a program name a URL cannot spell in a segment through untouched", async () => {
    const page = await open("s1", { equipment: "Ski & Board" });

    expect(page.props.program).toBe("Ski & Board");
  });
});
