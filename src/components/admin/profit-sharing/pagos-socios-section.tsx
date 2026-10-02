import Link from "next/link";
import { BanknotesIcon, CalendarDaysIcon } from "@heroicons/react/24/outline";
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
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TarjetaErrorCarga } from "@/components/admin/tarjeta-error-carga";
import { cn } from "@/lib/utils";
import { fmtDecimal, fmtUsd } from "@/lib/format";
import {
  AYUDA_PAGOS_FUERA_DEL_REPARTO,
  AYUDA_SECCION_PAGOS,
  TEXTO_ERROR_CARGA_PAGOS,
  TEXTO_PAGOS_NO_DISPONIBLES,
  TEXTO_SOLO_MES_COMPLETO,
  TITULO_PAGOS_FUERA_DEL_REPARTO,
  badgeSociosPendientes,
  hrefPagosSocios,
  mesAnterior,
  porSocioVisible,
  rangoMesPasado,
  textoAviones,
  textoVerMes,
  tituloSeccionPagos,
  type ModoPagosReparto,
} from "@/lib/admin/reparto-pagos";
import type { FilaPagoSocio } from "@/types/reparto-pagos";
import { EstadoPagoBadge } from "./estado-pago-badge";
import { PagosSocioDetalle } from "./pagos-socio-detalle";
import type { ContextoPagosAvion } from "./socios-section";

/**
 * «Pagos a socios · Septiembre 2026» (1-oct-2026): consolidado POR SOCIO del
 * mes (todas sus aeronaves) con utilidad, pagado, pendiente y estatus, más
 * los totales y «N socios con pago pendiente». Solo con un MES completo; un
 * SOCIO ve solo su renglón. Los números vienen del API tal cual.
 */
