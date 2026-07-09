import { fmtDateOnly, fmtDateTimeShort } from "@/lib/datetime";
import { ImagePreview } from "@/components/admin/image-preview";
import Link from "next/link";
import { BeakerIcon } from "@heroicons/react/24/outline";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FuelAssignFlight } from "@/components/admin/expenses/fuel-assign-flight";
import { listFuelLoads, signFuelPhotos } from "@/lib/api/expenses-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listCards } from "@/lib/api/cards-server";
import { EmptyState } from "@/components/admin/empty-state";

export const dynamic = "force-dynamic";

export default async function CombustiblesPage() {
  const [{ data: loads, count }, aircraftRes, cardsRes] = await Promise.all([
    listFuelLoads(),
    listAircraft({ limit: 100 }),
    listCards({ limit: 50 }).catch(() => ({ data: [] })),
  ]);

  const matriculaById = new Map(aircraftRes.data.map((a) => [a.id, a.matricula]));
  const titularByTerminacion = new Map(
    cardsRes.data.map((c) => [c.terminacion, c.nombre_titular]),
  );
  const fotos = await signFuelPhotos(
    loads.map((l) => l.foto_url).filter((p): p is string => !!p),
  ).catch(() => ({}) as Record<string, string>);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Operación</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Combustibles</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {count} {count === 1 ? "carga registrada" : "cargas registradas"} (incluye las del mecánico).
        </p>
      </div>

      {loads.length === 0 ? (
        <EmptyState
            icon={BeakerIcon}
            title="Sin cargas de combustible"
            description="Las cargas que registre el mecánico (o los pilotos) aparecerán aquí, vinculadas a su aeronave y vuelo."
          />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Aeronave</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Litros</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">$/L</TableHead>
                  <TableHead>Lugar</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Recibo</TableHead>
                  <TableHead>Vuelo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loads.map((l) => {
                  const url = l.foto_url ? fotos[l.foto_url] : null;
                  const litros = l.litros != null ? Number(l.litros) : null;
                  const monto = Number(l.monto);
                  const costoLitro =
                    litros && litros > 0 && monto > 0 ? monto / litros : null;
                  const titular = l.tarjeta_terminacion
                    ? titularByTerminacion.get(l.tarjeta_terminacion)
                    : null;
                  return (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono text-sm">
                        {l.aeronave_id ? (matriculaById.get(l.aeronave_id) ?? "—") : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {l.fecha_hora_carga
                          ? fmtDateTimeShort(l.fecha_hora_carga)
                          : l.fecha_gasto
                            ? fmtDateOnly(l.fecha_gasto)
                            : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {l.tipo_combustible ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              l.tipo_combustible === "TURBOSINA"
                                ? "bg-sky-500/15 text-sky-600 dark:text-sky-300"
                                : "bg-amber-500/15 text-amber-600 dark:text-amber-300"
                            }`}
                          >
                            {l.tipo_combustible === "TURBOSINA" ? "Turbosina" : "Gasavión"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {litros != null
                          ? `${litros.toLocaleString("en-US", { maximumFractionDigits: 1 })} L`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {l.moneda} {monto.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {costoLitro != null ? `$${costoLitro.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono">{l.lugar ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {l.medio_pago === "TARJETA_CORP" && l.tarjeta_terminacion ? (
                          <span title={titular ?? undefined}>
                            •••• {l.tarjeta_terminacion}
                            {titular ? (
                              <span className="block text-[10px] text-muted-foreground">
                                {titular}
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          l.medio_pago
                        )}
                      </TableCell>
                      <TableCell>
                        {url ? (
                          <ImagePreview
                            src={url}
                            alt="Recibo de combustible"
                            thumbClassName="h-10 w-10 rounded-md object-cover ring-1 ring-border hover:ring-brand-500"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-col gap-1">
                          {l.vuelo_id ? (
                            <span className="space-x-2">
                              <Link
                                href={`/admin/flights/${l.vuelo_id}`}
                                className="text-brand-600 hover:underline"
                              >
                                Vuelo
                              </Link>
                              <Link
                                href={`/admin/quotes/${l.vuelo_id}`}
                                className="text-brand-600 hover:underline"
                              >
                                Cotización
                              </Link>
                            </span>
                          ) : null}
                          <FuelAssignFlight
                            gastoId={l.id}
                            aeronaveId={l.aeronave_id}
                            fechaHora={
                              l.fecha_hora_carga ??
                              (l.fecha_gasto ? `${l.fecha_gasto}T12:00:00Z` : null)
                            }
                            vueloActual={l.vuelo_id}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
