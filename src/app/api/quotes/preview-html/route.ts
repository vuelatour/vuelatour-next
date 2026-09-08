import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/**
 * VISTA PREVIA REAL de la hoja 1 (F1, 8-sep-2026): proxy con el JWT de la
 * sesión hacia `POST /v1/quotes/preview-html` (API → pyservices
 * `_build_html(solo_hoja_1)`), que devuelve el MISMO HTML que WeasyPrint
 * convierte en PDF (logo y mapa inline, ancho 794 px). Nunca persiste.
 *
 * Body: `PreviewQuoteDto` tal cual lo arma el cotizador (se reenvía sin
 * tocar). Respuesta: `text/html` con `Cache-Control: no-store`, o JSON
 * `{ message, code }` con el status del API (400/409 del motor = mismos que
 * /calculate; 401 sin sesión; 403 sin rol; 502 API caído).
 *
 * Tolerancia al backend viejo (contrato en paralelo): un 404 del API se
 * traduce a `{ code: "PREVIEW_NO_DISPONIBLE" }` — el panel pinta «vista
 * previa no disponible» sin bloquear nada.
 */

export const dynamic = "force-dynamic";

/** Tope defensivo del body (el DTO real pesa unos KB). */
const MAX_BODY_BYTES = 256 * 1024;
const UPSTREAM_TIMEOUT_MS = 30_000;

export async function POST(req: NextRequest) {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json(
      { message: "Cuerpo inválido.", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }
  if (!raw || raw.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { message: "Cuerpo inválido o demasiado grande.", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }
  try {
    JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { message: "El cuerpo no es JSON válido.", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return NextResponse.json(
      { message: "Tu sesión expiró: vuelve a iniciar sesión.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const base = env.API_URL.replace(/\/$/, "");
  let upstream: Response;
  try {
    upstream = await fetch(`${base}/v1/quotes/preview-html`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        Accept: "text/html, application/json",
      },
      body: raw,
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return NextResponse.json(
      { message: "No hay conexión con el API. Intenta de nuevo.", code: "UPSTREAM_DOWN" },
      { status: 502 },
    );
  }

  if (upstream.status === 404) {
    // Backend sin el endpoint todavía (o ruta desconocida): el panel avisa
    // «vista previa no disponible» y sigue funcionando.
    return NextResponse.json(
      {
        message: "La vista previa aún no está disponible en el servidor.",
        code: "PREVIEW_NO_DISPONIBLE",
      },
      { status: 404 },
    );
  }

  if (!upstream.ok) {
    let message = "No se pudo generar la vista previa.";
    let code = "PREVIEW_ERROR";
    if (upstream.status === 403) {
      message = "Tu rol no puede generar la vista previa.";
      code = "FORBIDDEN";
    }
    try {
      const body = (await upstream.json()) as { message?: unknown; code?: unknown };
      if (typeof body.message === "string" && body.message) message = body.message;
      else if (Array.isArray(body.message) && body.message.length > 0) {
        // class-validator: lista de mensajes.
        message = body.message.map(String).join(" · ");
      }
      if (typeof body.code === "string" && body.code) code = body.code;
    } catch {
      // Sin JSON (p. ej. 502 de pyservices): mensaje genérico.
    }
    return NextResponse.json({ message, code }, { status: upstream.status });
  }

  const html = await upstream.text();
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
