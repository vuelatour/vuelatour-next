"use client";

import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { FacturaActions } from "@/components/admin/invoices/factura-actions";
import { fmtDate } from "@/lib/datetime";
import type { Factura } from "@/types/invoices";

const ESTADO_STYLES: Record<string, string> = {
  TIMBRADA: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  CANCELADA: "bg-destructive/15 text-destructive border-destructive/30",
  ERROR: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
};

export function FacturasEmitidasTable({
  facturas,
  fileUrls,
}: {
  facturas: Factura[];
  /** URLs firmadas de descarga (path de storage → URL temporal). */
  fileUrls: Record<string, string>;
}) {
  const columns: Array<DataTableColumn<Factura>> = [
    {
      key: "uuid",
      header: "Folio fiscal (UUID)",
      cellClassName: "font-mono text-[11px]",
      cell: (f) => (
        <>
          {f.uuid_fiscal ?? "—"}
          {/* facturado_a_* ahora se persiste en TODAS las facturas
              (lo exige la cancelación): la leyenda 9.7 "SE FACTURÓ
              A" solo aplica cuando el receptor difiere del cliente
              del vuelo; público en general tiene su propia nota. */}
          {(() => {
            if (!f.facturado_a_rfc) return null;
            if (f.facturado_a_rfc === "XAXX010101000") {
              return (
                <span className="block text-[10px] text-muted-foreground">
                  PÚBLICO EN GENERAL
                </span>
              );
            }
            const cli = f.vuelo?.cliente;
            const clienteRfcVuelo = (Array.isArray(cli) ? cli[0] : cli)?.rfc ?? null;
            if (
              clienteRfcVuelo &&
              f.facturado_a_rfc.toUpperCase() === clienteRfcVuelo.toUpperCase()
            ) {
              return null;
            }
            return (
              <span
                className="block text-[10px] text-muted-foreground"
                title={`SE FACTURÓ A: ${f.facturado_a_nombre ?? ""} (${f.facturado_a_rfc})`}
              >
                SE FACTURÓ A: {f.facturado_a_rfc}
              </span>
            );
          })()}
        </>
      ),
    },
    {
      key: "tipo",
      header: "Tipo",
      cell: (f) => (
        <Badge
          variant="outline"
          className={
            f.tipo_comprobante === "E"
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
              : ""
          }
        >
          {f.tipo_comprobante === "E" ? "Nota crédito" : "Factura"}
        </Badge>
      ),
    },
    {
      key: "vuelo",
      header: "Vuelo",
      cellClassName: "font-mono text-xs",
      cell: (f) =>
        f.vuelo ? `#${f.vuelo.folio} · ${f.vuelo.origen_iata}→${f.vuelo.destino_iata}` : "—",
    },
    {
      key: "emisora",
      header: "Emisora",
      cellClassName: "text-xs",
      cell: (f) => f.emisora?.codigo ?? "—",
    },
    {
      key: "fecha",
      header: "Fecha",
      cellClassName: "text-xs",
      cell: (f) => (f.fecha_timbrado ? fmtDate(f.fecha_timbrado) : "—"),
    },
    {
      key: "total",
      header: "Total",
      headClassName: "text-right",
      cellClassName: "text-right font-mono text-xs",
      cell: (f) => `$${Number(f.total).toLocaleString("es-MX")} ${f.moneda}`,
    },
    {
      key: "estado",
      header: "Estado",
      headClassName: "text-center",
      cellClassName: "text-center",
      cell: (f) => (
        <Badge variant="outline" className={ESTADO_STYLES[f.estado] ?? ""}>
          {f.estado}
        </Badge>
      ),
    },
    {
      key: "archivos",
      header: "Archivos",
      cellClassName: "text-xs",
      noLink: true,
      cell: (f) => (
        <div className="flex gap-2">
          {f.xml_url && fileUrls[f.xml_url] ? (
            <a
              href={fileUrls[f.xml_url]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:underline"
            >
              XML
            </a>
          ) : null}
          {f.pdf_url && fileUrls[f.pdf_url] ? (
            <a
              href={fileUrls[f.pdf_url]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:underline"
            >
              PDF
            </a>
          ) : null}
          {!f.xml_url && !f.pdf_url ? <span className="text-muted-foreground">—</span> : null}
        </div>
      ),
    },
    {
      key: "acciones",
      header: "Acciones",
      headClassName: "text-right",
      cellClassName: "text-right",
      noLink: true,
      cell: (f) => (
        <div className="flex justify-end">
          <FacturaActions factura={f} />
        </div>
      ),
    },
  ];

  return (
    <DataTable
      // /admin/facturas tiene dos tablas: prefijo propio para no chocar
      syncId="fe"
      columns={columns}
      rows={facturas}
      rowKey={(f) => f.id}
      searchText={(f) =>
        `${f.uuid_fiscal ?? ""} ${f.vuelo ? `#${f.vuelo.folio} ${f.vuelo.origen_iata} ${f.vuelo.destino_iata}` : ""} ${
          f.emisora ? `${f.emisora.codigo} ${f.emisora.razon_social}` : ""
        } ${f.estado} ${f.facturado_a_rfc ?? ""} ${f.facturado_a_nombre ?? ""}`
      }
      searchPlaceholder="Buscar por UUID, folio de vuelo, emisora o RFC…"
    />
  );
}
