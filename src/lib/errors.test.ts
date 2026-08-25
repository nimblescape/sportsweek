/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { describe, expect, it } from "vitest";
import { apiError, ErrorCode, ErrorCodeSchema } from "@/lib/errors";

describe("apiError", () => {
  it("builds an error envelope without details", () => {
    expect(apiError(ErrorCode.NotFound, "Not found")).toEqual({
      error: { code: ErrorCode.NotFound, message: "Not found", details: undefined },
    });
  });

  it("builds an error envelope with details", () => {
    const details = { field: "name" };
    expect(apiError(ErrorCode.ValidationError, "Invalid", details)).toEqual({
      error: { code: ErrorCode.ValidationError, message: "Invalid", details },
    });
  });
});

describe("ErrorCodeSchema", () => {
  it("accepts every declared error code", () => {
    for (const code of Object.values(ErrorCode)) {
      expect(ErrorCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it("rejects an unknown code", () => {
    expect(ErrorCodeSchema.safeParse("NOT_A_REAL_CODE").success).toBe(false);
  });
});
