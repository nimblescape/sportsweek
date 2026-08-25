import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserWithRole = vi.fn();
const updateSeason = vi.fn();
const deleteSeason = vi.fn();

vi.mock("@/lib/auth/guards", () => ({
  getUserWithRole: () => getUserWithRole(),
}));

vi.mock("@/lib/seasons/season-service", () => ({
  updateSeason: (...args: unknown[]) => updateSeason(...args),
  deleteSeason: (...args: unknown[]) => deleteSeason(...args),
}));

const { PATCH, DELETE } = await import("./route");
const { ServiceError } = await import("@/lib/service-error");

const context = { params: Promise.resolve({ seasonId: "s1" }) };

function patchRequest(body: unknown) {
  return new Request("https://example.com/api/seasons/s1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function deleteRequest() {
  return new Request("https://example.com/api/seasons/s1", { method: "DELETE" });
}

beforeEach(() => {
  getUserWithRole.mockReset();
  updateSeason.mockReset();
  deleteSeason.mockReset();
  getUserWithRole.mockResolvedValue({ uid: "u1", email: "t@htldornbirn.at", role: "teacher" });
  updateSeason.mockResolvedValue({ id: "s1", name: "Winter", isActive: true, isArchived: false });
  deleteSeason.mockResolvedValue(undefined);
});

describe("PATCH /api/seasons/[seasonId]", () => {
  it("renames the season", async () => {
    const response = await PATCH(patchRequest({ name: "Neuer Name" }), context);

    expect(response.status).toBe(200);
    expect(updateSeason).toHaveBeenCalledWith("s1", { name: "Neuer Name" });
  });

  it("activates the season", async () => {
    await PATCH(patchRequest({ isActive: true }), context);

    expect(updateSeason).toHaveBeenCalledWith("s1", { isActive: true });
  });

  it("archives the season", async () => {
    await PATCH(patchRequest({ isArchived: true }), context);

    expect(updateSeason).toHaveBeenCalledWith("s1", { isArchived: true });
  });

  it("passes on only the fields that were sent", async () => {
    await PATCH(patchRequest({ isArchived: false }), context);

    expect(updateSeason).toHaveBeenCalledWith("s1", { isArchived: false });
  });

  it("rejects an empty patch", async () => {
    const response = await PATCH(patchRequest({}), context);

    expect(response.status).toBe(400);
    expect(updateSeason).not.toHaveBeenCalled();
  });

  it("rejects an unknown field instead of silently dropping it", async () => {
    const response = await PATCH(patchRequest({ role: "teacher" }), context);

    expect(response.status).toBe(400);
    expect(updateSeason).not.toHaveBeenCalled();
  });

  it("rejects a student with 403", async () => {
    getUserWithRole.mockResolvedValue({ uid: "u2", email: "s@x", role: "student" });

    const response = await PATCH(patchRequest({ name: "X" }), context);

    expect(response.status).toBe(403);
    expect(updateSeason).not.toHaveBeenCalled();
  });

  it("maps a missing season onto 404", async () => {
    updateSeason.mockRejectedValue(new ServiceError("NOT_FOUND", "Gibt es nicht."));

    const response = await PATCH(patchRequest({ name: "X" }), context);

    expect(response.status).toBe(404);
  });

  it("maps activating an archived season onto 409", async () => {
    updateSeason.mockRejectedValue(new ServiceError("CONFLICT", "Archiviert."));

    const response = await PATCH(patchRequest({ isActive: true }), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "CONFLICT", message: "Archiviert." },
    });
  });
});

describe("DELETE /api/seasons/[seasonId]", () => {
  it("deletes the season", async () => {
    const response = await DELETE(deleteRequest(), context);

    expect(response.status).toBe(204);
    expect(deleteSeason).toHaveBeenCalledWith("s1");
  });

  it("rejects a student with 403", async () => {
    getUserWithRole.mockResolvedValue({ uid: "u2", email: "s@x", role: "student" });

    const response = await DELETE(deleteRequest(), context);

    expect(response.status).toBe(403);
    expect(deleteSeason).not.toHaveBeenCalled();
  });

  it("rejects deleting a season that is not archived, even when the client is bypassed", async () => {
    deleteSeason.mockRejectedValue(
      new ServiceError("CONFLICT", "Nur archivierte Saisonen können gelöscht werden."),
    );

    const response = await DELETE(deleteRequest(), context);

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "CONFLICT",
        message: "Nur archivierte Saisonen können gelöscht werden.",
      },
    });
  });
});
