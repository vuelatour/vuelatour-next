import { env } from "@/lib/env";
import { ApiError, InvitedError, type ApiErrorBody } from "./errors";

export interface FetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  searchParams?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, searchParams?: FetchOptions["searchParams"]): string {
  const base = env.API_URL.replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${cleanPath}`);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function apiFetch<T = unknown>(
  path: string,
  options: FetchOptions & { accessToken?: string | null } = {},
): Promise<T> {
  const { body, searchParams, accessToken, headers, ...rest } = options;

  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(body !== undefined && { "Content-Type": "application/json" }),
    ...((headers as Record<string, string>) ?? {}),
  };
  if (accessToken) {
    finalHeaders.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(buildUrl(path, searchParams), {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    let errorBody: ApiErrorBody;
    try {
      errorBody = (await response.json()) as ApiErrorBody;
    } catch {
      errorBody = {
        statusCode: response.status,
        code: "PARSE_ERROR",
        message: response.statusText || "Request failed",
      };
    }
    if (
      response.status === 401 &&
      typeof errorBody.message === "string" &&
      /INVITADO/i.test(errorBody.message)
    ) {
      throw new InvitedError(errorBody);
    }
    throw new ApiError(errorBody);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}