export function PagosSociosSection({
  modo,
  rol,
  meId,
  hoy,
}: {
  modo: ModoPagosReparto;
  rol: string | null;
  meId: string | null;
  /** Hoy en Cancún: con él, en un periodo que no es mes completo se ofrece
      «Ver <mes pasado>» (sin él, la sección no se pinta). */
  hoy?: string;
}) {
  if (modo.modo === "oculto") return null;

  if (modo.modo === "sin-mes") {
    // Al entrar la página abre el mes en curso cortado en hoy (no es mes
    // completo): UNA tarjeta compacta dice dónde están los pagos y lleva al
    // mes que se acaba de cerrar, para que nadie dependa de encontrar el
    // atajo del selector.
    const rango = hoy ? rangoMesPasado(hoy) : null;
    const mes = hoy ? mesAnterior(hoy) : null;
    if (!rango || !mes) return null;
    return (
      <Card data-seccion-pagos-socios="sin-mes">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <BanknotesIcon className="h-4 w-4 text-muted-foreground" />
                Pagos a socios
              </CardTitle>
              <CardDescription className="mt-1">{TEXTO_SOLO_MES_COMPLETO}</CardDescription>
            </div>
            <Link
              href={hrefPagosSocios(rango)}
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer gap-1.5")}
              data-accion="ver-mes-pagos-socios"
            >
              <CalendarDaysIcon className="h-4 w-4" aria-hidden />
              {textoVerMes(mes)}
            </Link>
          </div>
        </CardHeader>
      </Card>
    );
  }

  if (modo.modo === "error") {
    return (
      <TarjetaErrorCarga
        titulo={`${tituloSeccionPagos(modo.mes)}: no se pudieron cargar`}
        descripcion={TEXTO_ERROR_CARGA_PAGOS}
      />
    );
  }

  if (modo.modo === "no-disponible") {
    return (
      <Card data-seccion-pagos-socios="no-disponible">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BanknotesIcon className="h-4 w-4 text-muted-foreground" />
            {tituloSeccionPagos(modo.mes)}
          </CardTitle>
          <CardDescription>{TEXTO_PAGOS_NO_DISPONIBLES}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { datos, mes } = modo;
  const esSocio = rol === "SOCIO";
  const filas = porSocioVisible(datos.por_socio, rol, meId);
  const badge = badgeSociosPendientes(datos.totales, filas.length);

  return (
    <Card data-seccion-pagos-socios="ok">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <BanknotesIcon className="h-4 w-4 text-muted-foreground" />
              {tituloSeccionPagos(mes)}
            </CardTitle>
            <CardDescription className="mt-1">{AYUDA_SECCION_PAGOS}</CardDescription>
          </div>
          {!esSocio && (
            <Badge
              variant="outline"
              data-socios-pendientes={datos.totales.socios_pendientes}
              data-tono={badge.tono}
              className={badge.clase}
            >
              {badge.texto}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {filas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {esSocio
              ? "No tienes utilidad ni pagos registrados en este mes."
              : "Ningún socio tiene utilidad ni pagos registrados en este mes."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Socio</TableHead>
                <TableHead className="text-right">Utilidad del mes</TableHead>
                <TableHead className="text-right">Pagado</TableHead>
                <TableHead className="text-right">Pendiente</TableHead>
                <TableHead>Estatus</TableHead>
                <TableHead className="text-right">Aviones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((s) => (
                <TableRow key={s.socio.id} data-resumen-socio={s.socio.id}>
                  <TableCell className="text-sm font-medium">{s.socio.nombre}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fmtUsd(s.utilidad_usd)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fmtUsd(s.pagado_usd)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono text-sm ${
                      s.pendiente_usd > 0 ? "text-amber-700 dark:text-amber-400" : ""
                    }`}
                  >
                    {fmtUsd(s.pendiente_usd)}
                  </TableCell>
                  <TableCell>
                    <EstadoPagoBadge
                      estado={s.estado}
                      utilidadUsd={s.utilidad_usd}
                      pagadoUsd={s.pagado_usd}
                    />
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {textoAviones(s.aviones)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {!esSocio && (
              <TableFooter>
                <TableRow>
                  <TableCell className="text-sm font-semibold">Total</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">
                    {fmtUsd(datos.totales.utilidad_usd)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">
                    {fmtUsd(datos.totales.pagado_usd)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono text-sm font-semibold ${
                      datos.totales.pendiente_usd > 0 ? "text-amber-700 dark:text-amber-400" : ""
                    }`}
                  >
                    {fmtUsd(datos.totales.pendiente_usd)}
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Pagos del mes de aviones que NO tienen tarjeta en la página (el cálculo
 * solo trae aviones activos; el API manda igual sus renglones con pagos).
 * Sin este bloque esos pagos solo sumaban en «Pagado» y no se podían
 * revisar, corregir ni eliminar. No se ofrece «Registrar pago» (el socio ya
 * no es vigente ahí): solo la relación con «Editar» / «Eliminar».
 */
export function PagosFueraDelRepartoSection({
  filas,
  mes,
  contexto,
}: {
  filas: FilaPagoSocio[];
  mes: string;
  contexto: ContextoPagosAvion;
}) {
  if (filas.length === 0) return null;
  return (
    <Card data-pagos-fuera-del-reparto>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BanknotesIcon className="h-4 w-4 text-muted-foreground" />
          {TITULO_PAGOS_FUERA_DEL_REPARTO}
        </CardTitle>
        <CardDescription>{AYUDA_PAGOS_FUERA_DEL_REPARTO}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {filas.map((f) => (
          <div
            key={`${f.aeronave.id}|${f.socio.id}`}
            className="space-y-1.5 rounded-lg border border-border p-3"
            data-fila-fuera={`${f.aeronave.id}|${f.socio.id}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <span className="font-medium">{f.aeronave.matricula}</span>
                <span aria-hidden className="text-muted-foreground"> · </span>
                {f.socio.nombre}
                {f.porcentaje > 0 && (
                  <span className="ml-1.5 font-mono text-xs text-muted-foreground">
                    {fmtDecimal(f.porcentaje)}%
                  </span>
                )}
              </p>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">
                  Pagado <span className="font-mono text-foreground">{fmtUsd(f.pagado_usd)}</span>
                </span>
                <EstadoPagoBadge
                  estado={f.estado}
                  utilidadUsd={f.utilidad_usd}
                  pagadoUsd={f.pagado_usd}
                />
              </div>
            </div>
            <PagosSocioDetalle
              fila={f}
              mes={mes}
              puedeRegistrar={contexto.puedeRegistrar}
              usuarios={contexto.usuarios}
              me={contexto.me}
              hoy={contexto.hoy}
              vigente={false}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
