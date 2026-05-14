import { QuoteCalculator } from "@/components/admin/quotes/quote-calculator";
import { listAircraft } from "@/lib/api/aircraft";
import { listRoutes } from "@/lib/api/routes-server";

export const dynamic = "force-dynamic";

export default async function QuotesPage() {
  const [aircraftRes, routesRes] = await Promise.all([
    listAircraft({ limit: 100, activa: true }),
    listRoutes({ limit: 200, activa: true }),
  ]);

  // Filtramos aviones sin tarifa configurada (N4142R, XB-ANU pendientes)
  // No los excluimos, pero los marcamos en el dropdown.
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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">Operación</p>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Cotizador</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Calcula vuelos sin persistir. Cuando confirmes el precio con el cliente, podrás guardar
          la cotización y emitir un PDF.
        </p>
      </div>
      <QuoteCalculator aircraft={aircraft} routes={routes} />
    </div>
  );
}
