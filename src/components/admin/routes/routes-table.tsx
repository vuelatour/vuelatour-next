"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { DataTable, type DataTableColumn } from "@/components/admin/data-table";
import { RouteActions } from "@/components/admin/routes/route-actions";
import { fmtDecimal } from "@/lib/format";
import type { Route } from "@/types/routes";

interface AirportOption {
  iata: string;
  nombre: string;
  latitud: number | null;
  longitud: number | null;
}

export function RoutesTable({
  routes,
  airports,
}: {
  routes: Route[];
  airports: AirportOption[];
}) {
  const columns = useMemo<Array<DataTableColumn<Route>>>(
    () => [
      {
        key: "itinerario",
        header: "Itinerario",
        cell: (r) =>
          r.tipo === "MULTIESCALA" && r.tramos.length > 0 ? (
            <div className="space-y-0.5">
              <div className="font-mono text-sm font-semibold">
                {r.tramos.map((t, i) => (
                  <span key={t.id}>
                    {i === 0 ? t.origen_iata : null}
                    <span className="text-muted-foreground"> → </span>
                    {t.destino_iata}
                  </span>
                ))}
              </div>
              {r.notas && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {r.notas}
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 font-mono font-semibold">
                <span>{r.origen_iata}</span>
                <span className="text-muted-foreground">→</span>
                <span>{r.destino_iata}</span>
              </div>
              {r.notas && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                  {r.notas}
                </p>
              )}
            </>
          ),
      },
      {
        key: "tramos",
        header: "Tramos",
        headClassName: "text-center",
        cellClassName: "text-center",
        cell: (r) =>
          r.tramos.length > 0 ? (
            <Badge className="bg-brand-600/15 text-brand-600 dark:text-brand-400 border-brand-600/30 text-[10px]">
              {r.tramos.length} {r.tramos.length === 1 ? "tramo" : "tramos"}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px]">
              Legacy
            </Badge>
          ),
      },
      {
        key: "nm",
        header: "NM totales",
        headClassName: "text-right",
        cellClassName: "text-right font-mono",
        cell: (r) => fmtDecimal(r.millas_nauticas),
      },
      {
        key: "aterrizajes",
        header: "Aterrizajes",
        headClassName: "text-center",
        cellClassName: "text-center font-mono text-sm",
        cell: (r) => r.num_aterrizajes,
      },
      {
        key: "fuente",
        header: "Fuente",
        cell: (r) =>
          r.fuente ? (
            <Badge variant="outline" className="font-mono text-[10px]">
              {r.fuente}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        key: "estado",
        header: "Estado",
        headClassName: "text-center",
        cellClassName: "text-center",
        cell: (r) =>
          r.activa ? (
            <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
              Activa
            </Badge>
          ) : (
            <Badge variant="secondary">Inactiva</Badge>
          ),
      },
      {
        key: "acciones",
        header: "",
        headClassName: "w-12",
        cell: (r) => <RouteActions route={r} airports={airports} />,
      },
    ],
    [airports],
  );

  return (
    <DataTable
      columns={columns}
      rows={routes}
      rowKey={(r) => r.id}
      searchText={(r) =>
        [
          r.origen_iata,
          r.destino_iata,
          ...r.tramos.flatMap((t) => [t.origen_iata, t.destino_iata]),
          r.fuente ?? "",
          r.notas ?? "",
        ].join(" ")
      }
      searchPlaceholder="Buscar ruta por IATA…"
    />
  );
}
