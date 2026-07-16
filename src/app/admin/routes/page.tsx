import { MapIcon } from "@heroicons/react/24/outline";
import { Card, CardContent } from "@/components/ui/card";
import { RoutesTable } from "@/components/admin/routes/routes-table";
import { RouteCreateButton } from "@/components/admin/routes/route-create-button";
import { listRoutes } from "@/lib/api/routes-server";
import { listAirports } from "@/lib/api/airports-server";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

export default async function RoutesPage() {
  const [routesRes, airportsRes] = await Promise.all([
    listRoutes({ limit: 200, activa: undefined }),
    listAirports({ limit: 200, activo: true }),
  ]);
  const { data: routes, count } = routesRes;
  const airports = airportsRes.data.map((a) => ({
    iata: a.iata,
    nombre: a.nombre,
    latitud: a.latitud,
    longitud: a.longitud,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Flota</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Rutas predefinidas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {count} {count === 1 ? "ruta guardada" : "rutas guardadas"}. El cotizador las reusa para
            no recalcular millas náuticas. Editar una ruta aquí afecta solo a
            cotizaciones futuras: las existentes conservan sus tramos y precios.
          </p>
        </div>
        <RouteCreateButton airports={airports} />
      </div>

      {routes.length === 0 ? (
        <EmptyState
            icon={MapIcon}
            title="Sin rutas registradas"
            description="Crea la primera ruta para que el cotizador la reuse."
          />
      ) : (
        <Card>
          <CardContent className="p-0">
            <RoutesTable routes={routes} airports={airports} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
