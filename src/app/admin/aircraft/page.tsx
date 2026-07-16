import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { AircraftCreateButton } from "@/components/admin/aircraft/aircraft-create-button";
import { AircraftTable } from "@/components/admin/aircraft/aircraft-table";
import { listAircraft } from "@/lib/api/aircraft";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

export default async function AircraftListPage() {
  const { data: aircraft, count } = await listAircraft({ limit: 100 });

  // Activas primero (las que operan a diario), inactivas al final.
  const ordenadas = [...aircraft].sort((a, b) => {
    if (a.activa !== b.activa) return a.activa ? -1 : 1;
    return a.matricula.localeCompare(b.matricula);
  });
  const activas = aircraft.filter((a) => a.activa).length;
  const sinTarifa = aircraft.filter(
    (a) => a.activa && !a.tarifa_hora_pub_usd && !a.tarifa_hora_broker_usd,
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Flota</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Aeronaves</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {count} {count === 1 ? "avión" : "aviones"} · {activas} activa
            {activas === 1 ? "" : "s"}
            {sinTarifa > 0 && (
              <span className="text-amber-600"> · {sinTarifa} sin tarifa configurada</span>
            )}
          </p>
        </div>
        <AircraftCreateButton />
      </div>

      {aircraft.length === 0 ? (
        <EmptyState
            icon={PaperAirplaneIcon}
            title="Sin aeronaves registradas"
            description="Cuando agregues aeronaves al sistema aparecerán aquí."
          />
      ) : (
        <Card>
          <CardContent className="p-0">
            <AircraftTable aircraft={ordenadas} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
