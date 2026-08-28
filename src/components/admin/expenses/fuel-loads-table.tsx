"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { DataTableColumn } from "@/components/admin/data-table";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { ComprobantePreview } from "@/components/admin/comprobante-preview";
import { FuelAssignFlight } from "@/components/admin/expenses/fuel-assign-flight";
import {
  FuelAssignAircraft,
  type AeronaveOption,
} from "@/components/admin/expenses/fuel-assign-aircraft";
import { fmtDateOnly, fmtDateTimeShort } from "@/lib/datetime";

/** Fila-viewmodel serializable que arma la página (lookups ya resueltos). */
export interface FuelLoadRow {
  id: string;
  aeronave_id: string | null;
  /** Matrícula ya resuelta desde aeronave_id (null si no hay). */
  matricula: string | null;
  fecha_hora_carga: string | null;
  fecha_gasto: string | null;
  tipo_combustible: "TURBOSINA" | "AVGAS" | null;
  litros: number | null;
  monto: number;
  moneda: string;
  lugar: string | null;
  medio_pago: string;
  tarjeta_terminacion: string | null;
  /** Titular de la tarjeta ya resuelto desde la terminación. */
  titular: string | null;
  /** Path crudo del recibo en el bucket (decide imagen vs PDF). */
  fotoPath: string | null;
  /** URL firmada del recibo (bucket privado), ya resuelta. */
  fotoUrl: string | null;
  vuelo_id: string | null;
  /** Folio del vuelo ligado (informativo). */
  vuelo_folio: string | null;
}

