import { env } from "@/lib/env";
import { ApiError, InvitedError, type ApiErrorBody } from "./errors";
import {
  cabecerasDeIntento,
  dormir,
  esErrorDeRed,
  esEstadoReintentable,
  esMetodoReintentable,
  esperaReintento,
} from "./reintento";

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

  // MULTIPART (22-sep-2026): un `FormData` viaja TAL CUAL y SIN
  // `Content-Type` — lo pone `fetch` con su `boundary`; fijarlo a mano deja
  // al API sin poder separar las partes. Es el único cuerpo que no se
  // serializa: todo lo demás sigue yendo como JSON (regla de `apiFetch`).
  const esMultipart = typeof FormData !== "undefined" && body instanceof FormData;

  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(body !== undefined && !esMultipart && { "Content-Type": "application/json" }),
    ...((headers as Record<string, string>) ?? {}),
  };
  if (accessToken) {
    finalHeaders.Authorization = `Bearer ${accessToken}`;
  }

  const url = buildUrl(path, searchParams);
  const init: RequestInit = {
    ...rest,
    headers: finalHeaders,
    body: esMultipart
      ? (body as FormData)
      : body !== undefined
        ? JSON.stringify(body)
        : undefined,
  };

  // Reintento SOLO de lecturas y SOLO ante «el API no está ahí» (red, 502,
  // 503, 504): la ventana de deploy de Railway tumbaba pantallas enteras
  // (21-sep-2026). Ver `reintento.ts` para la regla completa y el porqué de
  // no repetir mutaciones ni 4xx/500.
  const reintentable = esMetodoReintentable(rest.method);
  let response: Response;
  for (let intento = 0; ; intento++) {
    const espera = reintentable ? esperaReintento(intento) : null;
    // Cada reintento va con una cabecera propia: sin ella, Next devuelve la
    // MISMA respuesta memoizada del intento anterior y el reintento no sale a
    // la red (ver `cabecerasDeIntento`).
    const intentoInit: RequestInit =
      intento === 0 ? init : { ...init, headers: cabecerasDeIntento(finalHeaders, intento) };
    try {
      response = await fetch(url, intentoInit);
    } catch (e) {
      // Un abort deliberado (AbortController del cotizador) nunca se reintenta.
      if (espera !== null && !rest.signal?.aborted && esErrorDeRed(e)) {
        await dormir(espera);
        continue;
      }
      throw e;
    }
    if (espera !== null && esEstadoReintentable(response.status)) {
      // Drenar el cuerpo para liberar la conexión (undici mantiene el socket
      // ocupado si la respuesta no se consume).
      try {
        await response.arrayBuffer();
      } catch {
        /* da igual: solo se está liberando el socket */
      }
      await dormir(espera);
      continue;
    }
    break;
  }

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
