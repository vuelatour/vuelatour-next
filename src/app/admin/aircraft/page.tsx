import Link from "next/link";
import { ChevronRightIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aeronave</TableHead>
                  <TableHead>País</TableHead>
                  <TableHead className="text-center">Motores</TableHead>
                  <TableHead className="text-center">Pax</TableHead>
                  <TableHead className="text-right">USD/hr público</TableHead>
                  <TableHead className="text-right">USD/hr broker</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenadas.map((a) => {
                  const href = `/admin/aircraft/${a.id}`;
                  return (
                    // Toda la fila navega al detalle (Link block por celda,
                    // mismo patrón que la lista de Vuelos): más área de clic
                    // sin volver la tabla un client component.
                    <TableRow
                      key={a.id}
                      className={
                        "group cursor-pointer transition-colors hover:bg-muted/40" +
                        (a.activa ? "" : " opacity-60")
                      }
                    >
                      <TableCell>
                        <Link href={href} className="flex items-center gap-3">
                          {a.imagen_principal_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={a.imagen_principal_url}
                              alt={a.matricula}
                              className="h-10 w-14 shrink-0 rounded-md object-cover ring-1 ring-border"
                            />
                          ) : (
                            <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                              <PaperAirplaneIcon className="h-4 w-4" />
                            </div>
                          )}
                          <span>
                            <span className="block font-mono font-semibold group-hover:text-brand-600 transition-colors">
                              {a.matricula}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {a.modelo}
                            </span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={href} className="block">
                          <Badge variant="outline" className="font-mono text-xs">
                            {a.pais_registro}
                          </Badge>
                        </Link>
                      </TableCell>
                      <TableCell className="text-center">
                        <Link href={href} className="block">{a.num_motores}</Link>
                      </TableCell>
                      <TableCell className="text-center">
                        <Link href={href} className="block">{a.asientos}</Link>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <Link href={href} className="block">
                          {a.tarifa_hora_pub_usd ? (
                            fmtUsd(a.tarifa_hora_pub_usd)
                          ) : (
                            <span className="text-xs font-sans text-amber-600">Sin tarifa</span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        <Link href={href} className="block">
                          {a.tarifa_hora_broker_usd ? (
                            fmtUsd(a.tarifa_hora_broker_usd)
                          ) : (
                            <span className="text-xs font-sans text-amber-600">Sin tarifa</span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="text-center">
                        <Link href={href} className="block">
                          {a.activa ? (
                            <Badge className="bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
                              Activa
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Inactiva</Badge>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={href} className="block" aria-label={`Ver ${a.matricula}`}>
                          <ChevronRightIcon className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