export function FuelLoadsTable({
  loads,
  aircraft,
}: {
  loads: FuelLoadRow[];
  /** Aeronaves ACTIVAS para el diálogo "Asignar avión". */
  aircraft: AeronaveOption[];
}) {
  const columns = useMemo<Array<DataTableColumn<FuelLoadRow>>>(
    () => [
      {
        key: "aeronave",
        header: "Aeronave",
        noLink: true,
        cell: (l) =>
          l.matricula ? (
            <span className="font-mono text-sm">{l.matricula}</span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
                Sin avión
              </span>
              <FuelAssignAircraft gastoId={l.id} aircraft={aircraft} />
            </div>
          ),
      },
      {
        key: "fecha",
        header: "Fecha",
        cellClassName: "text-xs",
        cell: (l) =>
          l.fecha_hora_carga
            ? fmtDateTimeShort(l.fecha_hora_carga)
            : l.fecha_gasto
              ? fmtDateOnly(l.fecha_gasto)
              : "—",
      },
      {
        key: "tipo",
        header: "Tipo",
        cellClassName: "text-xs",
        cell: (l) =>
          l.tipo_combustible ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                l.tipo_combustible === "TURBOSINA"
                  ? "bg-sky-500/15 text-sky-600 dark:text-sky-300"
                  : "bg-amber-500/15 text-amber-600 dark:text-amber-300"
              }`}
            >
              {l.tipo_combustible === "TURBOSINA" ? "Turbosina" : "Gasavión"}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        key: "litros",
        header: "Litros",
        headClassName: "text-right",
        cellClassName: "text-right font-mono text-sm",
        cell: (l) =>
          l.litros != null
            ? `${l.litros.toLocaleString("en-US", { maximumFractionDigits: 1 })} L`
            : "—",
      },
      {
        key: "monto",
        header: "Monto",
        headClassName: "text-right",
        cellClassName: "text-right font-mono",
        cell: (l) =>
          `${l.moneda} ${l.monto.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
      },
      {
        key: "costoLitro",
        header: "$/L",
        headClassName: "text-right",
        cellClassName: "text-right font-mono text-xs text-muted-foreground",
        cell: (l) => {
          const costoLitro =
            l.litros && l.litros > 0 && l.monto > 0 ? l.monto / l.litros : null;
          return costoLitro != null ? `$${costoLitro.toFixed(2)}` : "—";
        },
      },
      {
        key: "lugar",
        header: "Lugar",
        cellClassName: "text-xs font-mono",
        cell: (l) => l.lugar ?? "—",
      },
      {
        key: "pago",
        header: "Pago",
        cellClassName: "text-xs",
        cell: (l) =>
          l.medio_pago === "TARJETA_CORP" && l.tarjeta_terminacion ? (
            <span title={l.titular ?? undefined}>
              •••• {l.tarjeta_terminacion}
              {l.titular ? (
                <span className="block text-[10px] text-muted-foreground">
                  {l.titular}
                </span>
              ) : null}
            </span>
          ) : (
            l.medio_pago
          ),
      },
      {
        key: "recibo",
        header: "Recibo",
        noLink: true,
        cell: (l) =>
          l.fotoPath && l.fotoUrl ? (
            <ComprobantePreview
              path={l.fotoPath}
              url={l.fotoUrl}
              alt="Recibo de combustible"
              thumbClassName="h-10 w-10 rounded-md object-cover ring-1 ring-border hover:ring-brand-500"
            />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        // Informativa: el combustible ya no se controla por vuelo (la liga
        // solo alimenta el reporte por vuelo), por eso va discreta al final.
        key: "vuelo",
        header: "Vuelo",
        cellClassName: "text-xs",
        noLink: true,
        cell: (l) => (
          <div className="flex items-center gap-2">
            {l.vuelo_id ? (
              <Link
                href={`/admin/flights/${l.vuelo_id}`}
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                Vuelo{l.vuelo_folio ? ` #${l.vuelo_folio}` : ""}
              </Link>
            ) : null}
            <FuelAssignFlight
              gastoId={l.id}
              aeronaveId={l.aeronave_id}
              fechaHora={
                l.fecha_hora_carga ??
                (l.fecha_gasto ? `${l.fecha_gasto}T12:00:00Z` : null)
              }
              vueloActual={l.vuelo_id}
            />
          </div>
        ),
      },
    ],
    [aircraft],
  );

  // Búsqueda rápida (misma que tenía la lista) sobre las filas planas.
  const [q, setQ] = useState("");
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return loads;
    return loads.filter((l) =>
      [
        l.matricula ?? "",
        l.lugar ?? "",
        l.tipo_combustible === "TURBOSINA"
          ? "Turbosina"
          : l.tipo_combustible === "AVGAS"
            ? "Gasavión"
            : "",
        l.tarjeta_terminacion ?? "",
        l.titular ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(t),
    );
  }, [loads, q]);

  // SECCIONES por matrícula (pedido del cliente 28-ago): todas las cargas de
  // una matrícula juntas y, al terminar, su subtotal (cargas, litros, monto
  // por moneda, $/L). "Sin avión" va primero: bloquea el cierre. Al final,
  // el total general del mes. Los montos ya incluyen IVA (ticket).
  const grupos = useMemo(() => {
    const map = new Map<string, { matricula: string | null; filas: FuelLoadRow[] }>();
    for (const l of visibles) {
      const key = l.matricula ?? "";
      const g = map.get(key) ?? { matricula: l.matricula, filas: [] };
      g.filas.push(l);
      map.set(key, g);
    }
    const lista = [...map.values()];
    lista.sort((a, b) => {
      if (!a.matricula !== !b.matricula) return a.matricula ? 1 : -1;
      return (a.matricula ?? "").localeCompare(b.matricula ?? "");
    });
    const fecha = (l: FuelLoadRow) =>
      String(l.fecha_hora_carga ?? l.fecha_gasto ?? "");
    for (const g of lista) g.filas.sort((a, b) => fecha(a).localeCompare(fecha(b)));
    return lista;
  }, [visibles]);

  const subtotal = (filas: FuelLoadRow[]) => {
    const t = { cargas: 0, litros: 0, mxn: 0, usd: 0, mxnConLitros: 0, litrosMxn: 0 };
    for (const l of filas) {
      t.cargas += 1;
      t.litros += l.litros ?? 0;
      if (l.moneda === "USD") t.usd += l.monto;
      else {
        t.mxn += l.monto;
        if (l.litros && l.litros > 0) {
          t.mxnConLitros += l.monto;
          t.litrosMxn += l.litros;
        }
      }
    }
    return t;
  };
  const total = subtotal(visibles);
  const money = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const litros = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  const nCols = columns.length;
  // Índices de columnas para alinear el subtotal con Litros / Monto / $/L.
  const idx = (key: string) => columns.findIndex((c) => c.key === key);
  const iLitros = idx("litros");
  const iMonto = idx("monto");
  const iCosto = idx("costoLitro");

  const filaTotales = (
    etiqueta: string,
    t: ReturnType<typeof subtotal>,
    className: string,
  ) => (
    <TableRow className={className}>
      {columns.map((c, i) => {
        let contenido: React.ReactNode = null;
        if (i === 0)
          contenido = (
            <span className="font-semibold">
              {etiqueta}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {t.cargas} {t.cargas === 1 ? "carga" : "cargas"}
              </span>
            </span>
          );
        else if (i === iLitros) contenido = `${litros(t.litros)} L`;
        else if (i === iMonto)
          contenido = (
            <span className="whitespace-nowrap">
              MXN {money(t.mxn)}
              {t.usd > 0 && (
                <span className="block text-xs">USD {money(t.usd)}</span>
              )}
            </span>
          );
        else if (i === iCosto)
          contenido =
            t.litrosMxn > 0 ? `$${(t.mxnConLitros / t.litrosMxn).toFixed(2)}` : "—";
        return (
          <TableCell
            key={c.key}
            className={`font-mono text-sm ${i === iLitros || i === iMonto || i === iCosto ? "text-right" : ""}`}
          >
            {contenido}
          </TableCell>
        );
      })}
    </TableRow>
  );

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar carga (matrícula, lugar, tipo)…"
          className="h-8 max-w-sm text-sm"
        />
        <span className="text-xs text-muted-foreground">
          {visibles.length} {visibles.length === 1 ? "carga" : "cargas"}
        </span>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={c.headClassName}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {grupos.length === 0 && (
              <TableRow>
                <TableCell colSpan={nCols} className="text-center text-sm text-muted-foreground">
                  Sin cargas que coincidan.
                </TableCell>
              </TableRow>
            )}
            {grupos.map((g) => (
              <FuelGroup
                key={g.matricula ?? "__sin_avion"}
                matricula={g.matricula}
                filas={g.filas}
                columns={columns}
                nCols={nCols}
                subtotal={filaTotales(
                  `Subtotal ${g.matricula ?? "sin avión"}`,
                  subtotal(g.filas),
                  "bg-muted/40",
                )}
              />
            ))}
          </TableBody>
          {grupos.length > 0 && (
            <TableFooter>
              {filaTotales("TOTAL DEL MES (con IVA)", total, "bg-muted/60")}
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}

/** Sección de una matrícula: encabezado, sus cargas y su subtotal. */
function FuelGroup({
  matricula,
  filas,
  columns,
  nCols,
  subtotal,
}: {
  matricula: string | null;
  filas: FuelLoadRow[];
  columns: Array<DataTableColumn<FuelLoadRow>>;
  nCols: number;
  subtotal: React.ReactNode;
}) {
  return (
    <>
      <TableRow className="bg-muted/20 hover:bg-muted/20">
        <TableCell colSpan={nCols} className="py-1.5">
          <span
            className={`font-mono text-sm font-semibold ${
              matricula ? "" : "text-red-600 dark:text-red-400"
            }`}
          >
            {matricula ?? "Sin avión (asignar)"}
          </span>
        </TableCell>
      </TableRow>
      {filas.map((l) => (
        <TableRow key={l.id}>
          {columns.map((c) => (
            <TableCell key={c.key} className={c.cellClassName}>
              {c.cell(l)}
            </TableCell>
          ))}
        </TableRow>
      ))}
      {subtotal}
    </>
  );
}
