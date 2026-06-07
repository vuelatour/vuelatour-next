import Link from "next/link";
import { ChevronRightIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
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
import { listFlights } from "@/lib/api/flights-server";
import { fmtUsd } from "@/lib/format";
import type { FlightListItem } from "@/types/flights";
import type { EstadoVuelo } from "@/types/quotes-persisted";

const ESTADO_LABEL: Record<EstadoVuelo, string> = {
  SOLICITUD: "Solicitud",
  COTIZADO: "Cotizado",
  CONFIRMADO: "Confirmado",
  EN_VUELO: "En vuelo",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado",
};

function estadoClass(estado: EstadoVuelo): string {
  switch (estado) {
    case "COMPLETADO":
      return "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/30";
    case "EN_VUELO":
    case "CONFIRMADO":
      return "bg-brand-600/15 text-brand-600 dark:text-brand-400 border-brand-600/30";
    case "CANCELADO":
      return "bg-destructive/15 text-destructive border-destructive/30";
    default:
      return "";
  }
}

function fmtFecha(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

const LIMIT = 25;

/** Historial de vuelos de la aeronave (expediente). Server component. */
export async function AircraftFlightsCard({ aircraftId }: { aircraftId: string }) {
  let flights: FlightListItem[] = [];
  let count = 0;
  try {
    const res = await listFlights({ aeronave_id: aircraftId, limit: LIMIT });
    flights = res.data;
    count = res.count;
  } catch {
    // Si falla la carga del historial, no rompemos todo el expediente.
    flights = [];
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <PaperAirplaneIcon className="h-4 w-4 text-muted-foreground" />
          Viajes
        </CardTitle>
        <CardDescription>
          {count === 0
            ? "Sin vuelos registrados para esta aeronave."
            : `${count} ${count === 1 ? "vuelo" : "vuelos"} en total` +
              (count > LIMIT ? ` · mostrando los ${LIMIT} más recientes` : "")}
        </CardDescription>
      </CardHeader>
      <CardContent className={flights.length === 0 ? "" : "p-0"}>
        {flights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Cuando se asignen vuelos a esta aeronave aparecerán aquí.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>Ruta</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-center">Pax</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-center">Estado</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flights.map((f) => (
                <TableRow key={f.id} className="group">
                  <TableCell className="font-mono text-sm">#{f.folio}</TableCell>
                  <TableCell className="font-medium">
                    {f.origen_iata} → {f.destino_iata}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtFecha(f.fecha_vuelo)}
                  </TableCell>
                  <TableCell className="text-center">{f.pasajeros}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {fmtUsd(f.monto_total_usd)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={estadoClass(f.estado)}>
                      {ESTADO_LABEL[f.estado]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/flights/${f.id}`}
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
        )}
      </CardContent>
    </Card>
  );
}
