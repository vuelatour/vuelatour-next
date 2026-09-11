"use client";

import { useState } from "react";
import {
  DocumentArrowDownIcon,
  TableCellsIcon,
  ArchiveBoxArrowDownIcon,
} from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { descargarDelApi } from "@/lib/download";
import { rutaPdfReparto } from "@/lib/admin/pdf-urls";

type Kind = "xlsx" | "dinero" | "cierre";

export function ReportDownloads({
  desde,
  hasta,
  rol,
}: {
  desde: string;
  hasta: string;
  /** Cada botón se pinta SOLO si el rol puede usar su endpoint (antes el
   *  ANALISTA veía "Cierre (zip)" que siempre le respondía 403). */
  rol?: string;
}) {
  const [loading, setLoading] = useState<Kind | null>(null);
  const esAdmin = !rol || rol === "ADMIN";
  const veExcel = esAdmin || rol === "ANALISTA";
  const veCierre = esAdmin || rol === "FACTURACION";

  const download = async (kind: Kind, path: string, filename: string) => {
    setLoading(kind);
    const err = await descargarDelApi(path, {
      filename,
      query: { desde, hasta },
    });
    if (err) toast.error("No se pudo generar el reporte", { description: err });
    setLoading(null);
  };

  return (
    <div className="flex gap-2 flex-wrap">
      {/* PDF socios: se abre por la URL del proxy (nunca `blob:`, si no el
          botón «Descargar» del visor de Chrome falla). */}
      <a
        href={rutaPdfReparto(desde, hasta)}
        target="_blank"
        rel="noopener"
        className={`${buttonVariants({ variant: "outline", size: "sm" })} gap-2`}
        title="Ver el PDF del reparto en una pestaña."
      >
        <DocumentArrowDownIcon className="h-4 w-4" />
        PDF socios
      </a>
      {veExcel && (
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={loading !== null}
          onClick={() =>
            download("xlsx", "/v1/profit-sharing/xlsx", `reporte-mensual-${desde}-a-${hasta}.xlsx`)
          }
        >
          <TableCellsIcon className="h-4 w-4" />
          {loading === "xlsx" ? "Generando…" : "Excel mensual"}
        </Button>
      )}
      {veExcel && (
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={loading !== null}
          onClick={() =>
            download("dinero", "/v1/profit-sharing/dinero.xlsx", `dinero-${desde}-a-${hasta}.xlsx`)
          }
          title="Libro «Dinero» del periodo (réplica del control manual): dinero-vlos con filas coloreadas por avión y clave vt+cliente, otros ingresos, otros gastos y utilidades. La comisión del vendedor va en «otros ingresos» (ingreso de VuelaTour) con su pago al vendedor provisionado en la misma fila; el costo proveedor sigue vacío hasta definir su regla."
        >
          <TableCellsIcon className="h-4 w-4" />
          {loading === "dinero" ? "Generando…" : "Dinero (Excel)"}
        </Button>
      )}
      {veCierre && (
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={loading !== null}
          onClick={() =>
            download("cierre", "/v1/invoices/cierre", `cierre-${desde}-a-${hasta}.zip`)
          }
          title="Paquete .zip: reporte por avión en Excel + XML/PDF de las facturas timbradas del periodo."
        >
          <ArchiveBoxArrowDownIcon className="h-4 w-4" />
          {loading === "cierre" ? "Generando…" : "Cierre (zip)"}
        </Button>
      )}
    </div>
  );
}
