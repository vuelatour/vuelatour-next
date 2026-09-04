import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { textoGrupoBadge } from "@/lib/admin/grupos-ui";
import { cn } from "@/lib/utils";

/**
 * Badge de liga de un HIJO con su cotización de GRUPO: "Grupo G-12 · avión
 * 3 de 7", con link al detalle del grupo. Sin hooks: sirve en server
 * components (detalles) y dentro de client components (tablas). `total`
 * solo se pinta si el API lo mandó (grupo_total_aviones del snapshot); si
 * no, el texto omite "de N" — nunca se inventa.
 */
export function GrupoBadge({
  grupoId,
  folio,
  posicion,
  total,
  nombre,
  className,
  conLink = true,
}: {
  grupoId: string;
  folio: number | string | null | undefined;
  posicion?: number | null;
  total?: number | null;
  /** Nombre del grupo (tooltip). */
  nombre?: string | null;
  className?: string;
  /** false = solo el badge (cuando ya está dentro de otro link). */
  conLink?: boolean;
}) {
  const texto = textoGrupoBadge(folio, posicion, total);
  const badge = (
    <Badge
      variant="outline"
      title={nombre ? `${nombre} — abrir el grupo` : "Abrir la cotización de grupo"}
      className={cn(
        "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/30",
        conLink && "hover:bg-fuchsia-500/25 transition-colors",
        className,
      )}
    >
      {texto}
    </Badge>
  );
  if (!conLink) return badge;
  return (
    <Link href={`/admin/quotes/grupo/${grupoId}`} className="inline-flex">
      {badge}
    </Link>
  );
}
