import "server-only";
import { createClient } from "@/lib/supabase/server";
import { apiFetch, type FetchOptions } from "./fetcher";

export async function serverApi<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return apiFetch<T>(path, { ...options, accessToken: session?.access_token ?? null });
}
