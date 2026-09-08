import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/**
 * PDF INTERNO de la cotización (8-sep-2026): una hoja carta para la oficina
 * con comisiones, horas de tacómetro, partición del ingreso, cobros con
 * comisión bancaria y gastos. NUNCA se manda al cliente. Proxy con el JWT de
 * la sesión hacia `POST /v1/quotes/:id/pdf-interno` (API → pyservices,
 * ~30 s); devuelve el binario `application/pdf` inline con el nombre que
 * manda el API ("cotizacion-interna-<folio>.pdf").
 *
 * El API gatea por rol (ADMIN, COORDINADOR, FACTURACION, ANALISTA); el panel
 * solo esconde el botón. Uso desde la UI: `fetch("/api/quotes/:id/pdf-interno",
 * { method: "POST" })` + blob (mismo patrón que el PDF de grupo) o un
 * `<a href target="_blank">` (GET es alias). Errores: JSON `{ message, code }`
 * con el status del API (401 sin sesión, 403 sin rol, 404 cotización
 * inexistente, 502 pyservices caído).
 */

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function proxyPdfInterno(id: string): Promise<Response> {
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { message: "Cotización inválida.", code: "BAD_REQUEST" },
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
    upstream = await fetch(`${base}/v1/quotes/${id}/pdf-interno`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        Accept: "application/pdf, application/json",
      },
      cache: "no-store",
    });
  } catch {
    return NextResponse.json(
      { message: "No hay conexión con el API. Intenta de nuevo.", code: "UPSTREAM_DOWN" },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    let message = "No se pudo generar el PDF interno de la cotización.";
    let code = "PDF_ERROR";
    if (upstream.status === 403) {
      message = "Tu rol no puede generar el PDF interno.";
      code = "FORBIDDEN";
    }
    try {
      const body = (await upstream.json()) as { message?: unknown; code?: unknown };
      if (typeof body.message === "string" && body.message) message = body.message;
      if (typeof body.code === "string" && body.code) code = body.code;
    } catch {
      // El API respondió sin JSON (p. ej. 502 de pyservices): mensaje genérico.
    }
    return NextResponse.json({ message, code }, { status: upstream.status });
  }

  const disposition =
    upstream.headers.get("content-disposition") ??
    `inline; filename="cotizacion-interna-${id}.pdf"`;
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
      "Cache-Control": "no-store",
    },
  });
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return proxyPdfInterno(id);
}

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  return proxyPdfInterno(id);
}
