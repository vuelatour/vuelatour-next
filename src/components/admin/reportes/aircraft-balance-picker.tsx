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
 * Selector de avión + descarga del balance del periodo en Excel
 * (`GET /v1/aircraft/:id/balance.xlsx?desde&hasta`). Respeta el periodo del
 * PeriodSelector de la página (llega por props).
 */
/** Valor especial del selector: balance GENERAL de toda la flota. */
const GENERAL = "__general__";

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
  const esGeneral = selected === GENERAL;
  const avion = aircraft.find((a) => a.id === selected);

  const download = async () => {
    if (!esGeneral && !avion) return;
    setLoading(true);
    // General: una fila por avión con los TOTALES de su libro (mismo motor
    // que el balance individual) + totales de flota.
    const err = esGeneral
      ? await descargarDelApi(`/v1/aircraft/balance-general.xlsx`, {
          filename: `balance-general-${desde}-${hasta}.xlsx`,
          query: { desde, hasta },
        })
      : await descargarDelApi(`/v1/aircraft/${avion!.id}/balance.xlsx`, {
          filename: `balance-${avion!.matricula}-${desde}-${hasta}.xlsx`,
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
          options={[
            {
              value: GENERAL,
              label: "Toda la flota (balance general)",
              description: "Una fila por avión + totales de flota",
            },
            ...aircraft.map((a) => ({
              value: a.id,
              label: a.modelo ? `${a.matricula} · ${a.modelo}` : a.matricula,
            })),
          ]}
          value={selected}
          onChange={setSelected}
          placeholder="Busca por matrícula o modelo…"
          emptyText="Sin aeronaves"
        />
      </div>
      {selected ? (
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={loading}
          onClick={download}
        >
          <TableCellsIcon className="h-4 w-4" />
          {loading
            ? "Generando…"
            : esGeneral
              ? "Descargar balance general (Excel)"
              : "Descargar balance (Excel)"}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Elige un avión (o &ldquo;Toda la flota&rdquo;) para descargar el
          libro del periodo seleccionado.
        </p>
      )}
    </div>
  );
}
