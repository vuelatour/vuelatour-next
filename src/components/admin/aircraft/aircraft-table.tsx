"use client";

import Link from "next/link";
import { ChevronRightIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { fmtUsd } from "@/lib/format";
import type { Aircraft } from "@/types/aircraft";

const columns: Array<DataTableColumn<Aircraft>> = [
  {
    key: "aeronave",
    header: "Aeronave",
    cell: (a) => (
      <div className="flex items-center gap-3">
        {a.imagen_principal_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={a.imagen_principal_url}
            alt={a.matricula}
            className="h-10 w-14 shrink-0 rounded-md object-cover ring-1 ring-border"
          />
        ) : (
          <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <PaperAirplaneIcon className="h-4 w-4" />
          </div>
        )}
        <span>
          <span className="flex items-center gap-2 font-mono font-semibold group-hover:text-brand-600 transition-colors">
            {/* Color del avión en el calendario (pedido 21-ago): un punto
                discreto, el mismo que pinta sus vuelos y el Libro Dinero. */}
            {a.color_calendario && (
              <span
                aria-hidden
                title={`Color en el calendario: ${a.color_calendario}`}
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-border"
                style={{ backgroundColor: a.color_calendario }}
              />
            )}
            {a.matricula}
          </span>
          <span className="block text-xs text-muted-foreground">{a.modelo}</span>
        </span>
      </div>
    ),
  },
  {
    key: "pais",
    header: "País",
    cell: (a) => (
      <Badge variant="outline" className="font-mono text-xs">
        {a.pais_registro}
      </Badge>
    ),
  },
  {
    key: "motores",
    header: "Motores",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (a) => a.num_motores,
  },
  {
    key: "pax",
    header: "Pax",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (a) => a.asientos,
  },
  {
    key: "ultimo_taco",
    header: "Último taco",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (a) =>
      a.ultimo_taco != null ? (
        `${Number(a.ultimo_taco).toFixed(1)} h`
      ) : (
        <span className="text-xs font-sans text-muted-foreground">—</span>
      ),
  },
  {
    key: "tarifa_pub",
    header: "USD/hr público",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (a) =>
      a.tarifa_hora_pub_usd ? (
        fmtUsd(a.tarifa_hora_pub_usd)
      ) : (
        <span className="text-xs font-sans text-amber-600">Sin tarifa</span>
      ),
  },
  {
    key: "tarifa_broker",
    header: "USD/hr broker",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-sm",
    cell: (a) =>
      a.tarifa_hora_broker_usd ? (
        fmtUsd(a.tarifa_hora_broker_usd)
      ) : (
        <span className="text-xs font-sans text-amber-600">Sin tarifa</span>
      ),
  },
  {
    key: "estado",
    header: "Estado",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (a) =>
      !a.activa ? (
        <Badge variant="secondary">Inactiva</Badge>
      ) : a.apto === false ? (
        // Motivos en el tooltip; el detalle trae el desglose completo.
        <Badge
          className="bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/20 cursor-help"
          title={(a.no_apto_razones ?? []).join("\n")}
        >
          No apto
        </Badge>
      ) : (
        <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
          Apta
        </Badge>
      ),
  },
  {
    key: "ver",
    header: "",
    headClassName: "w-8",
    cellClassName: "text-right",
    // Link propio para conservar el aria-label descriptivo por matrícula.
    noLink: true,
    cell: (a) => (
      <Link
        href={`/admin/aircraft/${a.id}`}
        className="block"
        aria-label={`Ver ${a.matricula}`}
      >
        <ChevronRightIcon className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </Link>
    ),
  },
];

/** Listado de la flota (catálogo chico: sin buscador). */
export function AircraftTable({ aircraft }: { aircraft: Aircraft[] }) {
  return (
    <DataTable
      columns={columns}
      rows={aircraft}
      rowKey={(a) => a.id}
      rowHref={(a) => `/admin/aircraft/${a.id}`}
      rowClassName={(a) =>
        "group transition-colors" + (a.activa ? "" : " opacity-60")
      }
    />
  );
}
