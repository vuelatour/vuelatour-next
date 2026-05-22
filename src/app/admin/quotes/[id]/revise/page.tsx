import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { QuoteCalculator } from "@/components/admin/quotes/quote-calculator";
import { getQuote } from "@/lib/api/quotes-server";
import { getClient } from "@/lib/api/clients-server";
import { listAircraft } from "@/lib/api/aircraft";
import { listRoutes } from "@/lib/api/routes-server";
import { listAirports } from "@/lib/api/airports-server";
import { ApiError } from "@/lib/api/errors";

export const dynamic = "force-dynamic";

interface RevisePageProps {
  params: Promise<{ id: string }>;
}

export default async function ReviseQuotePage({ params }: RevisePageProps) {
  const { id } = await params;

  let quote;
  try {
    quote = await getQuote(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }

  // No se puede revisar fuera de SOLICITUD/COTIZADO — el backend igual rechaza,
  // pero atajamos en frontend para evitar entrar a un form que no se puede guardar.
  if (
    quote.estado !== "SOLICITUD" &&
    quote.estado !== "COTIZADO"
  ) {
    notFound();
  }

  const [aircraftRes, routesRes, airportsRes, client] = await Promise.all([
    listAircraft({ limit: 100, activa: true }),
    listRoutes({ limit: 200, activa: true }),
    listAirports({ limit: 200, activo: true }),
    getClient(quote.cliente_id).catch(() => null),
  ]);

  const aircraft = aircraftRes.data.map((a) => ({
    id: a.id,
    matricula: a.matricula,
    modelo: a.modelo,
    pais_registro: a.pais_registro,
    velocidad_crucero_kts: Number(a.velocidad_crucero_kts),
    tarifa_hora_pub_usd: a.tarifa_hora_pub_usd ? Number(a.tarifa_hora_pub_usd) : null,
    tarifa_hora_broker_usd: a.tarifa_hora_broker_usd
      ? Number(a.tarifa_hora_broker_usd)
      : null,
  }));

  const routes = routesRes.data.map((r) => ({
    id: r.id,
    tipo: r.tipo,
    origen_iata: r.origen_iata,
    destino_iata: r.destino_iata,
    millas_nauticas: Number(r.millas_nauticas),
    es_redondo_auto: r.es_redondo_auto,
    num_aterrizajes: r.num_aterrizajes,
    tramos: r.tramos.map((t) => ({
      origen_iata: t.origen_iata,
      destino_iata: t.destino_iata,
      millas_nauticas: Number(t.millas_nauticas),
    })),
  }));

  const airports = airportsRes.data.map((a) => ({
    iata: a.iata,
    nombre: a.nombre,
    latitud: a.latitud,
    longitud: a.longitud,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/quotes/${quote.id}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Cotización #{quote.folio}
        </Link>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-2">
          Revisar cotización
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Edita parámetros y agrega un motivo. Se generará la versión v
          {quote.cotizacion_version + 1} y la actual queda en el historial.
        </p>
      </div>
      <QuoteCalculator
        mode="revise"
        aircraft={aircraft}
        routes={routes}
        airports={airports}
        initialQuote={quote}
        clientName={client?.nombre ?? quote.cliente_id}
      />
    </div>
  );
}
