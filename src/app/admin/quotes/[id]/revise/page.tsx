import { redirect } from "next/navigation";

/**
 * Ruta LEGADA (5-sep-2026 → F3, 8-sep-2026): la cotización se edita
 * DIRECTO en su página única (`/admin/quotes/[id]`, sin «Revisar» ni
 * `?revisar=1`). Se conserva solo como redirección para que links viejos
 * (alertas, correos, favoritos) sigan funcionando.
 *
 * El query string VIAJA con la redirección (24-sep-2026): son los filtros de
 * la lista que usan las flechas «‹ Anterior» / «Siguiente ›». El detalle los
 * valida (`filtrosListaDeParams`) y limpia el `?revisar=1` de siempre.
 */
export default async function ReviseQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    for (const valor of Array.isArray(v) ? v : v != null ? [v] : []) {
      qs.append(k, valor);
    }
  }
  const query = qs.toString();
  redirect(query ? `/admin/quotes/${id}?${query}` : `/admin/quotes/${id}`);
}
