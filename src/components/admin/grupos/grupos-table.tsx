"use client";

import { DocumentArrowDownIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { CobroEstadoBadge } from "@/components/admin/cobro-estado-badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { estadoCobroSemaforo } from "@/lib/admin/cobros";
import { estadoGrupoBadge } from "@/lib/admin/grupos-ui";
import { fmtDate } from "@/lib/datetime";
import { fmtUsd } from "@/lib/format";
import type { EstadoGrupo } from "@/types/grupos";

/** Fila-viewmodel serializable que arma la página (lookups resueltos). */
export interface GrupoListRow {
  id: string;
  /** "G-12" */
  folioTexto: string;
  clienteNombre: string | null;
  esInterno: boolean;
  nombre: string;
  fechaVuelo: string | null;
  /** "CUN → CZA → CUN" */
  ruta: string;
  pasajerosTotal: number;
  /** Σ pax de los aviones vivos (≠ total = problema PAX). */
  paxAsignados: number;
  aviones: number;
  avionesCancelados: number;
  totalUsd: number;
  estado: EstadoGrupo;
  cobrados: number;
  facturados: number;
}

const columns: Array<DataTableColumn<GrupoListRow>> = [
  {
    key: "folio",
    header: "Folio",
    headClassName: "w-20",
    cellClassName: "font-mono text-xs",
    cell: (g) => g.folioTexto,
  },
  {
    key: "cliente",
    header: "Cliente / grupo",
    cell: (g) => (
      <>
        <p className="font-medium text-sm">{g.clienteNombre ?? "—"}</p>
        <p className="text-[11px] text-muted-foreground truncate max-w-[260px]" title={g.nombre}>
          {g.nombre}
        </p>
      </>
    ),
  },
  {
    key: "fecha",
    header: "Fecha",
    cellClassName: "text-xs",
    cell: (g) =>
      g.fechaVuelo ? (
        fmtDate(g.fechaVuelo)
      ) : (
        <Badge
          variant="outline"
          className="border-amber-500/50 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400"
        >
          Sin fecha
        </Badge>
      ),
  },
  {
    key: "ruta",
    header: "Ruta",
    cellClassName: "font-mono text-xs",
    cell: (g) => g.ruta || "—",
  },
  {
    key: "pax",
    header: "Pax",
    headClassName: "text-right",
    cellClassName: "text-right font-mono text-xs",
    cell: (g) =>
      g.paxAsignados === g.pasajerosTotal ? (
        <>{g.pasajerosTotal}</>
      ) : (
        <span
          className="text-amber-600 dark:text-amber-400"
          title={`Los aviones suman ${g.paxAsignados} pasajeros y el grupo es de ${g.pasajerosTotal}: revisa el grupo.`}
        >
          {g.paxAsignados}/{g.pasajerosTotal} ⚠
        </span>
      ),
  },
  {
    key: "aviones",
    header: "Aviones",
    headClassName: "text-center",
    cellClassName: "text-center text-xs",
    cell: (g) => (
      <span className="inline-flex flex-col items-center leading-tight">
        <span className="font-mono">{g.aviones}</span>
        {g.avionesCancelados > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {g.avionesCancelados} cancelado{g.avionesCancelados === 1 ? "" : "s"}
          </span>
        )}
      </span>
    ),
  },
  {
    key: "total",
    header: "Total USD",
    headClassName: "text-right",
    cellClassName: "text-right font-mono",
    cell: (g) => fmtUsd(g.totalUsd),
  },
  {
    key: "estado",
    header: "Estado",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (g) => {
      const b = estadoGrupoBadge(g.estado);
      return (
        <Badge variant={b.variant} className={b.className} title={b.title}>
          {b.label}
        </Badge>
      );
    },
  },
  {
    key: "cobro",
    header: "Cobro",
    headClassName: "text-center",
    cellClassName: "text-center",
    // La lista no trae el USD cobrado por hijo: el semáforo (fuente única
    // estadoCobroSemaforo) usa el conteo de hijos cobrados; "totalCobradoUsd
    // null" degrada a "Por cobrar" sin inventar parciales. El detalle sí
    // pinta Parcial con montos.
    cell: (g) => (
      <span className="inline-flex flex-col items-center gap-0.5">
        <CobroEstadoBadge
          estado={estadoCobroSemaforo({
            montoTotalUsd: g.totalUsd,
            cobrado: g.aviones > 0 && g.cobrados >= g.aviones,
            esInterno: g.esInterno,
            totalCobradoUsd: null,
            enCotizacion: g.estado === "RESERVA" || g.estado === "COTIZADO",
            cancelado: g.estado === "CANCELADO",
          })}
        />
        {g.aviones > 0 && g.estado !== "CANCELADO" && (
          <span className="text-[10px] text-muted-foreground">
            {g.cobrados}/{g.aviones} aviones
            {g.facturados > 0 ? ` · ${g.facturados} fact.` : ""}
          </span>
        )}
      </span>
    ),
  },
  {
    key: "pdf",
    header: "",
    headClassName: "w-12",
    cellClassName: "text-center",
    noLink: true,
    cell: (g) => (
      <a
        href={`/api/grupos/${g.id}/pdf`}
        target="_blank"
        rel="noopener"
        aria-label={`PDF de la cotización del grupo ${g.folioTexto}`}
        title="PDF de la cotización (se abre en otra pestaña)"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <DocumentArrowDownIcon className="h-4 w-4" />
      </a>
    ),
  },
];

export function GruposTable({
  rows,
  huboCorte = false,
}: {
  rows: GrupoListRow[];
  /** true = la página no logró cargar TODAS las filas (corte defensivo). */
  huboCorte?: boolean;
}) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      huboCorte={huboCorte}
      rowKey={(g) => g.id}
      rowHref={(g) => `/admin/quotes/grupo/${g.id}`}
      searchText={(g) =>
        `${g.folioTexto} ${g.clienteNombre ?? ""} ${g.nombre} ${g.ruta}`
      }
      searchPlaceholder="Buscar grupo (folio, cliente, nombre, ruta)…"
    />
  );
}
