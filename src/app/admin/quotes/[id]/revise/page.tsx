import { redirect } from "next/navigation";

/**
 * Ruta LEGADA (5-sep-2026): la revisión vive ahora en la página única de la
 * cotización (`/admin/quotes/[id]`, botón «Revisar» edita en el lugar).
 * Se conserva solo como redirección para que links viejos (alertas,
 * correos, favoritos) sigan funcionando: `?revisar=1` abre directo en
 * edición (si los candados lo permiten; si no, abre en lectura y avisa).
 */
export default async function ReviseQuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/quotes/${id}?revisar=1`);
}
