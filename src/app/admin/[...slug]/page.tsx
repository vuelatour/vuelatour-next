import type { Metadata } from "next";
import { TITULO_PAGINA_NO_ENCONTRADA, tituloComodin } from "@/lib/admin/titulos-pestana";
import Link from "next/link";
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NAV_GROUPS, itemNavActivo } from "@/lib/admin/nav-items";

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

/**
 * Módulo del menú al que pertenece la ruta: la MISMA regla para la tarjeta y
 * para el título de la pestaña. Gana el href más largo que coincide
 * (`itemNavActivo`, la regla del menú); «Inicio» (`/admin`) solo coincide con
 * `/admin` exacto, que nunca llega a este comodín. Antes, el «empieza con»
 * de `/admin/` hacía que TODA ruta desconocida dijera «Inicio» (14-oct-2026).
 */
function moduloDeRuta(slug: string[]) {
  const pathname = `/admin/${slug.join("/")}`;
  return NAV_GROUPS.flatMap((g) => g.items).find((i) => itemNavActivo(pathname, i.href)) ?? null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const modulo = moduloDeRuta(slug);
  return { title: tituloComodin(modulo?.label, modulo?.comingSoon === true) };
}

/**
 * Comodín de /admin: una ruta que NO existe (enlace viejo, marcador, dedazo:
 * `/admin/flights/<id>/editar`, `/admin/xyz`). Nombra el módulo del menú al
 * que pertenece y regresa a él; fuera de todos, regresa al inicio. «Este
 * módulo aún no se ha construido» SOLO para un módulo marcado `comingSoon`
 * (hoy ninguno: los del menú ya tienen su página y decirlo de Vuelos o
 * Cotizaciones hacía creer que no servían). La pestaña dice lo mismo que la
 * tarjeta (`tituloComodin`).
 */
export default async function ComingSoonPage({ params }: PageProps) {
  const { slug } = await params;
  const match = moduloDeRuta(slug);
  const enConstruccion = match?.comingSoon === true;
  // Un módulo en construcción no tiene página a la cual regresar.
  const volver = match && !enConstruccion ? match : null;
  const Icono = enConstruccion ? WrenchScrewdriverIcon : MagnifyingGlassIcon;

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
              <Icono className="h-7 w-7 text-brand-600 dark:text-brand-400" />
            </div>
          </div>
          <CardTitle>{enConstruccion && match ? match.label : TITULO_PAGINA_NO_ENCONTRADA}</CardTitle>
          <CardDescription>
            {enConstruccion
              ? "Este módulo aún no se ha construido. Estará disponible en próximas iteraciones del sistema."
              : match
                ? `Esta página no existe dentro de ${match.label}. Puede ser un enlace viejo o un marcador.`
                : "Esta página no existe. Puede ser un enlace viejo o un marcador."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Link
            href={volver ? volver.href : "/admin"}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-muted transition-colors"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            {volver ? `Volver a ${volver.label}` : "Volver al inicio"}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
