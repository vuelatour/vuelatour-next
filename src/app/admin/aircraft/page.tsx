import Link from "next/link";
import { ChevronRightIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AircraftCreateButton } from "@/components/admin/aircraft/aircraft-create-button";
import { listAircraft } from "@/lib/api/aircraft";
import { fmtUsd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AircraftListPage() {
  const { data: aircraft, count } = await listAircraft({ limit: 100 });

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Flota</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Aeronaves</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {count} {count === 1 ? "avión" : "aviones"} en la flota
          </p>
        </div>
        <AircraftCreateButton />
      </div>

      {aircraft.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <PaperAirplaneIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Sin aeronaves registradas</CardTitle>
            <CardDescription>
              Cuando agregues aeronaves al sistema aparecerán aquí.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Matrícula</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>País</TableHead>
                  <TableHead className="text-center">Motores</TableHead>
                  <TableHead className="text-center">Pax</TableHead>
                  <TableHead className="text-right">USD/hr público</TableHead>
                  <TableHead className="text-right">USD/hr broker</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aircraft.map((a) => (
                  <TableRow key={a.id} className="group">
                    <TableCell className="font-mono font-semibold">{a.matricula}</TableCell>
                    <TableCell>{a.modelo}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {a.pais_registro}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{a.num_motores}</TableCell>
                    <TableCell className="text-center">{a.asientos}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtUsd(a.tarifa_hora_pub_usd)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtUsd(a.tarifa_hora_broker_usd)}
                    </TableCell>
                    <TableCell className="text-center">
                      {a.activa ? (
                        <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
                          Activa
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Inactiva</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/admin/aircraft/${a.id}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Ver
                        <ChevronRightIcon className="h-3.5 w-3.5" />
                      </Link>
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
