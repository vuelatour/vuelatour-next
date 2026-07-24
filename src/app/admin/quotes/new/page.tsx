import { BackLink } from "@/components/admin/back-link";
import { QuoteCalculator } from "@/components/admin/quotes/quote-calculator";
import { listAircraft } from "@/lib/api/aircraft";
import { listRoutes } from "@/lib/api/routes-server";
import { listClients } from "@/lib/api/clients-server";
import { listAirports } from "@/lib/api/airports-server";
import { listQuotes } from "@/lib/api/quotes-server";

export const dynamic = "force-dynamic";

export default async function NewQuotePage() {
  const [aircraftRes, routesRes, clientsRes, airportsRes, quotesRes] = await Promise.all([
    listAircraft({ limit: 100, activa: true }),
    listRoutes({ limit: 200, activa: true }),
    listClients({ limit: 200, activo: true }),
    listAirports({ limit: 200, activo: true }),
    // Para clientes frecuentes: la mayoría son recurrentes (pocos).
    listQuotes({ limit: 100 }).catch(() => ({ data: [] }) as { data: { cliente_id: string | null }[] }),
  ]);

  // Top de clientes por número de cotizaciones recientes (Itzel identifica el
  // tipo de vuelo por el nombre del cliente, ej. "Punta Pájaros").
  const conteo = new Map<string, number>();
  for (const q of quotesRes.data) {
    if (q.cliente_id) conteo.set(q.cliente_id, (conteo.get(q.cliente_id) ?? 0) + 1);
  }
  const frequentClientIds = [...conteo.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id]) => id);

  const aircraft = aircraftRes.data.map((a) => ({
    id: a.id,
    matricula: a.matricula,
    modelo: a.modelo,
    pais_registro: a.pais_registro,
    velocidad_crucero_kts: Number(a.velocidad_crucero_kts),
    asientos: Number(a.asientos) || 0,
    tarifa_hora_pub_usd: a.tarifa_hora_pub_usd ? Number(a.tarifa_hora_pub_usd) : null,
    tarifa_hora_broker_usd: a.tarifa_hora_broker_usd ? Number(a.tarifa_hora_broker_usd) : null,
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
      pasajeros: t.pasajeros,
      es_ferry: t.es_ferry,
      requiere_pernocta: t.requiere_pernocta,
      pernocta_costo_usd:
        t.pernocta_costo_usd != null ? Number(t.pernocta_costo_usd) : null,
      tipo_parada: t.tipo_parada,
      servicio_notas: t.servicio_notas,
    })),
  }));

  const clients = clientsRes.data.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    es_broker: c.es_broker,
    es_interno: c.es_interno,
    rfc: c.rfc,
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
        <BackLink href="/admin/quotes">Cotizaciones</BackLink>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-2">
          Nueva cotización
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Calcula y guarda como v1. El cliente queda asociado al vuelo.
        </p>
      </div>
      <QuoteCalculator
        aircraft={aircraft}
        routes={routes}
        clients={clients}
        airports={airports}
        frequentClientIds={frequentClientIds}
      />
    </div>
  );
}
