import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/**
 * MAPA de la hoja editable (form-as-document, 8-sep-2026): proxy con el JWT
 * de la sesión hacia `POST /v1/quotes/mapa-svg` (API → pyservices
 * `_mapa_svg_elemento`, el MISMO dibujo del PDF). Nunca persiste.
 *
 * Body: `{ escalas: [{ origen_iata, destino_iata, es_ferry?, pdf_oculto? }] }`
 * en orden del borrador (se reenvía sin tocar). Respuesta: `image/svg+xml`
 * con `Cache-Control: no-store`; 204 sin cuerpo = ningún tramo con
 * coordenadas (la hoja no lleva mapa); JSON `{ message, code }` con el
 * status del API en errores (400 validación, 401 sesión, 403 rol, 502/503
 * pyservices). Un 404 del API viejo se traduce a `MAPA_NO_DISPONIBLE`.
 */

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const UPSTREAM_TIMEOUT_MS = 20_000;

export async function POST(req: NextRequest) {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ message: "Cuerpo inválido.", code: "BAD_REQUEST" }, { status: 400 });
  }
  if (!raw || raw.length > MAX_BODY_BYTES) {
    return NextResponse.json(
      { message: "Cuerpo inválido o demasiado grande.", code: "BAD_REQUEST" },
      { status: 400 },
    );
  }
  try {
    const parsed = JSON.parse(raw) as { escalas?: unknown };
    if (!parsed || !Array.isArray(parsed.escalas)) throw new Error("sin escalas");
  } catch {
    return NextResponse.json(
      { message: "El cuerpo debe ser { escalas: [...] }.", code: "BAD_REQUEST" },
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
    upstream = await fetch(`${base}/v1/quotes/mapa-svg`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
        Accept: "image/svg+xml, application/json",
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

  if (upstream.status === 204) {
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  }
  if (upstream.status === 404) {
    return NextResponse.json(
      { message: "El mapa aún no está disponible en el servidor.", code: "MAPA_NO_DISPONIBLE" },
      { status: 404 },
    );
  }
  if (!upstream.ok) {
    let message = "No se pudo dibujar el mapa.";
    let code = "MAPA_ERROR";
    if (upstream.status === 403) {
      message = "Tu rol no puede generar el mapa.";
      code = "FORBIDDEN";
    }
    try {
      const body = (await upstream.json()) as { message?: unknown; code?: unknown };
      if (typeof body.message === "string" && body.message) message = body.message;
      else if (Array.isArray(body.message) && body.message.length > 0) {
        message = body.message.map(String).join(" · ");
      }
      if (typeof body.code === "string" && body.code) code = body.code;
    } catch {
      // sin JSON
    }
    return NextResponse.json({ message, code }, { status: upstream.status });
  }

  const svg = await upstream.text();
  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
