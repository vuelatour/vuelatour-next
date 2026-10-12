import Link from "next/link";
import {
  ArrowDownTrayIcon,
  InformationCircleIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { BackLink } from "@/components/admin/back-link";
import { TarjetaErrorCarga } from "@/components/admin/tarjeta-error-carga";
import { PeriodSelector } from "@/components/admin/profit-sharing/period-selector";
import { LibroExcel } from "@/components/admin/reportes/libro-excel";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DESCRIPCION_VISTA_BALANCE,
  ETIQUETA_VOLVER_REPORTES,
  NOMBRE_LIBRO_VUELATOUR,
  descargaVistaBalance,
  errorVistaBalance,
  hrefReportesDesdeVista,
  hrefVistaBalance,
  parametrosVistaBalance,
  periodoDefaultVista,
  textoPeriodoVista,
  tituloVistaBalance,
  type ErrorVistaBalance,
} from "@/lib/admin/balance-vista";
import { MODOS_BALANCE_VUELATOUR } from "@/lib/admin/reportes-balance";
import { getBalanceAvionLibro, getBalanceGeneralLibro } from "@/lib/api/balance-libro-server";
import { esErrorDeNext } from "@/lib/api/degradar";
import { isApiError } from "@/lib/api/errors";
import { todayCancun } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { LibroExcel as LibroExcelJson } from "@/types/libro-excel";

export const dynamic = "force-dynamic";
// El libro lo arma pyservices (el general de la flota tarda decenas de
// segundos): la página hereda el tope del segmento, como Conciliación e
// Ingresos.
export const maxDuration = 300;

interface PageProps {
  searchParams: Promise<{ modo?: string; avion?: string; desde?: string; hasta?: string }>;
}

/**
 * `/admin/reportes/balance` (12-oct-2026): el balance mensual, el general o
 * el de un avión EN PANTALLA, como el Excel que se descarga (es el mismo
 * libro). `?modo=mensual|general` o `?avion=<uuid>`, y el periodo
 * `?desde&hasta` (el mismo selector de Reportes, en su variante compacta).
 *
 * Cabecera de UNA línea y el libro debajo (12-oct-2026, tarde; pedido del
 * cliente: «que se vea en grande el "Excel" y hacer muy sutil el título y
 * filtro de fechas para que eso en el navbar ocupe lo menos posible»). La
 * descripción larga y el periodo en texto van en el tooltip del ícono de
 * información junto al título: no ocupan renglón. La cuenta del alto que
 * queda para el libro vive en `styles/libro-excel.css` (`--xl-pantalla-offset`).
 */
export default async function BalanceVistaPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const { destino, desde, hasta } = parametrosVistaBalance(sp, periodoDefaultVista(todayCancun()));

  let libro: LibroExcelJson | null = null;
  let matricula: string | null = null;
  let error: ErrorVistaBalance | null = null;
  try {
    if (destino.tipo === "avion") {
      const res = await getBalanceAvionLibro(destino.avionId, desde, hasta);
      libro = res.libro;
      matricula = res.matricula;
    } else {
      const res = await getBalanceGeneralLibro(desde, hasta, destino.modo);
      libro = res.libro;
    }
  } catch (e) {
    if (esErrorDeNext(e)) throw e;
    error = errorVistaBalance(isApiError(e) ? { status: e.status, message: e.message } : {});
  }

  const titulo = tituloVistaBalance(destino, matricula);
  const descarga = descargaVistaBalance(destino, desde, hasta, matricula);
  const hrefReportes = hrefReportesDesdeVista(desde, hasta);
  const ayuda = `${textoPeriodoVista(desde, hasta)}. ${DESCRIPCION_VISTA_BALANCE}`;

  return (
    // Los márgenes negativos recortan el padding VERTICAL de <main> (py-6
    // lg:py-8 ⇒ quedan 12 px arriba y 12 abajo) para ganar alto; el
    // horizontal se conserva. `--xl-pantalla-offset` (lo hereda el marco del
    // libro) va por breakpoint porque la cabecera envuelve en pantallas
    // angostas y cada línea extra suma hasta 38 px: tres líneas en el
    // teléfono, dos desde `sm`, una desde `xl` (la cuenta está en
    // styles/libro-excel.css; el valor de `xl` es el fallback de la regla).
    <div className="flex flex-col gap-2 -mt-3 -mb-3 lg:-mt-5 lg:-mb-5 [--xl-pantalla-offset:297px] sm:[--xl-pantalla-offset:259px] xl:[--xl-pantalla-offset:221px]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <BackLink href={hrefReportes}>{ETIQUETA_VOLVER_REPORTES}</BackLink>
        <div className="flex items-center gap-1.5">
          <h1 className="text-sm font-semibold tracking-tight">{titulo}</h1>
          <span
            role="img"
            aria-label={ayuda}
            title={ayuda}
            // Enfocable: el tooltip `title` solo sale con el ratón; con
            // teclado el lector de pantalla lo anuncia al tabular.
            tabIndex={0}
            className="inline-flex cursor-help rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <InformationCircleIcon className="h-4 w-4" aria-hidden />
          </span>
        </div>
        {destino.tipo === "vuelatour" ? (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Libro">
            {MODOS_BALANCE_VUELATOUR.map((modo) => {
              const activo = modo === destino.modo;
              return (
                <Link
                  key={modo}
                  href={hrefVistaBalance({ tipo: "vuelatour", modo }, desde, hasta)}
                  aria-current={activo ? "page" : undefined}
                  className={cn(
                    buttonVariants({ variant: activo ? "secondary" : "outline", size: "sm" }),
                    "cursor-pointer",
                  )}
                >
                  {NOMBRE_LIBRO_VUELATOUR[modo]}
                </Link>
              );
            })}
          </div>
        ) : null}
        <PeriodSelector initial={{ desde, hasta }} compacto etiquetaGrupo="Periodo del libro" />
      </div>

      {libro ? (
        <LibroExcel libro={libro} descarga={descarga} pantalla />
      ) : error && error.motivo === "fallo" ? (
        <TarjetaErrorCarga titulo={error.titulo} descripcion={error.descripcion} />
      ) : error ? (
        <Card className="border-amber-300/60">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {error.motivo === "permiso" ? (
                <LockClosedIcon className="h-5 w-5 text-amber-600" aria-hidden />
              ) : null}
              {error.titulo}
            </CardTitle>
            <CardDescription>{error.descripcion}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{titulo}</Badge>
            <Link
              href={hrefReportes}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-2 cursor-pointer")}
            >
              <ArrowDownTrayIcon className="h-4 w-4" aria-hidden />
              Ir a Reportes
            </Link>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
