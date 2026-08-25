import { NextResponse } from "next/server";
import { z } from "zod";
import { handleServiceFailure, parseJsonBody, requireTeacherOrResponse } from "@/lib/api/handler";
import { seasonSchema } from "@/lib/schemas/season";
import { deleteSeason, updateSeason } from "@/lib/seasons/season-service";

// Strict, so a typo or an injected field is reported rather than silently ignored.
const updateSeasonSchema = z
  .strictObject({
    name: seasonSchema.shape.name.optional(),
    isActive: z.boolean().optional(),
    isArchived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "Es wurde nichts zum Ändern übergeben.");

type Context = { params: Promise<{ seasonId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const body = await parseJsonBody(request, updateSeasonSchema);
  if (!body.ok) return body.response;

  const { seasonId } = await params;

  try {
    const season = await updateSeason(seasonId, body.data);
    return NextResponse.json({ season });
  } catch (error) {
    return handleServiceFailure(error, `Updating season ${seasonId}`);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const denied = await requireTeacherOrResponse();
  if (denied) return denied;

  const { seasonId } = await params;

  try {
    await deleteSeason(seasonId);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleServiceFailure(error, `Deleting season ${seasonId}`);
  }
}
