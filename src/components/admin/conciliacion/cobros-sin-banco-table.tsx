"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { fmtDate } from "@/lib/datetime";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { metodoPagoLabel } from "@/lib/admin/metodos-pago";
import type { CobroSinBanco } from "@/types/conciliacion";

const fmtMoney = (n: number) =>
  n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Liga al vuelo o al grupo del cobro. */
function hrefDe(c: CobroSinBanco): string | null {
  if (c.tipo === "SOBRE_GRUPO") return c.grupo_id ? `/admin/quotes/grupo/${c.grupo_id}` : null;
  return c.vuelo_id ? `/admin/flights/${c.vuelo_id}` : null;
}

const COLUMNS: DataTableColumn<CobroSinBanco>[] = [
  {
    key: "fecha",
    header: "Fecha cobro",
    cellClassName: "whitespace-nowrap",
    // fecha_cobro es timestamptz: hora Cancún.
    cell: (c) => fmtDate(c.fecha_cobro),
  },
  {
    key: "quien",
    header: "Vuelo / Grupo",
    noLink: true,
    cell: (c) => {
      const href = hrefDe(c);
      const texto =
        c.tipo === "SOBRE_GRUPO"
          ? `Grupo ${folioTexto(c.grupo_folio ?? null)}`
          : `Vuelo #${c.folio ?? "—"}`;
      return href ? (
        <Link href={href} className="text-brand-600 hover:underline">
          {texto}
        </Link>
      ) : (
        texto
      );
    },
  },
  { key: "cliente", header: "Cliente", cell: (c) => c.cliente ?? "—" },
  {
    key: "metodo",
    header: "Método",
    cell: (c) => (
      <Badge
        variant="outline"
        className={
          c.metodo_cobro === "PAYWISE"
            ? "border-violet-500/40 text-violet-600 dark:text-violet-400"
            : undefined
        }
      >
        {c.metodo_label ?? metodoPagoLabel(c.metodo_cobro)}
      </Badge>
    ),
  },
  { key: "referencia", header: "Referencia", cell: (c) => c.referencia ?? "—" },
  {
    key: "monto",
    header: "Bruto",
    headClassName: "text-right",
    cellClassName: "text-right",
    cell: (c) => (
      <span className="font-mono tabular-nums">
        ${fmtMoney(c.monto)} {c.moneda}
      </span>
    ),
  },
  {
    key: "neto",
    header: "Neto esperado",
    headClassName: "text-right",
    cellClassName: "text-right",
    cell: (c) => (
      <span className="font-mono tabular-nums text-muted-foreground">
        ${fmtMoney(c.neto)}
        {c.comision_banco_monto != null && c.comision_banco_monto > 0 && (
          <span className="block text-[10px]">comisión ${fmtMoney(c.comision_banco_monto)}</span>
        )}
      </span>
    ),
  },
];

/**
 * Cobros bancarios (transferencia / HSBC link / cheque / Paywise; cobros de
 * vuelo y sobres de grupo) sin liga con ningún abono importado — el espejo
 * de «Gastos sin banco». Un cobro que nunca llegó al banco es dinero que se
 * cree cobrado.
 */
export function CobrosSinBancoTable({ rows }: { rows: CobroSinBanco[] }) {
  return (
    <DataTable
      rows={rows}
      columns={COLUMNS}
      rowKey={(c) => `${c.tipo}:${c.id}`}
      searchText={(c) =>
        `${c.folio ?? ""} ${c.grupo_folio ?? ""} ${c.cliente ?? ""} ${c.metodo_label ?? ""} ${c.referencia ?? ""} ${c.monto}`
      }
      searchPlaceholder="Buscar cobro (folio, cliente, método, referencia, monto)…"
      syncId="csb"
    />
  );
}
