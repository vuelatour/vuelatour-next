import { CpuChipIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EnginesTable, type EngineRow } from "@/components/admin/engines/engines-table";
import { listAircraft } from "@/lib/api/aircraft";
import { listEngines } from "@/lib/api/engines-server";

export const dynamic = "force-dynamic";

/** Horas de aviso antes de agotar el TBO. */
const PROXIMO_HRS = 100;

function restantes(totales: string, turm: string, tbo: string): number {
  return Number(tbo) - (Number(totales) - Number(turm));
}

export default async function EnginesListPage() {
  const [enginesRes, aircraftRes] = await Promise.all([
    listEngines({ limit: 200 }),
    listAircraft({ limit: 200 }),
  ]);
  const engines = enginesRes.data;
  const matriculas = new Map(aircraftRes.data.map((a) => [a.id, a.matricula]));

  const rows: EngineRow[] = engines
    .map((e): EngineRow => {
      const rest = restantes(e.horas_totales, e.turm, e.tbo_horas);
      return {
        id: e.id,
        aeronave_id: e.aeronave_id,
        matricula: matriculas.get(e.aeronave_id) ?? "—",
        posicion: e.posicion,
        numero_serie: e.numero_serie,
        tipo: e.tipo,
        horas_totales: e.horas_totales,
        turm: e.turm,
        tbo_horas: e.tbo_horas,
        rest,
        estado: rest <= 0 ? "vencido" : rest <= PROXIMO_HRS ? "proximo" : "ok",
      };
    })
    .sort((a, b) => a.rest - b.rest);

  const vencidos = rows.filter((r) => r.rest <= 0).length;
  const proximos = rows.filter((r) => r.rest > 0 && r.rest <= PROXIMO_HRS).length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Flota</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Motores</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {engines.length} {engines.length === 1 ? "motor" : "motores"} en la flota
          {vencidos > 0 && (
            <span className="text-destructive"> · {vencidos} con overhaul vencido</span>
          )}
          {proximos > 0 && (
            <span className="text-amber-600 dark:text-amber-400"> · {proximos} próximo(s)</span>
          )}
        </p>
      </div>

      {engines.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <CpuChipIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Sin motores registrados</CardTitle>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <EnginesTable engines={rows} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
