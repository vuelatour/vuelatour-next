import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/**
 * Recibo de pago (PDF, NO fiscal) de un SOBRE de cobro de grupo: proxy con
 * el JWT de la sesión hacia `GET /v1/grupos/cobros/:id/recibo.pdf` (API →
 * pyservices). Mismo patrón que `/api/grupos/[id]/pdf`: sin token en el
 * cliente, se abre con `window.open("/api/grupos/cobros/<id>/recibo",
 * "_blank")`. Se fuerza `inline` (conservando el nombre de archivo del
 * API, "recibo-REC-G12-1.pdf") para que la pestaña MUESTRE el recibo en
 * vez de descargarlo a ciegas.
 *
 * Errores: JSON `{ message, code }` con el status del API (401 sin sesión,
 * 403 sin rol, 404 sobre inexistente, 409 sobre negativo = reembolso sin
 * recibo, 502 pyservices caído).
 */

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json(
      { message: "Cobro del grupo inválido.", code: "BAD_REQUEST" },
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
    upstream = await fetch(`${base}/v1/grupos/cobros/${id}/recibo.pdf`, {
      method: "GET",
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
    let message = "No se pudo generar el recibo del cobro del grupo.";
    let code = "PDF_ERROR";
    try {
      const body = (await upstream.json()) as { message?: unknown; code?: unknown };
      if (typeof body.message === "string" && body.message) message = body.message;
      if (typeof body.code === "string" && body.code) code = body.code;
    } catch {
      // El API respondió sin JSON (p. ej. 502 de pyservices): mensaje genérico.
    }
    return NextResponse.json({ message, code }, { status: upstream.status });
  }

  // El API manda `attachment; filename="recibo-REC-G12-1.pdf"`: conservar
  // el nombre pero mostrar inline (la pestaña nueva enseña el PDF).
  const filename =
    /filename="?([^";]+)"?/i.exec(upstream.headers.get("content-disposition") ?? "")?.[1] ??
    `recibo-grupo-${id.slice(0, 8)}.pdf`;
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
