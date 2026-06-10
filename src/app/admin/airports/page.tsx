import { MapPinIcon, CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
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
import { AirportActions } from "@/components/admin/airports/airport-actions";
import { AirportCreateButton } from "@/components/admin/airports/airport-create-button";
import { listAirports } from "@/lib/api/airports-server";
import { fmtUsd } from "@/lib/format";
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>IATA</TableHead>
                  <TableHead>Nombre / Ciudad</TableHead>
                  <TableHead>País</TableHead>
                  <TableHead className="text-right">TUAS / pax</TableHead>
                  <TableHead className="text-center">XA</TableHead>
                  <TableHead className="text-center">XB</TableHead>
                  <TableHead className="text-center">N</TableHead>
                  <TableHead className="text-center">Pase exenta</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {airports.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-mono font-semibold">{a.iata}</div>
                      {a.icao && (
                        <div className="text-[10px] font-mono text-muted-foreground">
                          {a.icao}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{a.nombre}</div>
                      {a.ciudad && (
                        <div className="text-xs text-muted-foreground">{a.ciudad}</div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {a.pais}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtUsd(a.tuas_default_usd_pax)}
                    </TableCell>
                    <CheckCell value={a.tuas_aplica_xa} />
                    <CheckCell value={a.tuas_aplica_xb} />
                    <CheckCell value={a.tuas_aplica_n} />
                    <CheckCell value={a.tuas_pase_abordar_exenta} />
                    <TableCell className="text-center">
                      {a.activo ? (
                        <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
                          Activo
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactivo</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <AirportActions airport={a} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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

function CheckCell({ value }: { value: boolean }) {
  return (
    <TableCell className="text-center">
      {value ? (
        <CheckIcon className="h-4 w-4 text-green-600 inline" />
      ) : (
        <XMarkIcon className="h-4 w-4 text-muted-foreground inline" />
      )}
    </TableCell>
  );
}
