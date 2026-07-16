import { MapPinIcon } from "@heroicons/react/24/outline";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AirportsTable } from "@/components/admin/airports/airports-table";
import { AirportCreateButton } from "@/components/admin/airports/airport-create-button";
import { listAirports } from "@/lib/api/airports-server";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

export default async function AirportsPage() {
  const { data: airports, count } = await listAirports({ limit: 200 });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Catálogos</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Aeropuertos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {count} {count === 1 ? "aeropuerto" : "aeropuertos"} con reglas TUAS configuradas.
          </p>
        </div>
        <AirportCreateButton />
      </div>

      {airports.length === 0 ? (
        <EmptyState
            icon={MapPinIcon}
            title="Sin aeropuertos registrados"
            description="Crea el primer aeropuerto para empezar a cotizar rutas."
          />
      ) : (
        <Card>
          <CardContent className="p-0">
            <AirportsTable airports={airports} />
          </CardContent>
        </Card>
      )}

      <Card className="bg-muted/40 border-dashed">
        <CardHeader>
          <CardTitle className="text-sm">¿Cómo se leen estas reglas?</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>
            <strong>XA / XB / N:</strong> ✓ = la TUAS se cobra a aeronaves con esa matrícula. ✗
            = están exentas.
          </p>
          <p>
            <strong>Pase exenta:</strong> ✓ = pasajeros con pase de abordar no pagan TUAS. ✗ =
            TUAS se cobra aunque tengan pase (Cozumel).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
