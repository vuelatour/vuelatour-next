import { MapIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RouteActions } from "@/components/admin/routes/route-actions";
import { RouteCreateButton } from "@/components/admin/routes/route-create-button";
import { listRoutes } from "@/lib/api/routes-server";
import { listAirports } from "@/lib/api/airports-server";
import { fmtDecimal } from "@/lib/format";

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
            no recalcular millas náuticas.
          </p>
        </div>
        <RouteCreateButton airports={airports} />
      </div>

      {routes.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <MapIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Sin rutas registradas</CardTitle>
            <CardDescription>
              Crea la primera ruta para que el cotizador la reuse.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Itinerario</TableHead>
                  <TableHead className="text-center">Tramos</TableHead>
                  <TableHead className="text-right">NM totales</TableHead>
                  <TableHead className="text-center">Aterrizajes</TableHead>
                  <TableHead>Fuente</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {routes.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.tipo === "MULTIESCALA" && r.tramos.length > 0 ? (
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
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.tramos.length > 0 ? (
                        <Badge className="bg-brand-600/15 text-brand-600 dark:text-brand-400 border-brand-600/30 text-[10px]">
                          {r.tramos.length} {r.tramos.length === 1 ? "tramo" : "tramos"}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">
                          Legacy
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtDecimal(r.millas_nauticas)}
                      {r.tipo === "SIMPLE" && r.es_redondo_auto && (
                        <span className="text-[10px] text-muted-foreground"> ×2</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm">
                      {r.num_aterrizajes}
                    </TableCell>
                    <TableCell>
                      {r.fuente ? (
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {r.fuente}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.activa ? (
                        <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
                          Activa
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactiva</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <RouteActions route={r} airports={airports} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
