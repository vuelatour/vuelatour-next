"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { BadgeEstadoConciliacion, ChipDelAnticipo } from "@/components/admin/ingresos/entradas-table";
import { ESTADO_LABELS, ESTADO_STYLES } from "@/lib/admin/estado-vuelo";
import { fmtMonto } from "@/lib/format";
import { fmtDateOnly } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import type { EntradaDinero } from "@/types/ingresos";
import type { EstadoVuelo } from "@/types/quotes-persisted";

const COLUMNS: DataTableColumn<EntradaDinero>[] = [
  { key: "dia", header: "Fecha del pago", cellClassName: "whitespace-nowrap", cell: (e) => fmtDateOnly(e.dia) },
  {
    key: "vuelo",
    header: "Vuelo",
    noLink: true,
    cell: (e) =>
      e.vuelo_id ? (
        <span className="block">
          <Link href={`/admin/flights/${e.vuelo_id}#cobros`} className="font-medium text-brand-600 hover:underline">
            {e.etiqueta}
          </Link>
          {e.anticipo_etiqueta && (
            <span className="block">
              <ChipDelAnticipo etiqueta={e.anticipo_etiqueta} />
            </span>
          )}
        </span>
      ) : (
        e.etiqueta
      ),
  },
  { key: "cliente", header: "Cliente", cell: (e) => e.cliente_nombre ?? "—" },
  {
    key: "estado",
    header: "Estado del vuelo",
    cell: (e) => {
      const est = e.vuelo_estado as EstadoVuelo | null;
      return est && ESTADO_LABELS[est] ? (
        <Badge variant="outline" className={cn("text-[10px]", ESTADO_STYLES[est])}>
          {ESTADO_LABELS[est]}
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">{e.vuelo_estado ?? "—"}</span>
      );
    },
  },
  {
    key: "monto",
    header: "Monto",
    headClassName: "text-right",
    cellClassName: "text-right tabular-nums whitespace-nowrap font-mono",
    cell: (e) => fmtMonto(e.monto, e.moneda),
  },
  {
    key: "conciliacion",
    header: "Conciliación",
    cell: (e) => <BadgeEstadoConciliacion estado={e.conciliacion.estado} />,
  },
];

/**
 * «Depósitos de vuelos que aún no vuelan» (SOLO LECTURA, 24-sep-2026). En esta
 * operación el depósito normal llega cuando la RESERVA ya existe (DOCX flujos
 * §5.5: «depósito de 25–50 % al reservar»): ese dinero YA es un cobro del
 * vuelo. Se muestra aquí para que nadie lo vuelva a registrar como anticipo.
 */
export function DepositosPorVolarTable({
  depositos,
  huboCorte,
}: {
  depositos: EntradaDinero[];
  huboCorte?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Estos depósitos ya están registrados en su vuelo: no los registres otra vez como anticipo.
      </p>
      {depositos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No hay depósitos de vuelos por volar en el periodo.
        </p>
      ) : (
        <div className="rounded-lg border border-border">
          <DataTable
            syncId="dv"
            columns={COLUMNS}
            rows={depositos}
            rowKey={(e) => `${e.origen}:${e.id}`}
            searchText={(e) => `${e.etiqueta} ${e.cliente_nombre ?? ""} ${e.monto}`}
            searchPlaceholder="Buscar depósito (vuelo, cliente, monto)…"
            huboCorte={huboCorte}
          />
        </div>
      )}
    </div>
  );
}
