"use client";

import { useState } from "react";
import { TableCellsIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { descargarDelApi } from "@/lib/download";

export interface AircraftPickItem {
  id: string;
  matricula: string;
  modelo?: string;
}

/**
 * Selector de avión + descarga del libro INDIVIDUAL del periodo en Excel
 * (`GET /v1/aircraft/:id/balance.xlsx?desde&hasta`). Respeta el periodo del
 * PeriodSelector de la página (llega por props).
 *
 * Solo lista aviones. El consolidado de la flota es otro reporte ("Balance
 * general VuelaTour", card hermana en /admin/reportes con su propio botón) y
 * ya NO vive como opción centinela de este selector: Ale y Pablo confundían
 * ambos libros (2-sep-2026).
 */
export function AircraftBalancePicker({
  aircraft,
  desde,
  hasta,
}: {
  aircraft: AircraftPickItem[];
  desde: string;
  hasta: string;
}) {
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const avion = aircraft.find((a) => a.id === selected);

  const download = async () => {
    if (!avion) return;
    setLoading(true);
    const err = await descargarDelApi(`/v1/aircraft/${avion.id}/balance.xlsx`, {
      filename: `balance-${avion.matricula}-${desde}-${hasta}.xlsx`,
      query: { desde, hasta },
    });
    if (err) toast.error("No se pudo generar el balance", { description: err });
    setLoading(false);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 max-w-md">
        <Label className="text-sm font-medium">Avión</Label>
        <SearchableSelect
          options={aircraft.map((a) => ({
            value: a.id,
            label: a.modelo ? `${a.matricula} · ${a.modelo}` : a.matricula,
          }))}
          value={selected}
          onChange={setSelected}
          placeholder="Busca por matrícula o modelo…"
          emptyText="Sin aeronaves"
        />
      </div>
      {avion ? (
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={loading}
          onClick={download}
        >
          <TableCellsIcon className="h-4 w-4" />
          {loading ? "Generando…" : "Descargar balance del avión (Excel)"}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Elige un avión para descargar su libro del periodo seleccionado.
        </p>
      )}
    </div>
  );
}
