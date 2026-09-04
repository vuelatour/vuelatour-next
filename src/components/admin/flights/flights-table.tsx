"use client";

import Link from "next/link";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { GrupoBadge } from "@/components/admin/grupos/grupo-badge";
import type { GrupoDeFila } from "@/components/admin/quotes/quotes-table";
import { CobroEstadoBadge } from "@/components/admin/cobro-estado-badge";
import { estadoCobroSemaforo } from "@/lib/admin/cobros";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { fmtDate } from "@/lib/datetime";
import { fmtUsd } from "@/lib/format";
import { ESTADO_LABELS, ESTADO_STYLES } from "@/lib/admin/estado-vuelo";
import type { EstadoVuelo } from "@/types/quotes-persisted";

/** Fila-viewmodel serializable: la página resuelve nombres/lookup y aplana. */
export interface FlightRow {
  id: string;
  folio: number;
  cliente_nombre: string | null;
  es_externo: boolean;
  operador_externo: string | null;
  /** Ruta completa ya unida, p. ej. "CUN → CTM → CUN". */
  ruta: string;
  matricula: string | null;
  piloto_nombre: string | null;
  fecha_vuelo: string | null;
  /** Cuándo se capturó (fecha_solicitud ?? created_at): ordena las filas SIN
      fecha de vuelo — las recién creadas van PRIMERO, no perdidas al fondo. */
  fecha_solicitud: string | null;
  monto_total_usd: string;
  estado: EstadoVuelo;
  falta_taco: boolean;
  /** SOLICITUD/COTIZADO: fila azul y el clic abre la cotización, no el vuelo. */
  en_cotizacion: boolean;
  // Semáforo de cobro (regla única en estadoCobroSemaforo).
  cobrado: boolean;
  es_interno: boolean;
  cotizacion_abierta: boolean;
  /** null = batch de cobros no disponible (rol sin acceso). */
  total_cobrado_usd: number | null;
  sin_tc_count: number;
  /** Hijo de una cotización de GRUPO (4-sep); null = vuelo normal. */
  grupo?: GrupoDeFila | null;
}

/** Destino del clic de fila (COTIZADO ya abre su detalle de vuelo). */
function hrefDeFila(v: FlightRow): string {
  return v.estado === "SOLICITUD" ? `/admin/quotes/${v.id}` : `/admin/flights/${v.id}`;
}

const columns: Array<DataTableColumn<FlightRow>> = [
  {
    key: "folio",
    header: "Folio",
    headClassName: "w-24",
    cellClassName: "font-mono text-xs",
    // noLink: el badge del grupo enlaza al GRUPO; la celda arma su propio
    // link de fila (mismo destino que el resto de la fila).
    noLink: true,
    cell: (v) => (
      <span className="inline-flex flex-col items-start gap-1">
        <Link href={hrefDeFila(v)} className="block hover:underline underline-offset-2">
          #{v.folio}
        </Link>
        {v.grupo && (
          <GrupoBadge
            grupoId={v.grupo.id}
            folio={v.grupo.folio}
            posicion={v.grupo.posicion}
            total={v.grupo.total}
            nombre={v.grupo.nombre}
            className="text-[10px] h-4 px-1.5"
          />
        )}
      </span>
    ),
  },
  {
    key: "cliente",
    header: "Cliente",
    cell: (v) => (
      <>
        <p className="font-medium text-sm">{v.cliente_nombre ?? "—"}</p>
        {v.es_externo && (
          <p className="text-[10px] text-muted-foreground">
            Externo {v.operador_externo ?? ""}
          </p>
        )}
      </>
    ),
  },
  {
    key: "ruta",
    header: "Ruta",
    cellClassName: "font-mono text-xs",
    cell: (v) => v.ruta,
  },
  {
    key: "aeronave",
    header: "Aeronave",
    cellClassName: "text-xs",
    cell: (v) =>
      v.es_externo ? (
        <Badge variant="outline" className="text-[10px]">
          Externo
        </Badge>
      ) : v.matricula ? (
        <span className="font-mono">{v.matricula}</span>
      ) : (
        <span className="text-muted-foreground">Sin asignar</span>
      ),
  },
  {
    key: "piloto",
    header: "Piloto",
    cellClassName: "text-xs",
    cell: (v) =>
      v.piloto_nombre ?? <span className="text-muted-foreground">Sin asignar</span>,
  },
  {
    key: "fecha",
    header: "Fecha vuelo",
    cellClassName: "text-xs",
    // Sin fecha = badge ámbar visible (no un guion que se confunde con
    // "perdido"): estas filas van al INICIO de la tabla.
    cell: (v) =>
      v.fecha_vuelo ? (
        fmtDate(v.fecha_vuelo)
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
    cell: (v) => fmtUsd(v.monto_total_usd),
  },
  {
    key: "cobro",
    header: "Cobro",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (v) => (
      <CobroEstadoBadge
        estado={estadoCobroSemaforo({
          montoTotalUsd: Number(v.monto_total_usd) || 0,
          cobrado: v.cobrado,
          esInterno: v.es_interno,
          totalCobradoUsd: v.total_cobrado_usd,
          sinTcCount: v.sin_tc_count,
          cotizacionAbierta: v.cotizacion_abierta,
          enCotizacion: v.en_cotizacion,
          cancelado: v.estado === "CANCELADO",
        })}
      />
    ),
  },
  {
    key: "estado",
    header: "Estado",
    headClassName: "text-center",
    cellClassName: "text-center",
    cell: (v) => (
      <div className="flex items-center justify-center gap-1.5">
        {v.falta_taco && (
          <span
            title="Tacómetro incompleto"
            className="inline-flex items-center text-amber-600 dark:text-amber-400"
          >
            <ExclamationTriangleIcon className="h-4 w-4" />
          </span>
        )}
        <Badge variant="outline" className={ESTADO_STYLES[v.estado]}>
          {ESTADO_LABELS[v.estado]}
        </Badge>
      </div>
    ),
  },
];

export function FlightsTable({
  rows,
  huboCorte = false,
}: {
  rows: FlightRow[];
  /** true = la página no logró cargar TODAS las filas (corte defensivo). */
  huboCorte?: boolean;
}) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      huboCorte={huboCorte}
      rowKey={(v) => v.id}
      // COTIZADO ya abre su DETALLE DE VUELO (petición del cliente, jul
      // 2026): la operación se prepara desde ahí y el banner del detalle
      // enlaza a la cotización. Solo SOLICITUD sigue yendo al cotizador
      // (aún no hay nada operativo que ver).
      rowHref={hrefDeFila}
      // Azul = aún en cotización (sin confirmar): identificable de un vistazo.
      rowClassName={(v) => (v.en_cotizacion ? "bg-sky-500/[0.07]" : undefined)}
      searchText={(v) =>
        `#${v.folio} ${v.cliente_nombre ?? ""} ${v.operador_externo ?? ""} ${v.ruta} ${v.matricula ?? ""} ${v.piloto_nombre ?? ""} ${v.grupo ? `G-${v.grupo.folio ?? ""} ${v.grupo.nombre ?? ""}` : ""}`
      }
      searchPlaceholder="Buscar vuelo (folio, cliente, ruta, matrícula, piloto)…"
    />
  );
}
