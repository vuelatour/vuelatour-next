import { BeakerIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import {
  FuelLoadsTable,
  type FuelLoadRow,
} from "@/components/admin/expenses/fuel-loads-table";
import { listFuelLoads, signFuelPhotos } from "@/lib/api/expenses-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listCards } from "@/lib/api/cards-server";
import { EmptyState } from "@/components/admin/empty-state";
import { ExcelExportButton } from "@/components/admin/excel-export-button";
import { FuelBulkUploadDialog } from "@/components/admin/expenses/fuel-bulk-upload-dialog";

export const dynamic = "force-dynamic";

export default async function CombustiblesPage() {
  const [{ data: loads, count }, aircraftRes, cardsRes] = await Promise.all([
    listFuelLoads(),
    listAircraft({ limit: 100 }),
    listCards({ limit: 50 }).catch(() => ({ data: [] })),
  ]);

  const matriculaById = new Map(aircraftRes.data.map((a) => [a.id, a.matricula]));
  const titularByTerminacion = new Map(
    cardsRes.data.map((c) => [c.terminacion, c.nombre_titular]),
  );
  const fotos = await signFuelPhotos(
    loads.map((l) => l.foto_url).filter((p): p is string => !!p),
  ).catch(() => ({}) as Record<string, string>);

  // Filas planas serializables: lookups (matrícula, titular, foto firmada)
  // resueltos aquí en el server; el cliente solo pinta.
  const rows: FuelLoadRow[] = loads.map((l) => ({
    id: l.id,
    aeronave_id: l.aeronave_id,
    matricula: l.aeronave_id ? (matriculaById.get(l.aeronave_id) ?? null) : null,
    fecha_hora_carga: l.fecha_hora_carga,
    fecha_gasto: l.fecha_gasto,
    tipo_combustible: l.tipo_combustible,
    litros: l.litros != null ? Number(l.litros) : null,
    monto: Number(l.monto),
    moneda: l.moneda,
    lugar: l.lugar,
    medio_pago: l.medio_pago,
    tarjeta_terminacion: l.tarjeta_terminacion,
    titular: l.tarjeta_terminacion
      ? (titularByTerminacion.get(l.tarjeta_terminacion) ?? null)
      : null,
    fotoUrl: l.foto_url ? (fotos[l.foto_url] ?? null) : null,
    vuelo_id: l.vuelo_id,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Operación</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Combustibles</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {count} {count === 1 ? "carga registrada" : "cargas registradas"} (incluye las del mecánico).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExcelExportButton
            path="/v1/expenses/combustibles/plantilla.xlsx"
            filename="plantilla-combustibles.xlsx"
            label="Plantilla (Excel)"
          />
          <FuelBulkUploadDialog />
        </div>
      </div>

      {loads.length === 0 ? (
        <EmptyState
            icon={BeakerIcon}
            title="Sin cargas de combustible"
            description="Las cargas que registre el mecánico (o los pilotos) aparecerán aquí, vinculadas a su aeronave y vuelo. También puedes cargarlas en lote con la plantilla de Excel (botón Carga masiva)."
          />
      ) : (
        <Card>
          <CardContent className="p-0">
            <FuelLoadsTable loads={rows} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
