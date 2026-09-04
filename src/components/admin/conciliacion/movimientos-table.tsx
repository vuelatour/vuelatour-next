"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { MovimientoActions } from "@/components/admin/conciliacion/movimiento-actions";
import { fmtDate as fmtDateCancun, fmtDateOnly } from "@/lib/datetime";
import { categoriaGastoLabel } from "@/lib/admin/categorias-gasto";
import { folioTexto } from "@/lib/admin/grupos-ui";
import { metodoPagoLabel } from "@/lib/admin/metodos-pago";
import type { MovimientoBancario } from "@/types/conciliacion";

const fmtMoney = (monto: string) =>
  Number(monto).toLocaleString("es-MX", { minimumFractionDigits: 2 });
const fmtDate = fmtDateOnly;

interface MovimientosTableProps {
  movimientos: MovimientoBancario[];
  gastos: { value: string; label: string }[];
}

export function MovimientosTable({ movimientos, gastos }: MovimientosTableProps) {
  const columns = useMemo<Array<DataTableColumn<MovimientoBancario>>>(
    () => [
      {
        key: "fecha",
        header: "Fecha",
        cellClassName: "whitespace-nowrap",
        cell: (m) => fmtDate(m.fecha),
      },
      {
        key: "descripcion",
        header: "Descripción",
        cellClassName: "text-muted-foreground truncate max-w-[280px]",
        cell: (m) => m.descripcion ?? "—",
      },
      {
        key: "tipo",
        header: "Tipo",
        cell: (m) => (
          <Badge
            variant="outline"
            className={
              m.tipo === "CARGO"
                ? "border-brand-600/50 text-brand-600"
                : "border-emerald-500/50 text-emerald-600"
            }
          >
            {m.tipo === "CARGO" ? "Cargo" : "Abono"}
          </Badge>
        ),
      },
      {
        key: "monto",
        header: "Monto",
        headClassName: "text-right",
        cellClassName: "text-right tabular-nums",
        cell: (m) => fmtMoney(m.monto),
      },
      {
        key: "conciliacion",
        header: "Conciliación",
        cell: (m) =>
          m.conciliado && m.gasto ? (
            // Verificable de un clic: al vuelo del gasto (donde se
            // ve su desglose) o, sin vuelo, a la lista de gastos.
            <Link
              href={
                m.gasto.vuelo_id
                  ? `/admin/flights/${m.gasto.vuelo_id}`
                  : "/admin/expenses"
              }
              className="block text-sm text-emerald-600 hover:underline"
              title="Ver el gasto con el que se concilió"
            >
              {categoriaGastoLabel(m.gasto.categoria)} · ${fmtMoney(m.gasto.monto)}
              {m.gasto.vuelo?.folio != null && (
                <span className="text-muted-foreground"> · vuelo #{m.gasto.vuelo.folio}</span>
              )}
              <span className="block text-[10px] text-muted-foreground">
                {[
                  m.gasto.proveedor?.nombre,
                  m.gasto.fecha_gasto ? fmtDate(m.gasto.fecha_gasto) : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Gasto conciliado"}
              </span>
            </Link>
          ) : m.conciliado && m.cobro_grupo_id ? (
            // Conciliado contra el SOBRE de un grupo (lo que depositó el
            // cliente por N aviones): se verifica en el detalle del grupo.
            m.cobro_grupo ? (
              <Link
                href={`/admin/quotes/grupo/${m.cobro_grupo.grupo_id}`}
                className="block text-sm text-emerald-600 hover:underline"
                title={
                  m.cobro_grupo.grupo_nombre
                    ? `${m.cobro_grupo.grupo_nombre} — ver el grupo cuyo sobre se concilió`
                    : "Ver el grupo cuyo sobre se concilió"
                }
              >
                Cobro grupo {folioTexto(m.cobro_grupo.grupo_folio)}
                {m.cobro_grupo.aviones_n > 0 && (
                  <>
                    {" "}
                    · {m.cobro_grupo.aviones_n}{" "}
                    {m.cobro_grupo.aviones_n === 1 ? "avión" : "aviones"}
                  </>
                )}
                <span className="text-muted-foreground">
                  {" "}
                  · ${fmtMoney(String(m.cobro_grupo.monto))} {m.cobro_grupo.moneda}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {[
                    metodoPagoLabel(m.cobro_grupo.metodo_cobro),
                    // fecha_cobro es timestamptz: hora Cancún.
                    m.cobro_grupo.fecha_cobro
                      ? fmtDateCancun(m.cobro_grupo.fecha_cobro)
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Ver grupo"}
                </span>
              </Link>
            ) : (
              <span className="text-sm text-emerald-600">Cobro de grupo</span>
            )
          ) : m.conciliado && m.cobro_id ? (
            m.cobro?.vuelo_id ? (
              <Link
                href={`/admin/flights/${m.cobro.vuelo_id}`}
                className="block text-sm text-emerald-600 hover:underline"
                title="Ver el vuelo cuyo cobro se concilió"
              >
                Cobro de vuelo
                {m.cobro.vuelo?.folio != null && <> #{m.cobro.vuelo.folio}</>}
                {m.cobro.monto != null && (
                  <span className="text-muted-foreground"> · ${fmtMoney(m.cobro.monto)}</span>
                )}
                <span className="block text-[10px] text-muted-foreground">
                  {[
                    metodoPagoLabel(m.cobro.metodo_cobro),
                    // fecha_cobro es timestamptz: formatear en hora Cancún
                    // (recortar la fecha UTC correría el día en la noche).
                    m.cobro.fecha_cobro ? fmtDateCancun(m.cobro.fecha_cobro) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Ver vuelo"}
                </span>
              </Link>
            ) : (
              <span className="text-sm text-emerald-600">Cobro de vuelo</span>
            )
          ) : m.conciliado && m.clasificacion_id ? (
            // Conciliado por CLASIFICACIÓN: no corresponde a ningún vuelo
            // (comisión del banco, impuestos, personal…).
            <span
              className="block text-sm text-sky-600 dark:text-sky-400"
              title={m.notas ?? undefined}
            >
              {m.clasificacion?.nombre ?? "Clasificado"}
              {m.notas && (
                <span className="block text-[10px] text-muted-foreground truncate max-w-[220px]">
                  {m.notas}
                </span>
              )}
            </span>
          ) : (
            <Badge variant="outline" className="border-amber-500/50 text-amber-600">
              Pendiente
            </Badge>
          ),
      },
      {
        key: "acciones",
        header: "",
        headClassName: "w-10",
        noLink: true,
        // CARGO vincula gastos y ABONO vincula cobros de vuelo: ambos tienen
        // camino manual (el auto-cruce solo resuelve los montos exactos).
        cell: (m) => <MovimientoActions movimiento={m} gastos={gastos} />,
      },
    ],
    [gastos],
  );

  return (
    <DataTable
      // /admin/conciliacion tiene dos tablas: prefijo propio para no chocar
      syncId="mv"
      columns={columns}
      rows={movimientos}
      rowKey={(m) => m.id}
      searchText={(m) =>
        `${m.descripcion ?? ""} ${m.monto} ${m.referencia ?? ""} ${
          m.cobro_grupo ? folioTexto(m.cobro_grupo.grupo_folio) : ""
        }`
      }
      searchPlaceholder="Buscar movimiento (descripción, monto, referencia)…"
    />
  );
}
