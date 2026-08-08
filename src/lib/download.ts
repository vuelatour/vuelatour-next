import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { env } from "@/lib/env";

/**
 * Descarga un archivo del API con el token de sesión (fuente única: reportes,
 * exports y balances la comparten). Devuelve `null` si la descarga salió bien,
 * o el MENSAJE de error para el toast — con la causa que mandó el servidor
 * cuando existe (antes los 4 botones de descarga tragaban el motivo y el
 * operador solo veía "no se pudo").
 */
export async function descargarDelApi(
  path: string,
  opts: {
    filename?: string;
    /** Abrir en pestaña (PDFs) en vez de descargar. */
    openInTab?: boolean;
    query?: Record<string, string | undefined>;
  } = {},
): Promise<string | null> {
  try {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const params = Object.entries(opts.query ?? {}).filter(
      (e): e is [string, string] => e[1] != null && e[1] !== "",
    );
    const qs = params.length
      ? `?${new URLSearchParams(params).toString()}`
      : "";
    const res = await fetch(`${env.API_URL}${path}${qs}`, {
      headers: session
        ? { Authorization: `Bearer ${session.access_token}` }
        : {},
    });
    if (!res.ok) {
      // Sesión/permisos en español (el API responde estos en inglés técnico).
      if (res.status === 401)
        return "Tu sesión expiró — recarga la página e inicia sesión de nuevo.";
      if (res.status === 403)
        return "Tu usuario no tiene permiso para esta descarga.";
      let msg: string | null = null;
      try {
        const body = (await res.json()) as { message?: string | string[] };
        msg = Array.isArray(body.message)
          ? body.message.join("; ")
          : (body.message ?? null);
      } catch {
        // cuerpo no-JSON (p. ej. HTML de un proxy): cae al genérico
      }
      return msg || `El servidor respondió con error ${res.status}.`;
    }
    const url = URL.createObjectURL(await res.blob());
    if (opts.openInTab) {
      window.open(url, "_blank");
    } else {
      const a = document.createElement("a");
      a.href = url;
      a.download = opts.filename ?? "descarga";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return null;
  } catch {
    return "Sin conexión con el servidor — revisa tu red e inténtalo de nuevo.";
  }
}
