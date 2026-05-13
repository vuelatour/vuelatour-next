import { ApiError, InvitedError, UnauthorizedError } from "./errors";

export interface FetchOptions extends Omit<RequestInit, "body"> {
  accessToken?: string | null;
  body?: unknown;
}

function getBaseUrl() {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) throw new Error("NEXT_PUBLIC_API_URL is not set");
  return url.replace(/\/$/, "");
}

export async function apiFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { accessToken, body, headers, ...init } = options;
  const url = `${getBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  const finalHeaders = new Headers(headers);
  if (!finalHeaders.has("Content-Type") && body !== undefined && !(body instanceof FormData)) {
    finalHeaders.set("Content-Type", "application/json");
  }
  if (!finalHeaders.has("Accept")) {
    finalHeaders.set("Accept", "application/json");
  }
  if (accessToken) {
    finalHeaders.set("Authorization", `Bearer ${accessToken}`);
  }

  const res = await fetch(url, {
    ...init,
    headers: finalHeaders,
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get("Content-Type") ?? "";
  const payload: unknown = contentType.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => null);

  if (res.ok) {
    return payload as T;
  }

  const message =
    typeof payload === "object" && payload !== null && "message" in payload && typeof (payload as { message: unknown }).message === "string"
      ? (payload as { message: string }).message
      : res.statusText;

  if (res.status === 401 && message.includes("INVITADO")) {
    throw new InvitedError(message, payload);
  }
  if (res.status === 401) {
    throw new UnauthorizedError(message, payload);
  }
  throw new ApiError(res.status, message, payload);
}
