"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { BadgeEstadoConciliacion } from "@/components/admin/ingresos/entradas-table";
import {
  DialogosIngreso,
  IngresoMenu,
  type AccionIngreso,
} from "@/components/admin/ingresos/ingresos-table";
import type { CatalogosIngreso } from "@/components/admin/ingresos/registrar-ingreso-dialog";
import { etiquetaIngreso } from "@/lib/admin/categorias-ingreso";
import { hrefIngresos, type FiltrosIngresos } from "@/lib/admin/ingresos-ui";
import { fmtMonto } from "@/lib/format";
import { fmtDateOnly } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { Ingreso } from "@/types/ingresos";

/**
 * «Anticipos sin vuelo» (24-sep-2026): dinero de un cliente que llegó ANTES de
 * que existiera su vuelo. Queda FUERA de resultados hasta aplicarse a un vuelo
 * (ahí se vuelve un cobro normal del vuelo). Aplicado y saldo los calcula el
 * API; «Con saldo» (default) lista TODOS los que tienen saldo, de cualquier
 * fecha. Los vuelos a los que se aplicó se ven en el detalle (Ver).
 */
export function AnticiposTable({
  anticipos,
  filtros,
  catalogos,
  huboCorte,
}: {
  anticipos: Ingreso[];
  filtros: FiltrosIngresos;
  catalogos: CatalogosIngreso;
  huboCorte?: boolean;
}) {
  const [estado, setEstado] = useState<{ accion: AccionIngreso; ingreso: Ingreso } | null>(null);
  const conSaldo = filtros.saldo !== "todos";

  const columns = useMemo<Array<DataTableColumn<Ingreso>>>(
    () => [
      {
        key: "ing",
        header: "ING",
        noLink: true,
        cell: (i) => (
          <span className="whitespace-nowrap">
            <Link
              href={hrefIngresos(filtros, { ingreso: i.id })}
              scroll={false}
              className="font-medium text-brand-600 hover:underline"
            >
              {i.etiqueta || etiquetaIngreso(i.folio)}
            </Link>
            {i.baja && (
              <Badge variant="outline" className="ml-1 border-destructive/40 text-[10px] text-destructive" title={i.baja.motivo}>
                Dado de baja
              </Badge>
            )}
          </span>
        ),
      },
      { key: "fecha", header: "Fecha", cellClassName: "whitespace-nowrap", cell: (i) => fmtDateOnly(i.fecha) },
      {
        key: "cliente",
        header: "Cliente",
        cell: (i) => (
          <span className="block">
            <span className="block text-sm">{i.cliente_nombre ?? "—"}</span>
            <span className="block max-w-[220px] truncate text-[11px] text-muted-foreground" title={i.descripcion}>
              {i.descripcion}
            </span>
          </span>
        ),
      },
      {
        key: "monto",
        header: "Monto",
        headClassName: "text-right",
        cellClassName: "text-right tabular-nums whitespace-nowrap font-mono",
        cell: (i) => fmtMonto(i.monto, i.moneda),
      },
      {
        key: "aplicado",
        header: "Aplicado",
        headClassName: "text-right",
        cellClassName: "text-right tabular-nums whitespace-nowrap font-mono text-muted-foreground",
        cell: (i) => fmtMonto(i.anticipo?.aplicado ?? 0, i.moneda),
      },
      {
        key: "saldo",
        header: "Saldo",
        headClassName: "text-right",
        cellClassName: "text-right tabular-nums whitespace-nowrap",
        cell: (i) => {
          const s = i.anticipo?.saldo ?? 0;
          return (
            <span
              className={cn(
                "font-mono",
                s > 0.005 ? "font-semibold text-amber-700 dark:text-amber-300" : "text-muted-foreground",
              )}
              title={s > 0.005 ? "Saldo por aplicar a un vuelo" : "Aplicado completo"}
            >
              {fmtMonto(s, i.moneda)}
            </span>
          );
        },
      },
      {
        key: "vuelos",
        header: "Vuelos",
        noLink: true,
        cell: (i) => {
          const n = i.anticipo?.aplicaciones_n ?? 0;
          return n > 0 ? (
            <Link
              href={hrefIngresos(filtros, { ingreso: i.id })}
              scroll={false}
              className="inline-flex cursor-pointer rounded-full border border-border bg-muted/40 px-2 text-[11px] hover:bg-muted"
              title="Ver a qué vuelos se aplicó"
            >
              {n === 1 ? "1 vuelo" : `${n} vuelos`}
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">Sin aplicar</span>
          );
        },
      },
      {
        key: "conciliacion",
        header: "Conciliación",
        cell: (i) => <BadgeEstadoConciliacion estado={i.conciliacion.estado} />,
      },
      {
        key: "acciones",
        header: "",
        headClassName: "w-10",
        noLink: true,
        cell: (i) => (
          <IngresoMenu
            ingreso={i}
            filtros={filtros}
            onAccion={(accion, ingreso) => setEstado({ accion, ingreso })}
          />
        ),
      },
    ],
    [filtros],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Ver:</span>
        {[
          { v: null, label: "Con saldo", activo: conSaldo },
          { v: "todos", label: "Todos (del periodo)", activo: !conSaldo },
        ].map((o) => (
          <Link
            key={o.label}
            href={hrefIngresos(filtros, { saldo: o.v })}
            className={cn(
              "inline-flex cursor-pointer items-center rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              o.activo ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </Link>
        ))}
      </div>
      {anticipos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {conSaldo
            ? "No hay anticipos con saldo por aplicar."
            : "No hay anticipos registrados en el periodo."}
        </p>
      ) : (
        <div className="rounded-lg border border-border">
          <DataTable
            syncId="an"
            columns={columns}
            rows={anticipos}
            rowKey={(i) => i.id}
            rowClassName={(i) => (i.baja ? "opacity-60" : undefined)}
            searchText={(i) => `${i.etiqueta} ${i.cliente_nombre ?? ""} ${i.descripcion} ${i.monto}`}
            searchPlaceholder="Buscar anticipo (ING-n, cliente, concepto)…"
            huboCorte={huboCorte}
          />
        </div>
      )}
      <DialogosIngreso estado={estado} onCerrar={() => setEstado(null)} catalogos={catalogos} />
    </div>
  );
}
