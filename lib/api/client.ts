/**
 * Typed API client — the ONLY sanctioned fetch path for new code (T0.5).
 *
 * Rules (constitution §1, EXECUTION-PLAN R4):
 * - Every call declares the Zod schema of the REAL response shape (captured from route source).
 * - NO silent `{data}`/`data?.data || data` unwrapping — envelopes are explicit per endpoint.
 * - Non-2xx throws ApiError with the server's message; nothing is swallowed.
 */
import { z } from "zod";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type QueryParams = Record<
  string,
  string | number | boolean | undefined | null
>;

export function qs(params: QueryParams = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : "";
}

interface ApiRequest<S extends z.ZodTypeAny> {
  path: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown | FormData;
  schema: S;
  signal?: AbortSignal;
}

export async function apiFetch<S extends z.ZodTypeAny>({
  path,
  method = "GET",
  body,
  schema,
  signal,
}: ApiRequest<S>): Promise<z.output<S>> {
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  // Resolve against the document origin when one exists (browser/jsdom). Node's fetch cannot
  // parse relative URLs, which broke MSW-backed component tests (E2/T2.7).
  const origin =
    typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
  const response = await fetch(`${origin}${path}`, {
    method,
    credentials: "include",
    signal,
    headers: isFormData || body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
  });

  if (!response.ok) {
    let serverMessage = `${response.status} ${response.statusText}`;
    let payload: unknown;
    try {
      payload = await response.json();
      const message =
        (payload as { error?: string })?.error ??
        (payload as { message?: string })?.message;
      if (typeof message === "string" && message.length > 0) serverMessage = message;
    } catch {
      // non-JSON error body — keep status text
    }
    throw new ApiError(serverMessage, response.status, payload);
  }

  // 204 / empty body support
  if (response.status === 204) {
    return schema.parse(undefined) as z.output<S>;
  }

  const json: unknown = await response.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError(
      `Resposta inesperada de ${method} ${path}: ${parsed.error.message}`,
      response.status,
      parsed.error,
    );
  }
  return parsed.data;
}
