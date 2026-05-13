import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const errorDescription = searchParams.get("error_description");

  if (errorDescription) {
    const url = new URL("/auth/auth-error", origin);
    url.searchParams.set("message", errorDescription);
    return NextResponse.redirect(url);
  }

  if (!code) {
    const url = new URL("/auth/auth-error", origin);
    url.searchParams.set("message", "No se recibió un código de autorización de Google.");
    return NextResponse.redirect(url);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const url = new URL("/auth/auth-error", origin);
    url.searchParams.set("message", error.message);
    return NextResponse.redirect(url);
  }

  const safeNext = next.startsWith("/") ? next : "/";
  return NextResponse.redirect(new URL(safeNext, origin));
}
