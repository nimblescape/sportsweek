/*
 * SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Hannes Stauss <scalarion@nimblescape.com>
 * Licensed under the MIT License. See LICENSE in the repository root for details.
 */
import { ErrorCodeSchema, type ErrorCode } from "@/lib/errors";
import { holdRequest } from "@/lib/api/requests";

const GENERIC_MESSAGE = "Das hat leider nicht geklappt.";

/** What a read takes instead of a hold, so the release in the `finally` needs no condition. */
const NOT_REPORTED = () => {};

/** Carries the server's German message, which is written to be shown to the user unchanged. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: ErrorCode | null = null,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export type RequestOptions = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
};

async function readError(response: Response): Promise<ApiRequestError> {
  try {
    const body = await response.json();
    const code = ErrorCodeSchema.safeParse(body?.error?.code);
    const message = typeof body?.error?.message === "string" ? body.error.message : GENERIC_MESSAGE;
    return new ApiRequestError(message, code.success ? code.data : null, body?.error?.details);
  } catch {
    return new ApiRequestError(GENERIC_MESSAGE);
  }
}

/**
 * Every request the browser makes to this application's own API, and the only place one is made.
 *
 * A write reports itself busy for as long as it is out, so the spinner speaks for every one of
 * them without a caller having to remember to say so — which is what keeps a control that forgot
 * from being possible at all. A read reports nothing: the indicator answers for what the teacher
 * started, and the pages of a series fetch as they are opened.
 */
export async function apiRequest<T = unknown>(
  url: string,
  { method, body }: RequestOptions,
): Promise<T | null> {
  const release = method === "GET" ? NOT_REPORTED : holdRequest();
  try {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch {
      throw new ApiRequestError("Keine Verbindung zum Server. Bitte versuche es erneut.");
    }

    if (!response.ok) throw await readError(response);
    if (response.status === 204) return null;

    return (await response.json()) as T;
  } finally {
    release();
  }
}
