"use client";

import Link from "next/link";
import {
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
} from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { CobroEstadoBadge } from "@/components/admin/cobro-estado-badge";
import { estadoCobroSemaforo } from "@/lib/admin/cobros";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { fmtDate } from "@/lib/datetime";
import { fmtUsd } from "@/lib/format";
import { ESTADO_LABELS, ESTADO_STYLES } from "@/lib/admin/estado-vuelo";
import type { EstadoVuelo } from "@/types/quotes-persisted";

/** Fila-viewmodel serializable que arma la página (lookups ya resueltos). */
export interface QuoteListRow {
  id: string;
  folio: number;
  clienteNombre: string | null;
  esExterno: boolean;
  operadorExterno: string | null;
  /** Ruta ya unida, p. ej. "CUN → MID → CUN". */
  ruta: string;
  /** Avión cotizado: matrícula de la flota (o del avión ajeno en externos);
      null = sin avión asignado todavía. */
  avionMatricula: string | null;
  avionModelo: string | null;
  /** Aviones adicionales en cotizaciones multi-avión (0 = uno solo). */
  avionesExtra: number;
  fechaVuelo: string | null;
  /** Fecha de la solicitud (cuándo se capturó): ordena las filas SIN fecha
      de vuelo — las recién creadas van PRIMERO, no perdidas al fondo. */
  fechaSolicitud: string | null;
  montoTotalUsd: string;
  version: number;
  estado: EstadoVuelo;
  /** CONFIRMADO no externo sin piloto o sin avión asignado. */
  sinAsignar: boolean;
  faltaPiloto: boolean;
  // Semáforo de cobro (regla única en estadoCobroSemaforo).
  cobrado: boolean;
  esInterno: boolean;
  cotizacionAbierta: boolean;
  /** null = batch de cobros no disponible (rol sin acceso). */
  totalCobradoUsd: number | null;
  sinTcCount: number;
}

const columns: Array<DataTableColumn<QuoteListRow>> = [
  {
    key: "folio",
    header: "Folio",
    headClassName: "w-20",
    cellClassName: "font-mono text-xs",
    cell: (q) => <>#{q.folio}</>,
  },
  {
    key: "cliente",
    header: "Cliente",
    cell: (q) => (
      <>
        <p className="font-medium text-sm">{q.clienteNombre ?? "—"}</p>
        {q.esExterno && (
          <p className="text-[10px] text-muted-foreground">
            Externo {q.operadorExterno ?? ""}
          </p>
        )}
      </>
    ),
  },
  {
    key: "ruta",
    header: "Ruta",
    cellClassName: "font-mono text-xs",
    cell: (q) => q.ruta,
  },
  {
    key: "avion",
    header: "Avión",
    cellClassName: "text-xs",
    cell: (q) =>
      q.avionMatricula ? (
        <span className="inline-flex flex-col leading-tight">
          <span className="font-mono">
            {q.avionMatricula}
            {q.avionesExtra > 0 && (
              <span className="ml-1 text-[10px] text-muted-foreground">
                +{q.avionesExtra}
              </span>
            )}
          </span>
          {q.avionModelo && (
            <span className="text-[10px] text-muted-foreground">{q.avionModelo}</span>
          )}
        </span>
      ) : (
        <span className="text-[10px] text-muted-foreground">Sin avión</span>
      ),
  },
  {
    key: "fecha",
    header: "Fecha vuelo",
    cellClassName: "text-xs",
    // Sin fecha = badge ámbar visible (no un guion que se confunde con
    // "perdido"): estas filas van al INICIO de la tabla.
    cell: (q) =>
      q.fechaVuelo ? (
        fmtDate(q.fechaVuelo)
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
    key: "total",
    header: "Total USD",
    headClassName: "text-right",
    cellClassName: "text-right font-mono",
    cell: (q) => fmtUsd(q.montoTotalUsd),
  },
  {
    key: "cobro",
    header: "Cobro",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (q) => (
      <CobroEstadoBadge
        estado={estadoCobroSemaforo({
          montoTotalUsd: Number(q.montoTotalUsd) || 0,
          cobrado: q.cobrado,
          esInterno: q.esInterno,
          totalCobradoUsd: q.totalCobradoUsd,
          sinTcCount: q.sinTcCount,
          cotizacionAbierta: q.cotizacionAbierta,
          enCotizacion: q.estado === "SOLICITUD" || q.estado === "COTIZADO",
          cancelado: q.estado === "CANCELADO",
        })}
      />
    ),
  },
  {
    key: "version",
    header: "v",
    cellClassName: "text-xs text-muted-foreground",
    cell: (q) => <>v{q.version}</>,
  },
  {
    key: "estado",
    header: "Estado",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (q) => (
      <span className="inline-flex flex-col items-center gap-1">
        <Badge variant="outline" className={ESTADO_STYLES[q.estado]}>
          {ESTADO_LABELS[q.estado]}
        </Badge>
        {q.sinAsignar && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-violet-600 dark:text-violet-400">
            <ExclamationTriangleIcon className="h-3 w-3" />
            {q.faltaPiloto ? "Falta piloto" : "Falta avión"}
          </span>
        )}
      </span>
    ),
  },
  {
    key: "vuelo",
    header: "",
    headClassName: "w-12",
    cellClassName: "text-center",
    // La fila abre la COTIZACIÓN (acción principal); este atajo abre el
    // DETALLE DEL VUELO (escalas, asignación, tacos) desde COTIZADO en
    // adelante. SOLICITUD aún no tiene nada operativo que ver.
    noLink: true,
    cell: (q) =>
      q.estado !== "SOLICITUD" ? (
        <Link
          href={`/admin/flights/${q.id}`}
          aria-label={`Ver detalle del vuelo #${q.folio}`}
          title="Ver detalle del vuelo"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <PaperAirplaneIcon className="h-4 w-4" />
        </Link>
      ) : null,
  },
];

export function QuotesTable({
  quotes,
  huboCorte = false,
}: {
  quotes: QuoteListRow[];
  /** true = la página no logró cargar TODAS las filas (corte defensivo). */
  huboCorte?: boolean;
}) {
  return (
    <DataTable
      columns={columns}
      rows={quotes}
      huboCorte={huboCorte}
      rowKey={(q) => q.id}
      rowHref={(q) => `/admin/quotes/${q.id}`}
      searchText={(q) =>
        `#${q.folio} ${q.clienteNombre ?? ""} ${q.operadorExterno ?? ""} ${q.ruta} ${q.avionMatricula ?? ""}`
      }
      searchPlaceholder="Buscar cotización (folio, cliente, ruta, avión)…"
    />
  );
}
