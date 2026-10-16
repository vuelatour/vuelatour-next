import Link from "next/link";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import { buttonVariants } from "@/components/ui/button";
import { ARIA_ATAJOS_PERIODO, atajosPeriodoReportes } from "@/lib/admin/reportes-ui";
import { cn } from "@/lib/utils";
import type { InicioOficial } from "@/lib/admin/inicio-oficial";

/**
 * Atajos «Este mes · Octubre 2026» / «Mes pasado · Septiembre 2026» bajo la
 * card del periodo de `/admin/reportes` (12-oct-2026). Son `<Link>` PUROS a
 * `/admin/reportes?desde&hasta`: navegación de servidor, cero estado, cero
 * carrera con los botones de descarga, y camino de vuelta («Este mes»). El
 * mismo aspecto que el chip «Mes pasado» de Reparto (`secondary` activo /
 * `outline` inactivo). `hoy` viene del servidor (`todayCancun()`): nada se
 * calcula en el cliente, así que no hay hydration.
 *
 * `PeriodSelector` NO se toca y no recibe `atajoMesPasado` (traería el
 * `<select>` nativo de meses a esta pantalla).
 */
export function AtajosPeriodoReportes({
  hoy,
  desde,
  hasta,
  inicio = null,
}: {
  hoy: string;
  desde: string;
  hasta: string;
  /** Inicio oficial (16-oct-2026): sin él, los atajos de siempre. */
  inicio?: InicioOficial;
}) {
  const atajos = atajosPeriodoReportes(hoy, desde, hasta, inicio);
  if (atajos.length === 0) return null;
  return (
    <div role="group" aria-label={ARIA_ATAJOS_PERIODO} className="flex flex-wrap gap-2">
      {atajos.map((a) => (
        <Link
          key={a.clave}
          href={a.href}
          title={a.title}
          data-atajo={a.clave}
          aria-current={a.activo ? "true" : undefined}
          className={cn(
            buttonVariants({ variant: a.activo ? "secondary" : "outline", size: "sm" }),
            "gap-1.5 cursor-pointer",
          )}
        >
          <CalendarDaysIcon className="h-4 w-4" aria-hidden />
          {a.etiqueta}
        </Link>
      ))}
    </div>
  );
}
