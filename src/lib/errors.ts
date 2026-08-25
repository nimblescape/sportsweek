/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { z } from "zod";

// See .github/instructions/route-handlers.instructions.md for usage conventions.
export const ErrorCode = {
  ValidationError: "VALIDATION_ERROR",
  AuthenticationRequired: "AUTHENTICATION_REQUIRED",
  PermissionDenied: "PERMISSION_DENIED",
  NotFound: "NOT_FOUND",
  Conflict: "CONFLICT",
  InternalError: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ErrorCodeSchema = z.enum(ErrorCode);

export type ApiErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
};

export function apiError(code: ErrorCode, message: string, details?: unknown): ApiErrorBody {
  return { error: { code, message, details } };
}
