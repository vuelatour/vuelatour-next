"use client";

import { createClient } from "@/lib/supabase/client";
import { apiFetch, type FetchOptions } from "./fetcher";

export async function browserApi<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return apiFetch<T>(path, { ...options, accessToken: session?.access_token ?? null });
}
