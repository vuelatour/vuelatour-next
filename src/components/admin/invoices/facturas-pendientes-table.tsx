"use client";

import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { EmitirFacturaButton } from "@/components/admin/invoices/emitir-factura-button";
import { fmtDate } from "@/lib/datetime";
import type { PendingFlight } from "@/types/invoices";

interface EmisoraOption {
  id: string;
  label: string;
}

function clienteNombre(c: PendingFlight["cliente"]): string {
  if (!c) return "—";
  const x = Array.isArray(c) ? c[0] : c;
  return x?.nombre ?? "—";
}

function clienteRfc(c: PendingFlight["cliente"]): string | null {
  if (!c) return null;
  const x = Array.isArray(c) ? c[0] : c;
  return x?.rfc ?? null;
}

export function FacturasPendientesTable({
  pendientes,
  emisoras,
}: {
  pendientes: PendingFlight[];
  emisoras: EmisoraOption[];
}) {
  const columns: Array<DataTableColumn<PendingFlight>> = [
    {
      key: "folio",
      header: "Folio",
      headClassName: "w-20",
      cellClassName: "font-mono text-xs",
      noLink: true,
      cell: (v) => (
        <Link
          href={`/admin/flights/${v.id}`}
          className="hover:text-brand-600 hover:underline"
          title="Ver el vuelo"
        >
          #{v.folio}
        </Link>
      ),
    },
    {
      key: "cliente",
      header: "Cliente",
      cellClassName: "text-sm",
      noLink: true,
      cell: (v) => (
        <>
          {/* Al cliente: para completar RFC/razón social sin buscarlo. */}
          <Link
            href={`/admin/clients?q=${encodeURIComponent(clienteNombre(v.cliente))}`}
            className="hover:text-brand-600 hover:underline"
            title="Abrir en Clientes (completar datos de facturación)"
          >
            {clienteNombre(v.cliente)}
          </Link>
          {!clienteRfc(v.cliente) && (
            <span
              className="ml-2 rounded-full border border-amber-500/50 px-1.5 py-0.5 text-[10px] text-amber-600"
              title="Captura RFC/régimen/CP en Clientes, o factura a Público en general / Otro receptor"
            >
              Sin datos fiscales
            </span>
          )}
          {v.cobrado === false && (
            <span className="ml-2 rounded-full border border-amber-500/50 px-1.5 py-0.5 text-[10px] text-amber-600">
              Por cobrar{v.metodo_cobro ? ` · ${v.metodo_cobro}` : ""}
            </span>
          )}
          {v.cobrado === true && (
            <span className="ml-2 rounded-full border border-green-500/50 px-1.5 py-0.5 text-[10px] text-green-600 dark:text-green-400">
              Pagado{v.metodo_cobro ? ` · ${v.metodo_cobro}` : ""}
            </span>
          )}
        </>
      ),
    },
    {
      key: "ruta",
      header: "Ruta",
      cellClassName: "font-mono text-xs",
      cell: (v) => v.ruta ?? `${v.origen_iata} → ${v.destino_iata}`,
    },
    {
      key: "fecha",
      header: "Fecha",
      cellClassName: "text-xs",
      cell: (v) => (v.fecha_vuelo ? fmtDate(v.fecha_vuelo) : "—"),
    },
    {
      key: "total",
      header: "Total",
      headClassName: "text-right",
      cellClassName: "text-right font-mono text-xs",
      cell: (v) => (
        <>
          {v.monto_total_mxn
            ? `$${Number(v.monto_total_mxn).toLocaleString("es-MX")} MXN`
            : `$${Number(v.monto_total_usd).toLocaleString("en-US")} USD`}
          {!v.monto_total_mxn && (
            <span
              className="ml-2 rounded-full border border-amber-500/50 px-1.5 py-0.5 font-sans text-[10px] text-amber-600"
              title="Cotizado en USD sin tipo de cambio: se pedirá el TC al emitir (el CFDI se timbra en MXN)"
            >
              Falta TC
            </span>
          )}
        </>
      ),
    },
    {
      key: "emitir",
      header: "Emitir",
      headClassName: "text-right",
      noLink: true,
      cell: (v) => (
        <EmitirFacturaButton
          vueloId={v.id}
          emisoras={emisoras}
          clienteNombre={clienteNombre(v.cliente)}
          clienteRfc={clienteRfc(v.cliente)}
          montoTotalMxn={v.monto_total_mxn}
          montoTotalUsd={v.monto_total_usd}
        />
      ),
    },
  ];

  return (
    <DataTable
      // /admin/facturas tiene dos tablas: prefijo propio para no chocar
      syncId="fp"
      columns={columns}
      rows={pendientes}
      rowKey={(v) => v.id}
      searchText={(v) =>
        `#${v.folio} ${clienteNombre(v.cliente)} ${clienteRfc(v.cliente) ?? ""} ${
          v.ruta ?? `${v.origen_iata} ${v.destino_iata}`
        } ${v.metodo_cobro ?? ""}`
      }
      searchPlaceholder="Buscar por folio, cliente, RFC o ruta…"
    />
  );
}
