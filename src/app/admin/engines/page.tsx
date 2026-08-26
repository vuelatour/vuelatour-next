import { CpuChipIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EnginesTable, type EngineRow } from "@/components/admin/engines/engines-table";
import { listEngines } from "@/lib/api/engines-server";

export const dynamic = "force-dynamic";

/** Horas de aviso antes de agotar el TBO. */
const PROXIMO_HRS = 100;

export default async function EnginesListPage() {
  const enginesRes = await listEngines({ limit: 200 });
  const engines = enginesRes.data;

  // Los derivados (horas de vida, desde overhaul, restantes) vienen SIEMPRE
  // del API — misma aritmética que el expediente del avión. La fórmula local
  // que se usaba aquí contradecía al detalle (caso N990GG: "6,290 restantes"
  // con TBO 2,000). Sin dato del API = "—", nunca un cálculo de respaldo.
  const rows: EngineRow[] = engines
    .map((e): EngineRow => {
      const rest = e.tbo_restante ?? null;
      return {
        id: e.id,
        aeronave_id: e.aeronave_id,
        matricula: e.aeronave?.matricula ?? "—",
        posicion: e.posicion,
        numero_serie: e.numero_serie,
        tipo: e.tipo,
        horas_vida: e.horas_actuales ?? null,
        desde_ovh: e.horas_desde_overhaul ?? null,
        tbo_horas: e.tbo_horas,
        rest,
        estado:
          rest == null
            ? "sin_tbo"
            : rest <= 0
              ? "vencido"
              : rest <= PROXIMO_HRS
                ? "proximo"
                : "ok",
      };
    })
    .sort(
      (a, b) =>
        (a.rest ?? Number.POSITIVE_INFINITY) - (b.rest ?? Number.POSITIVE_INFINITY),
    );

  const vencidos = rows.filter((r) => r.estado === "vencido").length;
  const proximos = rows.filter((r) => r.estado === "proximo").length;

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
