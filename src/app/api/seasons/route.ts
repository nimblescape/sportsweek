/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { handleServiceFailure, parseJsonBody, requireTeacherOrResponse } from "@/lib/api/handler";
import { seasonSchema } from "@/lib/schemas/season";
import { createSeason } from "@/lib/seasons/season-service";

const createSeasonSchema = z.strictObject({ name: seasonSchema.shape.name });

export async function POST(request: Request) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const body = await parseJsonBody(request, createSeasonSchema);
  if (!body.ok) return body.response;

  try {
    const season = await createSeason(body.data);
    return NextResponse.json({ season }, { status: 201 });
  } catch (error) {
    return handleServiceFailure(error, "Creating a season");
  }
}
