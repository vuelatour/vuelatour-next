import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { QuoteCalculator } from "@/components/admin/quotes/quote-calculator";
import { listAircraft } from "@/lib/api/aircraft";
import { listRoutes } from "@/lib/api/routes-server";
import { listClients } from "@/lib/api/clients-server";

export const dynamic = "force-dynamic";

export default async function NewQuotePage() {
  const [aircraftRes, routesRes, clientsRes] = await Promise.all([
    listAircraft({ limit: 100, activa: true }),
    listRoutes({ limit: 200, activa: true }),
    listClients({ limit: 200, activo: true }),
  ]);

  const aircraft = aircraftRes.data.map((a) => ({
    id: a.id,
    matricula: a.matricula,
    modelo: a.modelo,
    pais_registro: a.pais_registro,
    velocidad_crucero_kts: Number(a.velocidad_crucero_kts),
    tarifa_hora_pub_usd: a.tarifa_hora_pub_usd ? Number(a.tarifa_hora_pub_usd) : null,
    tarifa_hora_broker_usd: a.tarifa_hora_broker_usd ? Number(a.tarifa_hora_broker_usd) : null,
  }));

  const routes = routesRes.data.map((r) => ({
    id: r.id,
    origen_iata: r.origen_iata,
    destino_iata: r.destino_iata,
    millas_nauticas: Number(r.millas_nauticas),
    es_redondo_auto: r.es_redondo_auto,
    num_aterrizajes: r.num_aterrizajes,
  }));

  const clients = clientsRes.data.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    es_broker: c.es_broker,
    rfc: c.rfc,
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/quotes"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Cotizaciones
        </Link>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-2">
          Nueva cotización
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Calcula y guarda como v1. El cliente queda asociado al vuelo.
        </p>
      </div>
      <QuoteCalculator aircraft={aircraft} routes={routes} clients={clients} />
    </div>
  );
}
