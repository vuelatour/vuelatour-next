import { redirect } from "next/navigation";

interface EditarGrupoPageProps {
  params: Promise<{ id: string }>;
}

/**
 * Ruta conservada SOLO como redirección (5-sep-2026): la revisión del grupo
 * vive ahora en la página única (/admin/quotes/grupo/:id) y `?revisar=1` la
 * abre directo en edición. Links viejos (favoritos, correos, alertas) siguen
 * funcionando.
 */
export default async function EditarGrupoPage({ params }: EditarGrupoPageProps) {
  const { id } = await params;
  redirect(`/admin/quotes/grupo/${id}?revisar=1`);
}
