import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { env } from "@/lib/env";
import { esCampoDesconocidoParaApi, sinCampos } from "@/lib/api/campo-opcional";

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
    /**
     * Abrir en pestaña en vez de descargar. NO usar para PDF que se vean en
     * el visor: el blob se abre bien pero el botón «Descargar» del visor de
     * Chrome vuelve a pedir la URL y falla con «Check internet connection»
     * (11-sep-2026). Para eso va un proxy en `app/api/**` + `lib/admin/
     * pdf-urls.ts`. Descargar con `<a download>` (el camino por defecto de
     * esta función) sí funciona con blob.
     */
    openInTab?: boolean;
    query?: Record<string, string | undefined>;
    /**
     * Campos NUEVOS de la consulta que un API previo puede no conocer
     * (ADITIVO, 16-oct-2026: `excluir_categoria` del Excel de Gastos). Si el
     * API responde el 400 «property X should not exist» por uno de ellos, se
     * pide UNA vez más sin esos campos. Cualquier otro error, como siempre.
     */
    camposOpcionales?: readonly string[];
  } = {},
): Promise<string | null> {
  try {
    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const pedir = (query: Record<string, string | undefined>) => {
      const params = Object.entries(query).filter(
        (e): e is [string, string] => e[1] != null && e[1] !== "",
      );
      const qs = params.length
        ? `?${new URLSearchParams(params).toString()}`
        : "";
      return fetch(`${env.API_URL}${path}${qs}`, {
        headers: session
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      });
    };
    const query = opts.query ?? {};
    let res = await pedir(query);
    const opcionales = (opts.camposOpcionales ?? []).filter(
      (c) => query[c] != null && query[c] !== "",
    );
    if (res.status === 400 && opcionales.length > 0) {
      let mensaje: unknown = null;
      try {
        mensaje = ((await res.clone().json()) as { message?: unknown }).message;
      } catch {
        // cuerpo no-JSON: no es el 400 de un campo desconocido
      }
      const sueltos = opcionales.filter((c) => esCampoDesconocidoParaApi(400, mensaje, c));
      if (sueltos.length > 0) res = await pedir(sinCampos(query, sueltos));
    }
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
