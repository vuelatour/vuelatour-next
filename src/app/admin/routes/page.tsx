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
import { fmtDecimal } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RoutesPage() {
  const { data: routes, count } = await listRoutes({ limit: 200, activa: undefined });

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
        <RouteCreateButton />
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
                  <TableHead>Ruta</TableHead>
                  <TableHead className="text-right">NM one-way</TableHead>
                  <TableHead className="text-center">Redondo auto</TableHead>
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
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmtDecimal(r.millas_nauticas)}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.es_redondo_auto ? (
                        <Badge variant="outline" className="text-xs">× 2 auto</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Total</Badge>
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
                      <RouteActions route={r} />
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
