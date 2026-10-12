import Link from "next/link";
import { ArrowDownTrayIcon, LockClosedIcon } from "@heroicons/react/24/outline";
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
 * `?desde&hasta` (el mismo selector de Reportes).
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

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <BackLink href={hrefReportes}>{ETIQUETA_VOLVER_REPORTES}</BackLink>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-muted-foreground">Tesorería · Reportes</p>
        </div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{titulo}</h1>
        <p className="text-sm text-muted-foreground">
          {textoPeriodoVista(desde, hasta)}. {DESCRIPCION_VISTA_BALANCE}
        </p>
        {destino.tipo === "vuelatour" ? (
          <div className="flex flex-wrap gap-2 pt-1" aria-label="Libro">
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
      </div>

      <PeriodSelector initial={{ desde, hasta }} />

      {libro ? (
        <LibroExcel libro={libro} descarga={descarga} />
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
