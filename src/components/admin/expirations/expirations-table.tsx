"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ExclamationTriangleIcon,
  PaperClipIcon,
} from "@heroicons/react/24/outline";
import { fmtDateOnly } from "@/lib/datetime";
import { fmtDecimal } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  DataTable,
  type DataTableColumn,
  type DataTableOrden,
} from "@/components/admin/data-table";
import { ExpirationActions } from "@/components/admin/expirations/expiration-actions";
import { VerDocumentoButton } from "@/components/admin/expirations/ver-documento-button";
import type {
  AircraftOption,
  EngineOption,
  PilotOption,
} from "@/components/admin/expirations/expiration-form-dialog";
import {
  ATAJOS_ORDEN_VENCIMIENTOS,
  ORDEN_VENCIMIENTOS_DEFAULT,
  direccionDeColumna,
  ordenAlPulsarColumna,
  ordenVencimientosDeUrl,
  ordenarVencimientos,
  resolverOrdenVencimientos,
  type ColumnaVencimientos,
  type EleccionOrden,
  type OrdenVencimientos,
} from "@/lib/admin/vencimientos-orden";
import type { DocumentType, EstadoVencimiento, Expiration } from "@/types/expirations";

const ESTADO_STYLES: Record<EstadoVencimiento, string> = {
  VIGENTE: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  PROXIMO: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  VENCIDO: "bg-destructive/15 text-destructive border-destructive/30",
  PERMANENTE: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  INDETERMINADO: "bg-muted text-muted-foreground border-border",
};

const ESTADO_LABELS: Record<EstadoVencimiento, string> = {
  VIGENTE: "Vigente",
  PROXIMO: "Próximo",
  VENCIDO: "Vencido",
  PERMANENTE: "Permanente",
  INDETERMINADO: "Sin dato",
};

/** Fila-viewmodel: la página (server) resuelve el objetivo (matrícula/piloto/motor). */
export type ExpirationRow = Expiration & { objetivo: string };

interface ExpirationsTableProps {
  rows: ExpirationRow[];
  documentTypes: DocumentType[];
  aircraft: AircraftOption[];
  pilots: PilotOption[];
  engines: EngineOption[];
  /** false para MECANICO: consulta la lista pero editar/borrar/ver documento
   *  son de oficina (el API le respondería 403 — no pintarle botones rotos). */
  canManage?: boolean;
  /**
   * `?orden=` ya validado por la página (server). Solo RESPALDO cuando no hay
   * router (tests): en el panel manda la URL viva (`useSearchParams`).
   */
  ordenInicial?: OrdenVencimientos;
}

/** Key de columna de la tabla → columna del orden. */
const COLUMNA_DE_KEY: Record<string, ColumnaVencimientos> = {
  vence: "vence",
  restante: "restante",
};

/**
 * Escribe `?orden=` SIN recargar ni ensuciar el historial (replaceState,
 * integrado con el router de Next; el mismo mecanismo que la búsqueda y la
 * página de DataTable). El default no se escribe: la URL limpia es la de
 * siempre. Conserva los demás parámetros (los filtros del server).
 */
function escribirOrdenEnUrl(orden: OrdenVencimientos) {
  const url = new URL(window.location.href);
  if (orden === ORDEN_VENCIMIENTOS_DEFAULT) url.searchParams.delete("orden");
  else url.searchParams.set("orden", orden);
  window.history.replaceState(null, "", url.toString());
}

/**
 * Tabla de Vencimientos — Documento · Objetivo · Vence · Restante · Estado · ⋯.
 *
 * Orden (26-oct-2026, pedido del cliente con «Vence» y «Restante» encerradas
 * en su captura): esos dos encabezados son clicables ↑/↓ y hay atajos
 * «Ordenar: Primero lo que vence antes · Primero lo que vence más tarde»
 * junto al buscador. Se aplica sobre la lista COMPLETA, antes de la búsqueda
 * y del paginado. Lógica pura en `lib/admin/vencimientos-orden.ts`; el valor
 * viaja en `?orden=` (default `vence`, fuera de la URL).
 */
