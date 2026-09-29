/** Same-origin JSON client. The server remains the only authority for access. */

export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly fieldErrors?: FieldErrors,
    readonly currentVersion?: number,
  ) {
    super(code);
  }
}

export const SESSION_EXPIRED_EVENT = "ieum:session-expired";

function parseFieldErrors(value: unknown): FieldErrors | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return undefined;
  const entries = Object.entries(value).filter(
    (entry): entry is [string, string[]] =>
      Array.isArray(entry[1]) &&
      entry[1].every((item) => typeof item === "string"),
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}

async function readError(response: Response): Promise<ApiError> {
  let code = response.status === 401 ? "UNAUTHORIZED" : "HTTP_ERROR";
  let fieldErrors: FieldErrors | undefined;
  let currentVersion: number | undefined;
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null) {
      if ("code" in body && typeof body.code === "string") code = body.code;
      if ("fieldErrors" in body)
        fieldErrors = parseFieldErrors(body.fieldErrors);
      if ("currentVersion" in body && typeof body.currentVersion === "number")
        currentVersion = body.currentVersion;
    }
  } catch {
    // Non-JSON error bodies keep the status-derived code.
  }
  return new ApiError(response.status, code, fieldErrors, currentVersion);
}

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  idempotencyKey?: string;
  /** Auth endpoints answer 401 for bad credentials; those are not expiry. */
  sessionBound?: boolean;
};

export async function request<T>(
  path: string,
  {
    method = "GET",
    body,
    idempotencyKey,
    sessionBound = true,
  }: RequestOptions = {},
): Promise<T> {
  const headers = new Headers({ accept: "application/json" });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
  const response = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    cache: "no-store",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const error = await readError(response);
    if (response.status === 401 && sessionBound)
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw error;
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}
