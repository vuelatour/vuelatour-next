"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { EntradaBancoSheet, useDetalleBancoEntrada } from "@/components/admin/ingresos/entrada-banco-sheet";
import {
  CLASE_TONO,
  etiquetaEstadoConciliacion,
  hrefIngresos,
  tituloBadgeEntrada,
  tituloConClic,
  type ContextoEstadoConciliacion,
  type FiltrosIngresos,
} from "@/lib/admin/ingresos-ui";
import { chipParcialEntrada } from "@/lib/admin/cobro-banco";
import {
  abreDetalleEntrada,
  filaBancoDeEntrada,
  filaBancoDeIngreso,
  nombreAccesibleEntrada,
} from "@/lib/admin/entrada-banco";
import { puedeVerDetalleBanco } from "@/lib/admin/hoja-banco";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { fmtMonto } from "@/lib/format";
import { fmtDateOnly } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { EntradaDinero, EstadoConciliacionEntrada, Ingreso } from "@/types/ingresos";

/**
 * Badge de conciliación (fuente única de texto y color: `etiquetaEstadoConciliacion`).
 *
 * 15-oct-2026 («conciliación al revés» de una entrada, API 0.0.78): con
 * `alAbrir` (solo ADMIN/FACTURACION, o rol desconocido) Conciliado,
 * Conciliado vía anticipo y Sin conciliar —también el de un parcial, que
 * sigue diciendo «Sin conciliar» con el chip del 0.0.78 al lado— son un BOTÓN
 * que abre la hoja «Conciliación con el banco»: mismo color, cursor de mano,
 * `aria-haspopup="dialog"`, el `title` con lo que hace el clic y un nombre
 * accesible que empieza con el texto visible. «No se concilia uno a uno» y
 * «—» nunca son botón. Sin `alAbrir`, el marcado de siempre. `contexto` solo
 * cambia el `title` de «No se concilia uno a uno» (por método). Un PARCIAL
 * lleva su propio `title` (`tituloBadgeEntrada`, revisión del 15-oct-2026: el
 * de SIN_CONCILIAR decía «Ningún abono… está ligado» junto al chip que dice
 * cuánto falta); el texto visible sigue siendo «Sin conciliar».
 */
export function BadgeEstadoConciliacion({
  estado,
  parcial = false,
  contexto,
  alAbrir,
  nombreAccesible,
  className,
}: {
  estado: EstadoConciliacionEntrada | string | null | undefined;
  /** El cobro tiene abonos que no lo completan (el chip del 0.0.78): la hoja dice PARCIAL. */
  parcial?: boolean;
  contexto?: ContextoEstadoConciliacion | null;
  alAbrir?: (() => void) | null;
  nombreAccesible?: string;
  className?: string;
}) {
  const e = etiquetaEstadoConciliacion(estado, contexto);
  const estadoHoja = estado === "SIN_CONCILIAR" && parcial ? "PARCIAL" : estado;
  const titulo = tituloBadgeEntrada(estado, parcial, contexto);
  if (alAbrir && abreDetalleEntrada(estadoHoja)) {
    return (
      <Badge
        variant="outline"
        className={cn(CLASE_TONO[e.tono], "cursor-pointer hover:bg-muted/60", className)}
        title={tituloConClic(titulo, estadoHoja)}
        render={
          <button type="button" aria-haspopup="dialog" aria-label={nombreAccesible ?? e.texto} onClick={alAbrir} />
        }
      >
        {e.texto}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn(CLASE_TONO[e.tono], className)} title={titulo}>
      {e.texto}
    </Badge>
  );
}

/** El `title` por método de «No se concilia uno a uno» de una fila de «Todos» / «Cobros de vuelos». */
function contextoDeEntrada(e: Pick<EntradaDinero, "origen" | "metodo" | "es_reembolso">): ContextoEstadoConciliacion {
  return { metodo: e.metodo, esReembolso: e.es_reembolso === true, ingresoSinCuenta: e.origen === "INGRESO" };
}

/**
 * Chip ámbar «Parcial · faltan $1,700 MXN» junto al badge «Sin conciliar» de
 * un cobro con abonos del banco que no lo completan (14-oct-2026, API 0.0.78:
 * `conciliacion.parcial`; texto y tooltip de `chipParcialEntrada`).
 * Informativo: no es botón. Sin el campo, nada (como hoy).
 */
export function ChipParcialEntrada({
  entrada,
}: {
  entrada: Pick<EntradaDinero, "moneda" | "conciliacion">;
}) {
  const chip = chipParcialEntrada(entrada);
  if (!chip) return null;
  return (
    <span
      className="inline-flex items-center rounded-full border border-amber-500/50 bg-amber-500/10 px-1.5 text-[10px] font-medium whitespace-nowrap text-amber-700 dark:text-amber-300"
      title={chip.titulo}
      data-chip-parcial
    >
      {chip.texto}
    </span>
  );
}

