"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { apiFetch, type FetchOptions } from "./fetcher";

let cachedToken: string | null = null;
let cachedExpiry = 0;

async function getAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && cachedExpiry > now + 30_000) {
    return cachedToken;
  }
  const supabase = createSupabaseBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    cachedToken = null;
    cachedExpiry = 0;
    return null;
  }
  cachedToken = session.access_token;
  cachedExpiry = session.expires_at ? session.expires_at * 1000 : now + 60_000;
  return cachedToken;
}

/**
 * Llama al API desde el browser. Inyecta el JWT de la sesión actual de Supabase.
 * Cachea el token en memoria con margen de 30s antes de la expiración.
 */
export async function apiBrowser<T = unknown>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const token = await getAccessToken();
  return apiFetch<T>(path, {
    ...options,
    accessToken: token,
  });
}
