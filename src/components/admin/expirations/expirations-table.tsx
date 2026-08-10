"use client";

import {
  ExclamationTriangleIcon,
  PaperClipIcon,
} from "@heroicons/react/24/outline";
import { fmtDateOnly } from "@/lib/datetime";
import { fmtDecimal } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { ExpirationActions } from "@/components/admin/expirations/expiration-actions";
import type {
  AircraftOption,
  EngineOption,
  PilotOption,
} from "@/components/admin/expirations/expiration-form-dialog";
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
}

export function ExpirationsTable({
  rows,
  documentTypes,
  aircraft,
  pilots,
  engines,
}: ExpirationsTableProps) {
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
          {e.archivo_url && (
            <div
              className="text-[10px] text-muted-foreground inline-flex items-center gap-1"
              title="Tiene copia del documento adjunta (ábrela desde ⋯ → Editar → Ver)"
            >
              <PaperClipIcon className="h-3 w-3" />
              Documento adjunto
            </div>
          )}
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
    {
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
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(e) => e.id}
      searchText={(e) =>
        `${e.tipo?.nombre ?? ""} ${e.objetivo} ${e.referencia ?? ""} ${ESTADO_LABELS[e.estado]}`
      }
      searchPlaceholder="Buscar vencimiento (documento, matrícula, piloto)…"
    />
  );
}
