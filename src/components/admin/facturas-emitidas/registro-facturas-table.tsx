"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { CobroEstadoBadge } from "@/components/admin/cobro-estado-badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { fmtDateOnly, fmtDateTime } from "@/lib/datetime";
import { fmtMonto } from "@/lib/format";
import {
  ETIQUETAS_ALERTA,
  hrefFacturas,
  semaforoDeCobro,
  type FiltrosFacturas,
} from "@/lib/admin/facturas-emitidas";
import { FacturaAccionesMenu, verArchivoFactura } from "./factura-acciones-menu";
import type { ClienteOpcion, EmisoraOpcion } from "./registrar-factura-dialog";
import type { FacturaEmitida } from "@/types/facturas-emitidas";

/** Razón social corta para la columna Emisor («Aero Charter Cancun»). */
function razonCorta(r: string): string {
  return r.replace(/,?\s*S\.?\s*A\.?(\s*de\s*C\.?\s*V\.?)?\.?$/i, "").trim();
}

/**
 * Tabla del REGISTRO de facturas emitidas (24-sep-2026, pedido de Ale: «que
 * estén por orden del número de la factura … y Ale las pueda filtrar
 * fácilmente y saber que esas facturas ya están emitidas, que no hay unas
 * duplicadas»). Las filas llegan YA filtradas y ordenadas por el API (el
 * filtro vive en la URL); el encabezado «Factura ↓/↑» invierte el orden por
 * número. Alertas y semáforo salen del API y de la fuente única del panel.
 */
