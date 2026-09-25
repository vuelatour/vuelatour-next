"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import {
  CLASE_TONO,
  etiquetaEstadoConciliacion,
  hrefIngresos,
  type FiltrosIngresos,
} from "@/lib/admin/ingresos-ui";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { fmtMonto } from "@/lib/format";
import { fmtDateOnly } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { EntradaDinero, EstadoConciliacionEntrada } from "@/types/ingresos";

/** Badge de conciliación (fuente única de texto y color: `etiquetaEstadoConciliacion`). */
export function BadgeEstadoConciliacion({
  estado,
  className,
}: {
  estado: EstadoConciliacionEntrada | string | null | undefined;
  className?: string;
}) {
  const e = etiquetaEstadoConciliacion(estado);
  return (
    <Badge variant="outline" className={cn(CLASE_TONO[e.tono], className)} title={e.titulo}>
      {e.texto}
    </Badge>
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
 */
export function EntradasTable({
  entradas,
  filtros,
  huboCorte,
  syncId = "en",
}: {
  entradas: EntradaDinero[];
  filtros: FiltrosIngresos;
  huboCorte?: boolean;
  syncId?: string;
}) {
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
        cell: (e) => <BadgeEstadoConciliacion estado={e.conciliacion.estado} />,
      },
      {
        key: "registro",
        header: "Registró",
        cellClassName: "text-xs text-muted-foreground",
        cell: (e) => e.registrado_por_nombre ?? "—",
      },
    ],
    [filtros],
  );

  return (
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
  );
}
