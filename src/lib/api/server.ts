import { createSupabaseServerClient } from "@/lib/supabase/server";
import { apiFetch, type FetchOptions } from "./fetcher";

/**
 * Llama al API desde un Server Component / Server Action / Route Handler.
 * Inyecta automáticamente el JWT de la sesión de Supabase.
 */
export async function apiServer<T = unknown>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const supabase = await createSupabaseServerClient();
  const { data: { session } } = await supabase.auth.getSession();
  return apiFetch<T>(path, {
    ...options,
    accessToken: session?.access_token,
  });
}
