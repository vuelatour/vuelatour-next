import Link from "next/link";
import { fmtDate } from "@/lib/datetime";
import { PaperAirplaneIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
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
import { FlightsFilterBar } from "@/components/admin/flights/flights-filter-bar";
import { NewExternalFlightButton } from "@/components/admin/flights/new-external-flight-button";
import { NewReservaButton } from "@/components/admin/flights/new-reserva-button";
import { listFlights, getTacoStatus } from "@/lib/api/flights-server";
import { listClients } from "@/lib/api/clients-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listUsers } from "@/lib/api/users-server";
import { listAirports } from "@/lib/api/airports-server";
import { fmtUsd } from "@/lib/format";
import type { EstadoVuelo } from "@/types/quotes-persisted";

export const dynamic = "force-dynamic";

const ESTADO_STYLES: Record<EstadoVuelo, string> = {
  RESERVA: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30",
  SOLICITUD: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  COTIZADO: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
  CONFIRMADO: "bg-brand-600/15 text-brand-600 dark:text-brand-400 border-brand-600/30",
  EN_VUELO: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  COMPLETADO: "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30",
  CANCELADO: "bg-destructive/15 text-destructive border-destructive/30",
};

const ESTADO_LABELS: Record<EstadoVuelo, string> = {
  RESERVA: "Reserva tentativa",
  SOLICITUD: "Solicitud",
  COTIZADO: "Cotizado",
  CONFIRMADO: "Confirmado",
  EN_VUELO: "En vuelo",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
};

interface FlightsPageProps {
  searchParams: Promise<{
    estado?: string;
    piloto_id?: string;
    aeronave_id?: string;
    desde?: string;
    hasta?: string;
  }>;
}

export default async function FlightsPage({ searchParams }: FlightsPageProps) {
  const sp = await searchParams;

  // Filtro default: vuelos activos (no solicitud/cotizado/cancelado).
  // Si el user no pasa estado, mostramos todos los operativos (CONFIRMADO+).
  const estadoFilter = sp.estado as EstadoVuelo | undefined;

  const [flightsRes, clientsRes, aircraftRes, pilotsRes, airportsRes] =
    await Promise.all([
      listFlights({
        estado: estadoFilter,
        piloto_id: sp.piloto_id || undefined,
        aeronave_id: sp.aeronave_id || undefined,
        desde: sp.desde || undefined,
        hasta: sp.hasta || undefined,
        limit: 200,
      }),
      listClients({ limit: 200, activo: true }),
      listAircraft({ limit: 100, activa: true }),
      listUsers({ rol: "PILOTO", limit: 50 }),
      listAirports({ limit: 200, activo: true }),
    ]);

  const clientsById = new Map(clientsRes.data.map((c) => [c.id, c]));
  const aircraftById = new Map(aircraftRes.data.map((a) => [a.id, a]));
  const pilotsById = new Map(pilotsRes.data.map((p) => [p.id, p]));

  // Vuelos = lifecycle operativo (CONFIRMADO en adelante).
  // Lo que está en SOLICITUD o COTIZADO vive en /admin/quotes.
  const operativos = estadoFilter
    ? flightsRes.data
    : flightsRes.data.filter(
        (v) => v.estado !== "SOLICITUD" && v.estado !== "COTIZADO",
      );

  // Tacómetro incompleto: solo importa en vuelos propios ya en curso/cerrados.
  const tacoRelevantes = operativos.filter(
    (v) => !v.es_externo && (v.estado === "EN_VUELO" || v.estado === "COMPLETADO"),
  );
  const tacoStatus = await getTacoStatus(tacoRelevantes.map((v) => v.id)).catch(
    () => ({}) as Record<string, { falta: boolean }>,
  );
  const faltaTaco = (id: string) => tacoStatus[id]?.falta === true;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-muted-foreground">Operación</p>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Vuelos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {operativos.length}{" "}
            {operativos.length === 1 ? "vuelo" : "vuelos"} en el rango.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <NewExternalFlightButton
            clients={clientsRes.data.map((c) => ({
              id: c.id,
              nombre: c.nombre,
              rfc: c.rfc,
            }))}
            airports={airportsRes.data.map((a) => ({
              iata: a.iata,
              nombre: a.nombre,
            }))}
          />
          <NewReservaButton
            clients={clientsRes.data.map((c) => ({
              id: c.id,
              nombre: c.nombre,
              rfc: c.rfc,
            }))}
            airports={airportsRes.data.map((a) => ({
              iata: a.iata,
              nombre: a.nombre,
            }))}
            aircraft={aircraftRes.data.map((a) => ({
              id: a.id,
              matricula: a.matricula,
              modelo: a.modelo,
            }))}
            pilots={pilotsRes.data.map((p) => ({ id: p.id, nombre: p.nombre }))}
          />
        </div>
      </div>

      <FlightsFilterBar
        aircraft={aircraftRes.data.map((a) => ({
          id: a.id,
          label: `${a.matricula} — ${a.modelo}`,
        }))}
        pilots={pilotsRes.data.map((p) => ({ id: p.id, nombre: p.nombre }))}
        initial={{
          estado: sp.estado ?? "",
          piloto_id: sp.piloto_id ?? "",
          aeronave_id: sp.aeronave_id ?? "",
          desde: sp.desde ?? "",
          hasta: sp.hasta ?? "",
        }}
      />

      {operativos.length === 0 ? (
        <Card>
          <CardHeader className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
                <PaperAirplaneIcon className="h-7 w-7 text-muted-foreground" />
              </div>
            </div>
            <CardTitle className="text-lg">Sin vuelos activos</CardTitle>
            <CardDescription>
              Cuando confirmes una cotización en{" "}
              <Link href="/admin/quotes" className="underline">
                Cotizaciones
              </Link>{" "}
              aparecerá aquí para asignar piloto, iniciar y completar.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Folio</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Ruta</TableHead>
                  <TableHead>Aeronave</TableHead>
                  <TableHead>Piloto</TableHead>
                  <TableHead>Fecha vuelo</TableHead>
                  <TableHead className="text-right">Total USD</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operativos.map((v) => {
                  const cli = clientsById.get(v.cliente_id);
                  const ac = v.aeronave_id ? aircraftById.get(v.aeronave_id) : null;
                  const piloto = v.piloto_id ? pilotsById.get(v.piloto_id) : null;
                  return (
                    <TableRow
                      key={v.id}
                      className="cursor-pointer hover:bg-muted/40"
                    >
                      <TableCell className="font-mono text-xs">
                        <Link href={`/admin/flights/${v.id}`} className="block">
                          #{v.folio}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/flights/${v.id}`} className="block">
                          <p className="font-medium text-sm">{cli?.nombre ?? "—"}</p>
                          {v.es_externo && (
                            <p className="text-[10px] text-muted-foreground">
                              Externo {v.operador_externo ?? ""}
                            </p>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        <Link href={`/admin/flights/${v.id}`} className="block">
                          {v.origen_iata} → {v.destino_iata}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Link href={`/admin/flights/${v.id}`} className="block">
                          {v.es_externo ? (
                            <Badge variant="outline" className="text-[10px]">
                              Externo
                            </Badge>
                          ) : ac ? (
                            <span className="font-mono">{ac.matricula}</span>
                          ) : (
                            <span className="text-muted-foreground">Sin asignar</span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Link href={`/admin/flights/${v.id}`} className="block">
                          {piloto?.nombre ?? (
                            <span className="text-muted-foreground">Sin asignar</span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs">
                        <Link href={`/admin/flights/${v.id}`} className="block">
                          {v.fecha_vuelo ? (
                            fmtDate(v.fecha_vuelo)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <Link href={`/admin/flights/${v.id}`} className="block">
                          {fmtUsd(v.monto_total_usd)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {faltaTaco(v.id) && (
                            <span
                              title="Tacómetro incompleto"
                              className="inline-flex items-center text-amber-600 dark:text-amber-400"
                            >
                              <ExclamationTriangleIcon className="h-4 w-4" />
                            </span>
                          )}
                          <Badge variant="outline" className={ESTADO_STYLES[v.estado]}>
                            {ESTADO_LABELS[v.estado]}
                          </Badge>
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
