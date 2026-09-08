import { redirect } from "next/navigation";

/**
 * Ruta LEGADA (5-sep-2026 → F3, 8-sep-2026): la cotización se edita
 * DIRECTO en su página única (`/admin/quotes/[id]`, sin «Revisar» ni
 * `?revisar=1`). Se conserva solo como redirección para que links viejos
 * (alertas, correos, favoritos) sigan funcionando.
 */
export default async function ReviseQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/quotes/${id}`);
}
