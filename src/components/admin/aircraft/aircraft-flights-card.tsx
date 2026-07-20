import Link from "next/link";
import { PaperAirplaneIcon } from "@heroicons/react/24/outline";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AircraftFlightsTable } from "@/components/admin/aircraft/aircraft-flights-table";
import { listFlights } from "@/lib/api/flights-server";
import type { FlightListItem } from "@/types/flights";

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
        <CardAction>
          <Link
            href={`/admin/flights?aeronave_id=${aircraftId}`}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Ver todos →
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className={flights.length === 0 ? "" : "p-0"}>
        {flights.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Cuando se asignen vuelos a esta aeronave aparecerán aquí.
          </p>
        ) : (
          <AircraftFlightsTable flights={flights} />
        )}
      </CardContent>
    </Card>
  );
}
