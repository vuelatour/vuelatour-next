import { BackLink } from "@/components/admin/back-link";
import { QuoteCalculator } from "@/components/admin/quotes/quote-calculator";
import { listClients } from "@/lib/api/clients-server";
import { listQuotes } from "@/lib/api/quotes-server";
import { cargarCatalogosCotizador } from "@/lib/api/quote-catalogos-server";

export const dynamic = "force-dynamic";

export default async function NewQuotePage() {
  const [catalogos, clientsRes, quotesRes] = await Promise.all([
    // Aeronaves, rutas y aeropuertos ya mapeados (fuente única con el
    // detalle de la cotización).
    cargarCatalogosCotizador(),
    listClients({ limit: 200, activo: true }),
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

  const clients = clientsRes.data.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    es_broker: c.es_broker,
    es_interno: c.es_interno,
    rfc: c.rfc,
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
        aircraft={catalogos.aircraft}
        routes={catalogos.routes}
        clients={clients}
        airports={catalogos.airports}
        frequentClientIds={frequentClientIds}
      />
    </div>
  );
}
