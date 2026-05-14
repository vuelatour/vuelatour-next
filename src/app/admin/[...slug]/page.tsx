import Link from "next/link";
import { ArrowLeftIcon, WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NAV_GROUPS } from "@/lib/admin/nav-items";

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

/**
 * Catch-all para /admin/* que no tienen página construida todavía.
 * Muestra una pantalla "Próximamente" con contexto del módulo solicitado
 * en vez del 404 default. FRONT 4+ irá reemplazando estos comodines con
 * páginas reales.
 */
export default async function ComingSoonPage({ params }: PageProps) {
  const { slug } = await params;
  const pathname = `/admin/${slug.join("/")}`;
  const allItems = NAV_GROUPS.flatMap((g) => g.items);
  const match = allItems.find((i) => i.href === pathname || pathname.startsWith(`${i.href}/`));

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
              <WrenchScrewdriverIcon className="h-7 w-7 text-brand-600 dark:text-brand-400" />
            </div>
          </div>
          <CardTitle>{match ? match.label : "Sección en construcción"}</CardTitle>
          <CardDescription>
            {match
              ? "Este módulo aún no se ha construido. Estará disponible en próximas iteraciones del sistema."
              : "La ruta solicitada no existe en el sistema."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-muted transition-colors"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Volver al dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