/**
 * La celda «Conciliación» de una entrada: el badge de siempre y, si el cobro
 * es PARCIAL (API 0.0.78), el chip al lado (informativo: un solo control
 * pulsable por celda). Con `alAbrir` (15-oct-2026) el badge abre la hoja
 * «Conciliación con el banco». Sin parcial ni `alAbrir`, el marcado de hoy.
 */
export function CeldaConciliacionEntrada({
  entrada,
  alAbrir,
}: {
  entrada: EntradaDinero;
  alAbrir?: (() => void) | null;
}) {
  const visible = etiquetaEstadoConciliacion(entrada.conciliacion.estado).texto;
  const badge = (
    <BadgeEstadoConciliacion
      estado={entrada.conciliacion.estado}
      parcial={!!entrada.conciliacion.parcial}
      contexto={contextoDeEntrada(entrada)}
      alAbrir={alAbrir}
      nombreAccesible={alAbrir ? nombreAccesibleEntrada(visible, filaBancoDeEntrada(entrada)) : undefined}
    />
  );
  if (!entrada.conciliacion.parcial) return badge;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {badge}
      <ChipParcialEntrada entrada={entrada} />
    </span>
  );
}

/**
 * La celda «Conciliación» de un ingreso o un anticipo («Otros ingresos» y
 * «Anticipos»): el badge con su `title` por método y, con `alAbrir`, el botón
 * que abre la hoja. Un ingreso dado de baja nunca es botón.
 */
export function CeldaConciliacionIngreso({
  ingreso,
  alAbrir,
}: {
  ingreso: Ingreso;
  alAbrir?: (() => void) | null;
}) {
  const fila = filaBancoDeIngreso(ingreso);
  const abre = !!alAbrir && abreDetalleEntrada(fila.estado, { baja: fila.baja });
  return (
    <BadgeEstadoConciliacion
      estado={ingreso.conciliacion.estado}
      contexto={{ metodo: ingreso.metodo, ingresoSinCuenta: ingreso.cuenta_bancaria_id == null }}
      alAbrir={abre ? alAbrir : undefined}
      nombreAccesible={
        abre ? nombreAccesibleEntrada(etiquetaEstadoConciliacion(ingreso.conciliacion.estado).texto, fila) : undefined
      }
    />
  );
}

/** Chip «Del anticipo ING-12» de un cobro aplicado de un anticipo. */
export function ChipDelAnticipo({
  etiqueta,
  href,
  titulo,
}: {
  etiqueta: string;
  href?: string;
  titulo?: string;
}) {
  const clase =
    "inline-flex items-center rounded-full border border-sky-500/40 bg-sky-500/10 px-1.5 text-[10px] font-medium text-sky-700 dark:text-sky-300";
  const t = titulo ?? "Este cobro salió de un anticipo registrado en Ingresos.";
  return href ? (
    <Link href={href} className={cn(clase, "cursor-pointer hover:bg-sky-500/20")} title={t}>
      Del anticipo {etiqueta}
    </Link>
  ) : (
    <span className={clase} title={t}>
      Del anticipo {etiqueta}
    </span>
  );
}

/**
 * «Todos» y «Cobros de vuelos» (24-sep-2026): TODO el dinero que entró en el
 * periodo — cobros de vuelos (solo lectura: se registran en cada vuelo) e
 * ingresos. Un cobro que salió de un anticipo se ve en gris: no suma al total
 * porque ese dinero ya entró como anticipo. Los reembolsos van en rojo.
 *
 * 15-oct-2026 (API 0.0.78): el badge de «Conciliación» abre la hoja
 * «Conciliación con el banco» (UNA por tabla) para ADMIN y FACTURACION
 * (`puedeVerDetalleBanco(rol)`); para COORDINADOR, el marcado de siempre.
 */
