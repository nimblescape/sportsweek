import { ErrorCode } from "./errors";

/**
 * Raised by the service layer so Route Handlers can map a failure onto the shared error
 * envelope without knowing anything about the operation that produced it.
 */
export class ServiceError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  [ErrorCode.ValidationError]: 400,
  [ErrorCode.AuthenticationRequired]: 401,
  [ErrorCode.PermissionDenied]: 403,
  [ErrorCode.NotFound]: 404,
  [ErrorCode.Conflict]: 409,
  [ErrorCode.InternalError]: 500,
};

export function statusForCode(code: ErrorCode): number {
  return STATUS_BY_CODE[code];
}
