import { ErrorCodeSchema, type ErrorCode } from "@/lib/errors";

const GENERIC_MESSAGE = "Das hat leider nicht geklappt.";

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

type RequestOptions = {
  method: "POST" | "PATCH" | "DELETE";
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

export async function apiRequest<T = unknown>(
  url: string,
  { method, body }: RequestOptions,
): Promise<T | null> {
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
}
