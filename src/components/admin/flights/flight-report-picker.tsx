"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { EMPTY_VUELOS_NO_CARGARON, TEXTO_VUELOS_NO_CARGARON } from "@/lib/admin/reportes-ui";
import { FlightReportButtons } from "./flight-report-buttons";

export interface FlightPickItem {
  id: string;
  folio: number;
  label: string;
}

/**
 * Selector de vuelo + descarga de su reporte consolidado (PDF/Excel).
 * `fallo` (ADITIVO, 12-oct-2026): la lista de vuelos NO cargó, así que el
 * selector lo dice en vez de mentir «Sin vuelos en el rango reciente».
 */
export function FlightReportPicker({
  flights,
  fallo = false,
}: {
  flights: FlightPickItem[];
  fallo?: boolean;
}) {
  const [selected, setSelected] = useState<string>("");
  const folio = flights.find((f) => f.id === selected)?.folio;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 max-w-md">
        <Label className="text-sm font-medium">Vuelo</Label>
        <SearchableSelect
          options={flights.map((f) => ({ value: f.id, label: f.label }))}
          value={selected}
          onChange={setSelected}
          placeholder="Busca por folio o ruta…"
          emptyText={fallo ? EMPTY_VUELOS_NO_CARGARON : "Sin vuelos en el rango reciente"}
        />
      </div>
      {selected ? (
        <FlightReportButtons flightId={selected} folio={folio} />
      ) : fallo ? (
        <p className="text-xs text-muted-foreground">{TEXTO_VUELOS_NO_CARGARON}</p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Elige un vuelo para descargar su reporte (cotización, ingreso, tacómetro,
          combustible y gastos).
        </p>
      )}
    </div>
  );
}
