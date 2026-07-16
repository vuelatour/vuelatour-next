"use client";

import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { ImagePreview } from "@/components/admin/image-preview";
import { FuelAssignFlight } from "@/components/admin/expenses/fuel-assign-flight";
import { fmtDateOnly, fmtDateTimeShort } from "@/lib/datetime";

/** Fila-viewmodel serializable que arma la página (lookups ya resueltos). */
export interface FuelLoadRow {
  id: string;
  aeronave_id: string | null;
  /** Matrícula ya resuelta desde aeronave_id (null si no hay). */
  matricula: string | null;
  fecha_hora_carga: string | null;
  fecha_gasto: string | null;
  tipo_combustible: "TURBOSINA" | "AVGAS" | null;
  litros: number | null;
  monto: number;
  moneda: string;
  lugar: string | null;
  medio_pago: string;
  tarjeta_terminacion: string | null;
  /** Titular de la tarjeta ya resuelto desde la terminación. */
  titular: string | null;
  /** URL firmada del recibo (bucket privado), ya resuelta. */
  fotoUrl: string | null;
  vuelo_id: string | null;
}

const columns: Array<DataTableColumn<FuelLoadRow>> = [
  {
    key: "aeronave",
    header: "Aeronave",
    cellClassName: "font-mono text-sm",
    cell: (l) => l.matricula ?? "—",
  },
  {
    key: "fecha",
    header: "Fecha",
    cellClassName: "text-xs",
    cell: (l) =>
      l.fecha_hora_carga
        ? fmtDateTimeShort(l.fecha_hora_carga)
        : l.fecha_gasto
          ? fmtDateOnly(l.fecha_gasto)
          : "—",
  },
  {
    key: "tipo",
    header: "Tipo",
    cellClassName: "text-xs",
    cell: (l) =>
      l.tipo_combustible ? (
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            l.tipo_combustible === "TURBOSINA"
              ? "bg-sky-500/15 text-sky-600 dark:text-sky-300"
              : "bg-amber-500/15 text-amber-600 dark:text-amber-300"
          }`}
        >
          {l.tipo_combustible === "TURBOSINA" ? "Turbosina" : "Gasavión"}
        </span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    key: "litros",
    header: "Litros",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (l) =>
      l.litros != null
        ? `${l.litros.toLocaleString("en-US", { maximumFractionDigits: 1 })} L`
        : "—",
  },
  {
    key: "monto",
    header: "Monto",
    headClassName: "text-right",
    cellClassName: "text-right font-mono",
    cell: (l) =>
      `${l.moneda} ${l.monto.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
  },
  {
    key: "costoLitro",
    header: "$/L",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-xs text-muted-foreground",
    cell: (l) => {
      const costoLitro =
        l.litros && l.litros > 0 && l.monto > 0 ? l.monto / l.litros : null;
      return costoLitro != null ? `$${costoLitro.toFixed(2)}` : "—";
    },
  },
  {
    key: "lugar",
    header: "Lugar",
    cellClassName: "text-xs font-mono",
    cell: (l) => l.lugar ?? "—",
  },
  {
    key: "pago",
    header: "Pago",
    cellClassName: "text-xs",
    cell: (l) =>
      l.medio_pago === "TARJETA_CORP" && l.tarjeta_terminacion ? (
        <span title={l.titular ?? undefined}>
          •••• {l.tarjeta_terminacion}
          {l.titular ? (
            <span className="block text-[10px] text-muted-foreground">
              {l.titular}
            </span>
          ) : null}
        </span>
      ) : (
        l.medio_pago
      ),
  },
  {
    key: "recibo",
    header: "Recibo",
    noLink: true,
    cell: (l) =>
      l.fotoUrl ? (
        <ImagePreview
          src={l.fotoUrl}
          alt="Recibo de combustible"
          thumbClassName="h-10 w-10 rounded-md object-cover ring-1 ring-border hover:ring-brand-500"
        />
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
  {
    key: "vuelo",
    header: "Vuelo",
    cellClassName: "text-xs",
    noLink: true,
    cell: (l) => (
      <div className="flex flex-col gap-1">
        {l.vuelo_id ? (
          <span className="space-x-2">
            <Link
              href={`/admin/flights/${l.vuelo_id}`}
              className="text-brand-600 hover:underline"
            >
              Vuelo
            </Link>
            <Link
              href={`/admin/quotes/${l.vuelo_id}`}
              className="text-brand-600 hover:underline"
            >
              Cotización
            </Link>
          </span>
        ) : null}
        <FuelAssignFlight
          gastoId={l.id}
          aeronaveId={l.aeronave_id}
          fechaHora={
            l.fecha_hora_carga ??
            (l.fecha_gasto ? `${l.fecha_gasto}T12:00:00Z` : null)
          }
          vueloActual={l.vuelo_id}
        />
      </div>
    ),
  },
];

export function FuelLoadsTable({ loads }: { loads: FuelLoadRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={loads}
      rowKey={(l) => l.id}
      searchText={(l) =>
        [
          l.matricula ?? "",
          l.lugar ?? "",
          l.tipo_combustible === "TURBOSINA"
            ? "Turbosina"
            : l.tipo_combustible === "AVGAS"
              ? "Gasavión"
              : "",
          l.tarjeta_terminacion ?? "",
          l.titular ?? "",
        ].join(" ")
      }
      searchPlaceholder="Buscar carga (matrícula, lugar, tipo)…"
    />
  );
}