export function RegistroFacturasTable({
  facturas,
  filtros,
  clientes,
  emisoras,
  huboCorte = false,
}: {
  facturas: FacturaEmitida[];
  filtros: FiltrosFacturas;
  clientes?: ClienteOpcion[];
  emisoras?: EmisoraOpcion[];
  huboCorte?: boolean;
}) {
  const router = useRouter();
  // La columna «Emisor» solo cuando las filas traen ≥2 razones sociales.
  const conEmisor = useMemo(
    () => new Set(facturas.map((f) => f.emisora?.id ?? "")).size >= 2,
    [facturas],
  );
  const asc = filtros.orden === "folio_asc";

  const columns = useMemo<Array<DataTableColumn<FacturaEmitida>>>(() => {
    const alternarOrden = () =>
      router.replace(hrefFacturas(filtros, { orden: asc ? "folio_desc" : "folio_asc" }));
    const cols: Array<DataTableColumn<FacturaEmitida>> = [
      {
        key: "factura",
        header: (
          <button
            type="button"
            onClick={alternarOrden}
            className="inline-flex cursor-pointer items-center gap-1 font-medium hover:text-foreground"
            title={
              asc
                ? "Ordenado del número menor al mayor. Clic: del mayor al menor."
                : "Ordenado del número mayor al menor. Clic: del menor al mayor."
            }
          >
            Factura {asc ? "↑" : "↓"}
          </button>
        ),
        cellClassName: "whitespace-nowrap",
        cell: (f) => (
          <span
            className={`font-mono text-sm tabular-nums ${
              f.estatus === "CANCELADA" ? "text-muted-foreground line-through" : "font-medium"
            }`}
            title={f.uuid ? `Folio fiscal: ${f.uuid}` : undefined}
          >
            {f.etiqueta}
          </span>
        ),
      },
    ];
    if (conEmisor) {
      cols.push({
        key: "emisor",
        header: "Emisor",
        cellClassName: "text-xs",
        cell: (f) =>
          f.emisora ? (
            <span title={f.emisora.razon_social}>{razonCorta(f.emisora.razon_social)}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      });
    }
    cols.push(
      {
        key: "fecha",
        header: "Fecha",
        cellClassName: "text-xs whitespace-nowrap",
        cell: (f) => fmtDateOnly(f.fecha_emision),
      },
      {
        key: "cliente",
        header: "Cliente",
        cell: (f) => (
          <>
            <p className="text-sm font-medium">{f.receptor_nombre ?? f.cliente?.nombre ?? "—"}</p>
            {f.receptor_rfc && (
              <p className="font-mono text-[10px] text-muted-foreground">{f.receptor_rfc}</p>
            )}
          </>
        ),
      },
      {
        key: "vuelos",
        header: "Vuelo(s)",
        noLink: true,
        cell: (f) =>
          f.vuelos.length === 0 ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <span className="inline-flex flex-col gap-0.5">
              {f.vuelos.map((v) => (
                <Link
                  key={v.id}
                  href={`/admin/flights/${v.id}`}
                  className="font-mono text-xs hover:underline underline-offset-2"
                  title={[
                    v.cliente_nombre,
                    v.fecha_vuelo ? fmtDateTime(v.fecha_vuelo) : null,
                    v.otras_vigentes.length > 0 ? `También: ${v.otras_vigentes.join(", ")}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  #{v.folio}
                  {v.estado === "CANCELADO" && (
                    <span className="ml-1 font-sans text-[10px] text-red-600 dark:text-red-400">
                      cancelado
                    </span>
                  )}
                </Link>
              ))}
            </span>
          ),
      },
      {
        key: "total",
        header: "Total",
        headClassName: "text-right",
        cellClassName: "text-right whitespace-nowrap",
        cell: (f) => (
          <span className="inline-flex flex-col items-end gap-0.5">
            <span
              className={`font-mono text-sm tabular-nums ${
                f.estatus === "CANCELADA" ? "text-muted-foreground" : ""
              }`}
            >
              {fmtMonto(f.total, f.moneda)}
            </span>
            {f.es_parcial && (
              <span
                className="rounded-full border border-border bg-muted/40 px-1.5 text-[10px] text-muted-foreground"
                title="Factura parcial (anticipo o finiquito)"
              >
                Parcial
              </span>
            )}
          </span>
        ),
      },
      {
        key: "metodo",
        header: "Método",
        cellClassName: "text-xs",
        cell: (f) =>
          f.metodo_pago ? (
            <span
              title={
                f.metodo_pago === "PUE"
                  ? "Pago en una sola exhibición"
                  : "Pago en parcialidades o diferido"
              }
            >
              {f.metodo_pago}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "cobro",
        header: "Cobro del vuelo",
        cell: (f) =>
          f.vuelos.length === 0 ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <span className="inline-flex flex-col items-start gap-1">
              {f.vuelos.map((v) => (
                <span key={v.id} className="inline-flex items-center gap-1">
                  {f.vuelos.length > 1 && (
                    <span className="font-mono text-[10px] text-muted-foreground">#{v.folio}</span>
                  )}
                  <CobroEstadoBadge estado={semaforoDeCobro(v.cobro)} />
                </span>
              ))}
            </span>
          ),
      },
      {
        key: "estatus",
        header: "Estatus",
        cell: (f) =>
          f.estatus === "VIGENTE" ? (
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
            >
              Vigente
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="border-border bg-muted/40 text-muted-foreground"
              title={
                f.cancelada
                  ? `Cancelada${f.cancelada.por_nombre ? ` por ${f.cancelada.por_nombre}` : ""}: ${f.cancelada.motivo}`
                  : "Cancelada"
              }
            >
              Cancelada
            </Badge>
          ),
      },
      {
        key: "pdf",
        header: "PDF",
        noLink: true,
        cell: (f) =>
          f.pdf ? (
            <button
              type="button"
              onClick={() => verArchivoFactura(f, "pdf")}
              className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title={`Ver PDF${f.pdf.nombre ? ` · ${f.pdf.nombre}` : ""}${f.pdf.subido_por_nombre ? ` · subió ${f.pdf.subido_por_nombre}` : ""}`}
              aria-label={`Ver el PDF de la factura ${f.etiqueta}`}
            >
              <DocumentTextIcon className="h-4 w-4" />
            </button>
          ) : (
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] text-amber-700 dark:text-amber-300">
              Sin PDF
            </span>
          ),
      },
      {
        key: "alertas",
        header: "Alertas",
        cell: (f) =>
          f.alertas.length === 0 ? null : (
            <span className="inline-flex flex-wrap gap-1">
              {f.alertas.map((a) => (
                <span
                  key={a}
                  className="rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap"
                  title={ETIQUETAS_ALERTA[a]?.title}
                >
                  {ETIQUETAS_ALERTA[a]?.label ?? a}
                </span>
              ))}
            </span>
          ),
      },
      {
        key: "acciones",
        header: "",
        headClassName: "w-10",
        noLink: true,
        cell: (f) => <FacturaAccionesMenu factura={f} clientes={clientes} emisoras={emisoras} />,
      },
    );
    return cols;
  }, [asc, conEmisor, clientes, emisoras, filtros, router]);

  return (
    <DataTable
      columns={columns}
      rows={facturas}
      rowKey={(f) => f.id}
      syncId="fe"
      huboCorte={huboCorte}
      defaultPageSize={50}
      rowClassName={(f) => (f.estatus === "CANCELADA" ? "opacity-70" : undefined)}
    />
  );
}