export function EntradasTable({
  entradas,
  filtros,
  rol,
  huboCorte,
  syncId = "en",
}: {
  entradas: EntradaDinero[];
  filtros: FiltrosIngresos;
  /** Rol de quien mira (`/me`): el clic del badge solo con `puedeVerDetalleBanco`. */
  rol?: string | null;
  huboCorte?: boolean;
  syncId?: string;
}) {
  const detalleBanco = useDetalleBancoEntrada();
  const abrirBanco = puedeVerDetalleBanco(rol) ? detalleBanco.abrir : null;
  const columns = useMemo<Array<DataTableColumn<EntradaDinero>>>(
    () => [
      {
        key: "dia",
        header: "Fecha",
        cellClassName: "whitespace-nowrap",
        cell: (e) => fmtDateOnly(e.dia),
      },
      {
        key: "que",
        header: "Qué",
        noLink: true,
        cell: (e) => (
          <span className="block min-w-[140px]">
            {e.origen === "COBRO_VUELO" && e.vuelo_id ? (
              <Link href={`/admin/flights/${e.vuelo_id}#cobros`} className="font-medium text-brand-600 hover:underline">
                {e.etiqueta}
              </Link>
            ) : e.origen === "INGRESO" ? (
              <Link
                href={hrefIngresos(filtros, { ingreso: e.id })}
                scroll={false}
                className="font-medium text-brand-600 hover:underline"
              >
                {e.etiqueta}
              </Link>
            ) : (
              <span className="font-medium">{e.etiqueta}</span>
            )}
            <span className="block text-[11px] text-muted-foreground">{e.categoria_etiqueta}</span>
            <span className="mt-0.5 flex flex-wrap gap-1">
              {e.grupo_folio != null && (
                <span className="inline-flex rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-1.5 text-[10px] text-fuchsia-700 dark:text-fuchsia-300">
                  Grupo {folioTexto(e.grupo_folio)}
                </span>
              )}
              {e.por_volar && (
                <span
                  className="inline-flex rounded-full border border-slate-500/30 bg-slate-500/10 px-1.5 text-[10px] text-slate-600 dark:text-slate-300"
                  title="Depósito de un vuelo que aún no vuela: ya está registrado en su vuelo."
                >
                  Por volar
                </span>
              )}
              {e.anticipo_etiqueta && <ChipDelAnticipo etiqueta={e.anticipo_etiqueta} />}
            </span>
          </span>
        ),
      },
      {
        key: "cliente",
        header: "Cliente",
        cellClassName: "text-sm",
        cell: (e) => e.cliente_nombre ?? "—",
      },
      {
        key: "concepto",
        header: "Concepto",
        cellClassName: "max-w-[240px] truncate text-xs text-muted-foreground",
        cell: (e) => <span title={e.concepto ?? undefined}>{e.concepto ?? "—"}</span>,
      },
      {
        key: "metodo",
        header: "Método",
        cellClassName: "whitespace-nowrap text-xs",
        cell: (e) => e.metodo_etiqueta,
      },
      {
        key: "monto",
        header: "Monto",
        headClassName: "text-right",
        cellClassName: "text-right tabular-nums whitespace-nowrap",
        cell: (e) => (
          <span
            className={cn(
              "block font-mono",
              e.es_reembolso || e.monto < 0
                ? "text-red-600 dark:text-red-400"
                : !e.cuenta_en_total
                  ? "text-muted-foreground"
                  : "font-semibold",
            )}
            title={
              !e.cuenta_en_total
                ? "No suma al total: el dinero entró como anticipo."
                : e.es_reembolso
                  ? "Reembolso al cliente: resta de lo cobrado."
                  : undefined
            }
          >
            {fmtMonto(e.monto, e.moneda)}
            {e.comision != null && e.comision > 0 && (
              <span className="block text-[10px] font-sans font-normal text-muted-foreground">
                neto {fmtMonto(e.neto)}
              </span>
            )}
          </span>
        ),
      },
      {
        key: "conciliacion",
        header: "Conciliación",
        // El badge abre la hoja «Conciliación con el banco» (botón): la
        // celda no navega. «Parcial · faltan $X» (API 0.0.78) al lado.
        noLink: true,
        cell: (e) => (
          <CeldaConciliacionEntrada
            entrada={e}
            alAbrir={abrirBanco ? () => abrirBanco(filaBancoDeEntrada(e)) : undefined}
          />
        ),
      },
      {
        key: "registro",
        header: "Registró",
        cellClassName: "text-xs text-muted-foreground",
        cell: (e) => e.registrado_por_nombre ?? "—",
      },
    ],
    [filtros, abrirBanco],
  );

  return (
    <>
      <DataTable
        syncId={syncId}
        columns={columns}
        rows={entradas}
        rowKey={(e) => `${e.origen}:${e.id}`}
        searchText={(e) =>
          `${e.etiqueta} ${e.categoria_etiqueta} ${e.cliente_nombre ?? ""} ${e.concepto ?? ""} ${e.metodo_etiqueta} ${e.monto} ${
            e.anticipo_etiqueta ?? ""
          }`
        }
        searchPlaceholder="Buscar (vuelo, ING-n, cliente, concepto, monto)…"
        huboCorte={huboCorte}
      />
      <EntradaBancoSheet detalle={detalleBanco} />
    </>
  );
}