export function ExpirationsTable({
  rows,
  documentTypes,
  aircraft,
  pilots,
  engines,
  canManage = true,
  ordenInicial = ORDEN_VENCIMIENTOS_DEFAULT,
}: ExpirationsTableProps) {
  // La URL VIVA manda (misma regla que inventario, AGENTS «Tablas de LISTA»):
  // al volver del detalle Next reusa el payload ya pintado de esta página y
  // `ordenInicial` sería el de la primera carga, no el que el operador eligió.
  const sp = useSearchParams();
  const ordenUrl = sp ? ordenVencimientosDeUrl(sp.get("orden")) : ordenInicial;
  // Clic = respuesta INMEDIATA: la elección local gana mientras la URL siga
  // en el valor sobre el que se tomó (ver `resolverOrdenVencimientos`).
  const [eleccion, setEleccion] = useState<EleccionOrden | null>(null);
  const resuelto = resolverOrdenVencimientos(eleccion, ordenUrl);
  if (resuelto.eleccion !== eleccion) setEleccion(resuelto.eleccion);
  const orden = resuelto.orden;

  const ordenadas = useMemo(() => ordenarVencimientos(rows, orden), [rows, orden]);

  const cambiarOrden = (nuevo: OrdenVencimientos) => {
    setEleccion({ base: ordenUrl, valor: nuevo });
    escribirOrdenEnUrl(nuevo);
  };

  const ordenTabla: DataTableOrden = {
    direccion: (key) => {
      const col = COLUMNA_DE_KEY[key];
      return col ? direccionDeColumna(col, orden) : null;
    },
    alPulsarColumna: (key) => {
      const col = COLUMNA_DE_KEY[key];
      if (col) cambiarOrden(ordenAlPulsarColumna(col, orden));
    },
    atajos: ATAJOS_ORDEN_VENCIMIENTOS,
    atajoActivo: orden,
    alElegirAtajo: (valor) => cambiarOrden(ordenVencimientosDeUrl(valor)),
  };

  const columns: Array<DataTableColumn<ExpirationRow>> = [
    {
      key: "documento",
      header: "Documento",
      cellClassName: "text-sm",
      cell: (e) => (
        <>
          <div className="flex items-center gap-1.5">
            {e.tipo?.es_critico && (
              <span title="Documento crítico" className="text-destructive">
                <ExclamationTriangleIcon className="h-3.5 w-3.5" />
              </span>
            )}
            <span className="font-medium">{e.tipo?.nombre ?? "—"}</span>
          </div>
          {e.referencia && (
            <div className="text-[10px] text-muted-foreground">Ref. {e.referencia}</div>
          )}
          {e.archivo_url &&
            (canManage ? (
              <VerDocumentoButton
                expirationId={e.id}
                label="Ver documento"
                className="text-[10px] text-brand-600 hover:underline inline-flex items-center gap-1"
              />
            ) : (
              <div
                className="text-[10px] text-muted-foreground inline-flex items-center gap-1"
                title="Tiene copia adjunta; solo la oficina puede abrirla"
              >
                <PaperClipIcon className="h-3 w-3" />
                Documento adjunto
              </div>
            ))}
        </>
      ),
    },
    {
      key: "objetivo",
      header: "Objetivo",
      cellClassName: "text-sm font-mono",
      cell: (e) => e.objetivo,
    },
    {
      key: "vence",
      header: "Vence",
      ordenable: true,
      cellClassName: "text-xs",
      cell: (e) =>
        e.vence_por === "FECHA" && e.fecha_vencimiento
          ? fmtDateOnly(e.fecha_vencimiento)
          : e.vence_por === "HORAS" && e.horas_limite
            ? // Por horas Y calendario a la vez: manda lo que ocurra primero.
              `${fmtDecimal(e.horas_limite)} hrs${e.fecha_vencimiento ? ` · ${fmtDateOnly(e.fecha_vencimiento)}` : ""}`
            : "Permanente",
    },
    {
      key: "restante",
      header: "Restante",
      ordenable: true,
      headClassName: "text-right",
      cellClassName: "text-right text-xs font-mono",
      cell: (e) => {
        const dias =
          e.dias_restantes !== null
            ? e.dias_restantes < 0
              ? `hace ${Math.abs(e.dias_restantes)} d`
              : `${e.dias_restantes} d`
            : null;
        const horas =
          e.horas_restantes !== null
            ? `${fmtDecimal(e.horas_restantes)} hrs`
            : null;
        // Doble límite (horas + calendario): se muestran ambos restantes.
        return dias && horas ? `${horas} · ${dias}` : (dias ?? horas ?? "—");
      },
    },
    {
      key: "estado",
      header: "Estado",
      headClassName: "text-center",
      cellClassName: "text-center",
      cell: (e) => (
        <Badge variant="outline" className={ESTADO_STYLES[e.estado]}>
          {ESTADO_LABELS[e.estado]}
        </Badge>
      ),
    },
  ];

  if (canManage) {
    columns.push({
      key: "acciones",
      header: "",
      headClassName: "w-12",
      noLink: true,
      cell: (e) => (
        <ExpirationActions
          expiration={e}
          documentTypes={documentTypes}
          aircraft={aircraft}
          pilots={pilots}
          engines={engines}
        />
      ),
    });
  }

  return (
    <DataTable
      columns={columns}
      rows={ordenadas}
      orden={ordenTabla}
      rowKey={(e) => e.id}
      searchText={(e) =>
        `${e.tipo?.nombre ?? ""} ${e.objetivo} ${e.referencia ?? ""} ${ESTADO_LABELS[e.estado]}`
      }
      searchPlaceholder="Buscar vencimiento (documento, matrícula, piloto)…"
    />
  );
}
