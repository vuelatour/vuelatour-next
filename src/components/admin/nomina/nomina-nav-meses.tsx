"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GastosPersonalesFilterBar } from "@/components/admin/expenses/gastos-personales-filter-bar";
import {
  ETIQUETA_NAV_MESES_NOMINA,
  etiquetaMesNomina,
  hrefMesNomina,
  tituloIrAMesNomina,
} from "@/lib/admin/nomina";

/** Clase de los enlaces «‹ mes» / «mes ›»: a la altura del campo «Mes» (h-8). */
const CLASE_ENLACE_MES = cn(buttonVariants({ variant: "outline" }), "cursor-pointer");

/**
 * Navegación entre meses de «Nómina» (15-oct-2026): el campo «Mes» de Gastos
 * personales (genérico) entre «‹ septiembre 2026» y «noviembre 2026 ›».
 *
 * Es de CLIENTE por la búsqueda de la tabla: `DataTable` escribe `tq` con
 * `history.replaceState` (sin pasar por el server), así que un `href` armado
 * en el server no la ve. Aquí los enlaces leen la query VIVA
 * (`useSearchParams`, sincronizado con `replaceState` en Next) y la pasan a
 * `hrefMesNomina`: con la MISMA regla del campo (`queryCambioDeMes`, conserva
 * `tq` y suelta `tp`) cambiar de mes con un enlace o con el campo deja igual
 * lo que la oficina buscó. La página decide qué vecinos se ofrecen
 * (`null` = no se pinta: el siguiente no va hacia el futuro).
 */
export function NominaNavMeses({
  mes,
  anterior,
  siguiente,
  anteriorDeshabilitado = null,
}: {
  /** «YYYY-MM» ya validado (`mesNominaDeUrl`). */
  mes: string;
  anterior: string | null;
  siguiente: string | null;
  /** Inicio oficial (16-oct-2026): en el mes del inicio «‹ anterior» se
   *  pinta DESHABILITADO con este `title` («El sistema arranca en
   *  septiembre de 2026»). `null` = como siempre. */
  anteriorDeshabilitado?: string | null;
}) {
  const actuales = useSearchParams().toString();
  return (
    <nav aria-label={ETIQUETA_NAV_MESES_NOMINA} className="flex flex-wrap items-end gap-2">
      {anteriorDeshabilitado && (
        <span
          role="link"
          aria-disabled="true"
          title={anteriorDeshabilitado}
          aria-label={anteriorDeshabilitado}
          data-mes-anterior-deshabilitado
          className={cn(CLASE_ENLACE_MES, "pointer-events-none cursor-not-allowed opacity-50")}
        >
          <span aria-hidden="true">‹</span> Mes anterior
        </span>
      )}
      {!anteriorDeshabilitado && anterior && (
        <Link
          href={hrefMesNomina(anterior, actuales)}
          prefetch={false}
          aria-label={tituloIrAMesNomina(anterior)}
          title={tituloIrAMesNomina(anterior)}
          className={CLASE_ENLACE_MES}
        >
          <span aria-hidden="true">‹</span> {etiquetaMesNomina(anterior)}
        </Link>
      )}
      <GastosPersonalesFilterBar mes={mes} />
      {siguiente && (
        <Link
          href={hrefMesNomina(siguiente, actuales)}
          prefetch={false}
          aria-label={tituloIrAMesNomina(siguiente)}
          title={tituloIrAMesNomina(siguiente)}
          className={CLASE_ENLACE_MES}
        >
          {etiquetaMesNomina(siguiente)} <span aria-hidden="true">›</span>
        </Link>
      )}
    </nav>
  );
}
